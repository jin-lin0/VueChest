import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'vue-chest-db'
const DB_VERSION = 1
const STORE_NAME = 'key-value'

let dbInstance: IDBPDatabase | null = null
let initPromise: Promise<IDBPDatabase> | null = null

const getDB = (): Promise<IDBPDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance)
  if (initPromise) return initPromise

  initPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  }).then((db) => {
    dbInstance = db
    return db
  })

  return initPromise
}

export const dbSet = async (key: string, value: unknown): Promise<void> => {
  const db = await getDB()
  await db.put(STORE_NAME, value, key)
}

export const dbRemove = async (key: string): Promise<void> => {
  const db = await getDB()
  await db.delete(STORE_NAME, key)
}

/** 在同一事务中提交指定键的变更；null 表示删除，失败时整批回滚。 */
export const dbApplyPatch = async (data: Record<string, unknown>): Promise<void> => {
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const writes: Promise<unknown>[] = []
  try {
    for (const [key, value] of Object.entries(data)) {
      writes.push(value === null ? tx.store.delete(key) : tx.store.put(value, key))
    }
    await Promise.all([...writes, tx.done])
  } catch (error) {
    try {
      tx.abort()
    } catch {}
    await Promise.allSettled([...writes, tx.done])
    throw error
  }
}

export const dbGetAll = async (): Promise<Record<string, unknown>> => {
  const db = await getDB()
  const keys = await db.getAllKeys(STORE_NAME)
  const values = await db.getAll(STORE_NAME)
  const result: Record<string, unknown> = {}
  keys.forEach((key, i) => {
    result[key as string] = values[i]
  })
  return result
}

export const dbImportAll = async (data: Record<string, unknown>): Promise<void> => {
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  await store.clear()
  for (const [key, value] of Object.entries(data)) {
    await store.put(value, key)
  }
  await tx.done
}
