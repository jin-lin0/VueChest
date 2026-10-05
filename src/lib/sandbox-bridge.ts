import { setStorage, removeStorage, removeStorageAsync } from '@/lib/storage'
import { dbGetAll } from '@/lib/db'
import { api } from '@/lib/request'
import { useToast, type ToastType } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { normalizePermissions, type SandboxPermission } from '@/lib/sandbox-permissions'

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
 *  - 除基础存储外，其余能力（通知 / 剪贴板 / 账号 / 云存储 / AI / 文件）都要求
 *    应用在 meta.permissions 里声明、且用户安装时已授权，否则直接拒绝。
 *  - 所有回包都带原请求 id，沙箱据此完成 Promise 结算。
 */

export interface SandboxCapabilities {
  /** 允许访问的网络域名白名单（host 名，支持 *.example.com）。必须显式声明才放行；缺省 / 空数组 = 默认拒绝一切网络。 */
  allowNetwork?: string[]
  /** 已授权的能力权限（来自应用 meta.permissions，经用户安装确认）。 */
  permissions?: SandboxPermission[]
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
/** AI 生成可能较慢，单独给更长的超时。 */
const AI_TIMEOUT = 90000
/** 沙箱应用单次可上传的文件大小上限。 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** 云存储单个 value 的序列化长度上限（字符）。 */
const MAX_CLOUD_VALUE_CHARS = 200_000

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

/** 每个能力对应的权限键；不在此表中的（storage.*）为基础能力，始终放行。 */
const CAPABILITY_PERMISSION: Record<string, SandboxPermission> = {
  notify: 'notify',
  'clipboard.write': 'clipboard',
  'clipboard.read': 'clipboard',
  profile: 'profile',
  'cloud.get': 'cloud',
  'cloud.set': 'cloud',
  'cloud.remove': 'cloud',
  'cloud.list': 'cloud',
  'ai.chat': 'ai',
  'files.upload': 'files',
}

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

function respondError(respond: (msg: unknown) => void, id: string | undefined, message: string) {
  respond({ kind: 'capability-response', id, error: message })
}

/** 写入系统剪贴板。沙箱 iframe 可能未持有焦点，原生 API 会抛错，退回 execCommand。 */
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 焦点不在宿主文档时（沙箱 iframe 持有焦点）会失败，继续走兜底方案
    }
  }
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.top = '-1000px'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    document.body.removeChild(el)
  }
  if (!copied) throw new Error('剪贴板写入被浏览器拒绝')
}

async function readClipboard(): Promise<string> {
  if (!navigator.clipboard?.readText) throw new Error('当前浏览器不支持读取剪贴板')
  return navigator.clipboard.readText()
}

/** 云存储 key 归一化：去空、限长，防止越权拼路径。 */
function normalizeCloudKey(raw: unknown): string {
  const key = String(raw ?? '').trim()
  if (!key) throw new Error('云存储 key 不能为空')
  if (key.length > 120) throw new Error('云存储 key 过长（上限 120 字符）')
  return key
}

const TOAST_LEVELS = new Set<ToastType>(['success', 'error', 'warning', 'info'])

/** 处理一条来自沙箱应用的消息（异步：新能力需要等待网络 / 宿主 API）。 */
export async function handleSandboxMessage(
  msg: unknown,
  appId: string | number,
  caps: SandboxCapabilities,
  respond: (msg: unknown) => void,
): Promise<void> {
  if (!msg || typeof msg !== 'object' || !('kind' in msg)) return
  const message = msg as SandboxMessage

  if (message.kind === 'capability') {
    const { id, name = '', args = [] } = message
    try {
      await dispatchCapability(name, args, appId, caps, respond, id)
    } catch (error: unknown) {
      respondError(respond, id, errorMessage(error, String(error)))
    }
    return
  }

  if (message.kind === 'fetch' && message.id && message.url) {
    handleSandboxFetch(message.id, message.url, message.options, caps, respond)
  }
}

