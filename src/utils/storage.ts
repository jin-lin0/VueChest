import { dbSet, dbRemove, dbClear, dbGetAll, dbImportAll } from './db'

const cache = new Map<string, unknown>()
let initialized = false
let initPromise: Promise<void> | null = null

export const initStorage = async (): Promise<void> => {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const allData = await dbGetAll()
      const hasDbData = Object.keys(allData).length > 0

      if (hasDbData) {
        Object.entries(allData).forEach(([key, value]) => {
          cache.set(key, value)
        })
      } else {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key) keys.push(key)
        }

        for (const key of keys) {
          const raw = localStorage.getItem(key)
          if (raw !== null) {
            try {
              cache.set(key, JSON.parse(raw))
            } catch {
              cache.set(key, raw)
            }
          }
        }

        if (cache.size > 0) {
          const data: Record<string, unknown> = {}
          cache.forEach((value, key) => {
            data[key] = value
          })
          await dbImportAll(data)
          localStorage.clear()
        }
      }

      initialized = true
    } catch (error) {
      console.error('初始化存储失败:', error)
      initialized = true
    }
  })()

  return initPromise
}

export function setStorage(key: string, value: unknown): void {
  cache.set(key, value)
  dbSet(key, value).catch((error) => {
    console.error('IndexedDB 写入失败:', error)
  })
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

export function clearStorage(): void {
  cache.clear()
  dbClear().catch((error) => {
    console.error('IndexedDB 清空失败:', error)
  })
}

export function hasStorage(key: string): boolean {
  return cache.has(key)
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
  await dbImportAll(data)
}
