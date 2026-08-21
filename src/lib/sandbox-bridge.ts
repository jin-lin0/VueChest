import { setStorage, removeStorage, removeStorageAsync } from '@/lib/storage'
import { dbGetAll } from '@/lib/db'

/**
 * 市场应用沙箱的宿主侧能力桥。
 *
 * 沙箱应用运行在 iframe（sandbox="allow-scripts"）内的 opaque origin 中，
 * 无法直接访问宿主的 IndexedDB / 主题 / 网络。本模块负责把沙箱通过
 * postMessage 发来的受限能力请求，翻译成宿主侧带有白名单 / 命名空间约束的调用。
 *
 * 原则：
 *  - 存储按 appId 命名空间隔离，杜绝应用之间互相读写数据。
 *  - 网络默认拒绝，仅当应用声明了 allowNetwork 白名单域名时才放行。
 *  - 所有回包都带原请求 id，沙箱据此完成 Promise 结算。
 */

export interface SandboxCapabilities {
  /** 允许访问的网络域名白名单（host 名，支持 *.example.com）。必须显式声明才放行；缺省 / 空数组 = 默认拒绝一切网络。 */
  allowNetwork?: string[]
}

interface SandboxMessage {
  kind: string
  id?: string
  name?: string
  args?: unknown[]
  url?: string
  options?: RequestInit
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/** 单次网络请求的超时（毫秒），防止沙箱应用挂起父页面请求。 */
const NETWORK_TIMEOUT = 15000

/** 某应用在宿主存储中的命名空间前缀键。 */
function sandboxStorageKey(appId: string | number, key: string): string {
  return `sandbox:${appId}:${key}`
}

/**
 * 宿主共享存储键白名单。
 * 这些键在沙箱写入时不做 appId 命名空间隔离，直接以裸 key 落库，
 * 以便宿主（如首页）能跨应用读取。目前仅 special-days 的 special_days 需要此能力。
 */
export const HOST_SHARED_KEYS = ['special_days']

function hostAllowed(host: string, whitelist: string[]): boolean {
  return whitelist.some((rule) => {
    if (rule.startsWith('*.')) return host.endsWith(rule.slice(1))
    return host === rule
  })
}

/** 收集某应用命名空间内的存储快照，供沙箱引导时一次性注入（读操作在沙箱内同步）。 */
export async function collectSandboxStorage(appId: string | number): Promise<Record<string, unknown>> {
  const prefix = `sandbox:${appId}:`
  const all = await dbGetAll()
  const snapshot: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(prefix)) snapshot[key.slice(prefix.length)] = value
  }
  // 宿主共享键以裸 key 提供（无 appId 前缀），供沙箱同步读取自己的共享数据
  for (const sharedKey of HOST_SHARED_KEYS) {
    if (sharedKey in all) snapshot[sharedKey] = all[sharedKey]
  }
  return snapshot
}

export interface SandboxStorageInfo {
  entries: number
  bytes: number
  data: Record<string, unknown>
}

export async function inspectSandboxStorage(
  appId: string | number,
): Promise<SandboxStorageInfo> {
  const data = await collectSandboxStorage(appId)
  // 共享宿主键不属于单个应用，管理页不展示也不删除。
  HOST_SHARED_KEYS.forEach((key) => delete data[key])
  const serialized = JSON.stringify(data)
  return {
    entries: Object.keys(data).length,
    bytes: new Blob([serialized]).size,
    data,
  }
}

export async function clearSandboxStorage(appId: string | number): Promise<number> {
  const prefix = `sandbox:${appId}:`
  const all = await dbGetAll()
  const keys = Object.keys(all).filter((key) => key.startsWith(prefix))
  await Promise.all(keys.map((key) => removeStorageAsync(key)))
  return keys.length
}

/**
 * 处理一条来自沙箱应用的消息。
 * @param msg        沙箱发来的消息对象
 * @param appId      当前应用 id（用于存储命名空间）
 * @param caps       能力白名单
 * @param respond    回包函数（把响应 postMessage 回沙箱）
 */
export function handleSandboxMessage(
  msg: unknown,
  appId: string | number,
  caps: SandboxCapabilities,
  respond: (msg: unknown) => void,
): void {
  if (!msg || typeof msg !== 'object' || !('kind' in msg)) return
  const message = msg as SandboxMessage

  if (message.kind === 'capability') {
    const { id, name, args = [] } = message
    try {
      switch (name) {
        case 'storage.set': {
          const key = String(args[0])
          const storageKey = HOST_SHARED_KEYS.includes(key) ? key : sandboxStorageKey(appId, key)
          setStorage(storageKey, args[1])
          respond({ kind: 'capability-response', id, value: true })
          break
        }
        case 'storage.remove': {
          const key = String(args[0])
          const storageKey = HOST_SHARED_KEYS.includes(key) ? key : sandboxStorageKey(appId, key)
          removeStorage(storageKey)
          respond({ kind: 'capability-response', id, value: true })
          break
        }
        default:
          respond({ kind: 'capability-response', id, error: `未授权的能力: ${name}` })
      }
    } catch (error: unknown) {
      respond({ kind: 'capability-response', id, error: errorMessage(error, String(error)) })
    }
    return
  }

  if (message.kind === 'fetch' && message.id && message.url) {
    handleSandboxFetch(message.id, message.url, message.options, caps, respond)
  }
}

async function handleSandboxFetch(
  id: string,
  url: string,
  options: RequestInit | undefined,
  caps: SandboxCapabilities,
  respond: (msg: unknown) => void,
): Promise<void> {
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    respond({ kind: 'capability-response', id, error: '非法 URL' })
    return
  }

  const whitelist = caps.allowNetwork ?? null
  if (!whitelist || !hostAllowed(host, whitelist)) {
    respond({ kind: 'capability-response', id, error: `网络请求被白名单拒绝: ${host}` })
    return
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT)
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)

    const body = await res.arrayBuffer()
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      headers[k] = v
    })
    // 注意：沙箱侧只监听 'capability-response'（其 isFetch 分支已处理 headers/body/status），
    // 所以 fetch 成功回包也必须用 'capability-response' 这个 kind，否则 Promise 会永久 pending。
    respond({
      kind: 'capability-response',
      id,
      status: res.status,
      statusText: res.statusText,
      headers,
      body: Array.from(new Uint8Array(body)),
    })
  } catch (error: unknown) {
    respond({ kind: 'capability-response', id, error: errorMessage(error, '网络请求失败') })
  }
}
