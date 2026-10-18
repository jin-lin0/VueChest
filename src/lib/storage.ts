import { dbSet, dbRemove, dbGetAll, dbImportAll, dbApplyPatch } from './db'
import { errorMessage } from './error-message'
import { useToast } from '@/composables/useToast'

const cache = new Map<string, unknown>()
let initialized = false
let initPromise: Promise<void> | null = null

/**
 * 已经报过的落盘故障指纹。同一处故障只打扰用户一次 ——
 * `setStorage()` 是「每次改动都写一遍」的调用方式（音乐音量、工作区布局、应用市场开关……），
 * 配额打满之后每敲一下都会失败，不去重就是满屏红条把界面糊住。
 */
const reportedFaults = new Set<string>()

/**
 * 启动快照是否读取失败。此时只保留内存改动，避免数据库恢复后，
 * 把基于空缓存生成的默认配置覆盖到尚未读出的用户数据上。
 */
let degraded = false

/**
 * 把落盘故障送到用户眼前。
 *
 * 这些失败原先只进 `console.error`：界面一切正常，刷新之后新数据没了。
 * `useToast()` 在宿主注册前会先排队（见 useToast.ts），所以启动期的失败也送得到。
 * duration 给长一些：这几句话要求用户看懂并采取动作，3 秒读不完。
 */
function reportStorageFault(fingerprint: string, message: string): void {
  if (reportedFaults.has(fingerprint)) return
  reportedFaults.add(fingerprint)
  console.error(message)
  useToast().addToast('error', message, 10_000)
}

export const initStorage = async (): Promise<void> => {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const allData = await dbGetAll()
      Object.entries(allData).forEach(([key, value]) => cache.set(key, value))

      initialized = true
    } catch (error) {
      // 启动不再被阻断（读不到就当空库继续跑），但必须让用户知道：这一轮的改动不会落盘。
      // 「静默降级成纯内存模式」是这里最坏的选择 —— 用户会以为自己的编辑保存了。
      degraded = true
      reportStorageFault(
        'init',
        `本地数据库不可用（${errorMessage(error, '无法打开本地数据库')}），` +
          `本次会话的改动不会被保存，请检查浏览器存储设置后刷新重试，原有数据会保留`,
      )
      initialized = true
    }
  })()

  return initPromise
}

const toPlainObject = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value))
}

export function setStorage(key: string, value: unknown): void {
  cache.set(key, value)
  if (degraded) return
  dbSet(key, toPlainObject(value)).catch((error) => {
    // 内存缓存已经改了、磁盘没写成：这份改动只活在当前页面里，刷新即丢。
    reportStorageFault(
      `set:${key}`,
      `本地保存失败（${errorMessage(error, '写入被拒绝')}），` +
        `“${key}”的这次改动只留在当前页面，刷新后会丢失`,
    )
  })
}

/** 等待持久化成功后再更新内存缓存，用于安装、同步等必须确认写入的操作。 */
export async function applyStoragePatch(data: Record<string, unknown>): Promise<void> {
  assertStorageWritable()
  const snapshot = toPlainObject(data)
  await dbApplyPatch(snapshot)
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === null) cache.delete(key)
    else cache.set(key, value)
  }
}

export function getStorage<T>(key: string, defaultValue?: T): T | null {
  const value = cache.get(key)
  if (value !== undefined) return value as T
  return defaultValue ?? null
}

export function removeStorage(key: string): void {
  cache.delete(key)
  if (degraded) return
  dbRemove(key).catch((error) => {
    // 删没删掉和「改没改成」的后果不一样：磁盘上还在，刷新后会「复活」。
    reportStorageFault(
      `remove:${key}`,
      `本地删除失败（${errorMessage(error, '删除被拒绝')}），` + `刷新后“${key}”的数据可能重新出现`,
    )
  })
}

export async function removeStorageAsync(key: string): Promise<void> {
  assertStorageWritable()
  await dbRemove(key)
  cache.delete(key)
}

function assertStorageWritable(): void {
  if (degraded) throw new Error('本地数据未能加载，为保护原有数据，请刷新页面后重试')
}

export const exportAllData = async (): Promise<Record<string, unknown>> => {
  if (!initialized) await initStorage()
  const data: Record<string, unknown> = {}
  cache.forEach((value, key) => {
    data[key] = value
  })
  return data
}

export const importAllData = async (data: Record<string, unknown>): Promise<void> => {
  const snapshot = toPlainObject(data)
  // 先落盘、再改内存缓存 —— 与上面的 applyStoragePatch 是同一条约定。
  // 反过来（先 cache.clear() 再 await dbImportAll）的后果是：落盘失败时内存里已经是
  // **从未持久化**的新数据、磁盘上仍是旧数据，而唯一调用方 WorkspaceHome.handleImport()
  // 只在成功时刷新页面，于是用户会继续在假数据上操作。
  await dbImportAll(snapshot)
  cache.clear()
  Object.entries(snapshot).forEach(([key, value]) => {
    cache.set(key, value)
  })
  // 全量导入/重置是用户明确要求替换整库的操作，成功后已有可信的新快照。
  degraded = false
}
