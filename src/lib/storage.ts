import { dbSet, dbRemove, dbGetAll, dbImportAll, dbApplyPatch } from './db'

const cache = new Map<string, unknown>()
let initialized = false
let initPromise: Promise<void> | null = null

export const initStorage = async (): Promise<void> => {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const allData = await dbGetAll()
      Object.entries(allData).forEach(([key, value]) => cache.set(key, value))

      initialized = true
    } catch (error) {
      console.error('初始化存储失败:', error)
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
  dbSet(key, toPlainObject(value)).catch((error) => {
    console.error('IndexedDB 写入失败:', error)
  })
}

/** 等待持久化成功后再更新内存缓存，用于安装、同步等必须确认写入的操作。 */
export async function applyStoragePatch(data: Record<string, unknown>): Promise<void> {
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
  dbRemove(key).catch((error) => {
    console.error('IndexedDB 删除失败:', error)
  })
}

export async function removeStorageAsync(key: string): Promise<void> {
  cache.delete(key)
  await dbRemove(key)
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
  cache.clear()
  Object.entries(data).forEach(([key, value]) => {
    cache.set(key, value)
  })
  await dbImportAll(toPlainObject(data))
}