async function dispatchCapability(
  name: string,
  args: unknown[],
  appId: string | number,
  caps: SandboxCapabilities,
  respond: (msg: unknown) => void,
  id: string | undefined,
): Promise<void> {
  // 基础存储能力不需要声明权限；其余能力必须先声明且已授权。
  const required = CAPABILITY_PERMISSION[name]
  if (required && !normalizePermissions(caps.permissions).includes(required)) {
    respondError(respond, id, `未授权的能力: ${name}（应用需声明 ${required} 权限并经用户确认）`)
    return
  }

  const ok = (value: unknown) => respond({ kind: 'capability-response', id, value })

  switch (name) {
    case 'storage.set': {
      const key = String(args[0])
      const storageKey = HOST_SHARED_KEYS.includes(key) ? key : sandboxStorageKey(appId, key)
      setStorage(storageKey, args[1])
      ok(true)
      return
    }
    case 'storage.remove': {
      const key = String(args[0])
      const storageKey = HOST_SHARED_KEYS.includes(key) ? key : sandboxStorageKey(appId, key)
      removeStorage(storageKey)
      ok(true)
      return
    }
    case 'notify': {
      const payload = (args[0] || {}) as { title?: unknown; body?: unknown; level?: unknown }
      const text = String(payload.body ?? payload.title ?? '').trim().slice(0, 200)
      if (!text) throw new Error('通知内容不能为空')
      const level = TOAST_LEVELS.has(payload.level as ToastType)
        ? (payload.level as ToastType)
        : 'info'
      const { addToast } = useToast()
      addToast(level, text)
      ok(true)
      return
    }
    case 'clipboard.write': {
      await writeClipboard(String(args[0] ?? ''))
      ok(true)
      return
    }
    case 'clipboard.read': {
      ok(await readClipboard())
      return
    }
    case 'profile': {
      const auth = useAuthStore()
      if (!auth.user) throw new Error('该能力需要登录后使用')
      ok({ id: auth.user.id, username: auth.user.username, avatar: auth.user.avatar || null })
      return
    }
    case 'cloud.get': {
      const key = normalizeCloudKey(args[0])
      const res = await api.get<{ data: { value: unknown } }>(
        `/api/app-data/${appId}/${encodeURIComponent(key)}`,
      )
      ok(res.data?.value ?? null)
      return
    }
    case 'cloud.set': {
      const key = normalizeCloudKey(args[0])
      const serialized = JSON.stringify(args[1] ?? null)
      if (serialized.length > MAX_CLOUD_VALUE_CHARS) {
        throw new Error(`云存储单条数据过大（上限 ${MAX_CLOUD_VALUE_CHARS} 字符）`)
      }
      await api.put(`/api/app-data/${appId}/${encodeURIComponent(key)}`, { value: args[1] ?? null })
      ok(true)
      return
    }
    case 'cloud.remove': {
      const key = normalizeCloudKey(args[0])
      await api.delete(`/api/app-data/${appId}/${encodeURIComponent(key)}`)
      ok(true)
      return
    }
    case 'cloud.list': {
      const res = await api.get<{ data: { items: { key: string; updatedAt: string }[] } }>(
        `/api/app-data/${appId}`,
      )
      ok(res.data?.items || [])
      return
    }
    case 'ai.chat': {
      const payload = (args[0] || {}) as { messages?: unknown; model?: unknown }
      const raw = Array.isArray(payload.messages) ? payload.messages : []
      const messages = raw
        .slice(-20)
        .map((item) => {
          const row = (item || {}) as { role?: unknown; content?: unknown }
          return {
            role: row.role === 'assistant' ? 'assistant' : row.role === 'system' ? 'system' : 'user',
            content: String(row.content ?? '').slice(0, 8000),
          }
        })
        .filter((item) => item.content.trim())
      if (messages.length === 0) throw new Error('messages 不能为空')
      const res = await api.post<{ data: { content: string; model: string } }>(
        '/api/app-ai/chat',
        {
          appId: Number(appId),
          messages,
          ...(payload.model ? { model: String(payload.model) } : {}),
        },
        { timeoutMs: AI_TIMEOUT },
      )
      ok({ content: res.data.content, model: res.data.model })
      return
    }
    case 'files.upload': {
      const payload = (args[0] || {}) as { name?: unknown; contentType?: unknown; data?: unknown }
      const buffer = payload.data
      if (!(buffer instanceof ArrayBuffer)) throw new Error('文件数据无效')
      if (buffer.byteLength === 0) throw new Error('文件内容为空')
      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error(`文件过大（上限 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）`)
      }
      const contentType = String(payload.contentType || 'application/octet-stream').slice(0, 100)
      const name = String(payload.name || 'file').slice(0, 120)
      const presign = await api.post<{
        data: { key: string; uploadUrl: string; headers?: Record<string, string> }
      }>('/api/uploads/presign', {
        kind: 'appfile',
        appId: Number(appId),
        contentType,
        size: buffer.byteLength,
        name,
      })
      const uploaded = await fetch(presign.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, ...(presign.data.headers || {}) },
        body: buffer,
      })
      if (!uploaded.ok) throw new Error('文件上传失败')
      const done = await api.post<{
        data: { key: string; url: string; size: number; contentType: string }
      }>('/api/uploads/complete', { kind: 'appfile', key: presign.data.key })
      ok({
        key: done.data.key,
        url: done.data.url,
        size: done.data.size,
        contentType: done.data.contentType,
      })
      return
    }
    default:
      respondError(respond, id, `未授权的能力: ${name}`)
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
