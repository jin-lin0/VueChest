import { dbSet, dbRemove, dbGetAll, dbImportAll, dbApplyPatch } from './db'
import { errorMessage } from './error-message'
import { useToast } from '@/composables/useToast'

const cache = new Map<string, unknown>()
let initialized = false
let initPromise: Promise<void> | null = null

/** 同一持久化故障只提示一次，避免高频写入重复报错。 */
const reportedFaults = new Set<string>()

/** 启动读取失败时禁止落盘，避免空缓存覆盖尚未读出的原有数据。 */
let degraded = false

/** 启动期故障通过 Toast 队列补发，并延长展示时间。 */
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
  // 持久化成功后再替换缓存，失败时保留原有内存数据。
  await dbImportAll(snapshot)
  cache.clear()
  Object.entries(snapshot).forEach(([key, value]) => {
    cache.set(key, value)
  })
  // 全量导入/重置是用户明确要求替换整库的操作，成功后已有可信的新快照。
  degraded = false
}
