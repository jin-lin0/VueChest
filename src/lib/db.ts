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
  })
    .then((db) => {
      dbInstance = db
      return db
    })
    .catch((error) => {
      // 失败必须把缓存的 promise 清掉，否则这一个被拒绝的 promise 会被复用整个会话：
      // 一次**瞬时**的 open 失败（另一个标签页正在升级数据库、打开时配额检查没过、
      // 用户刚允许站点存储）就变成「此后每次读写都用同一个已拒绝的 promise」——
      // 所有改动都不落盘，而且再也不会重试，只有刷新页面才有救。
      // 清掉之后下一次读写会重新 open；真正的持久性失败（隐私模式禁用存储）仍然每次
      // 都失败，只是多花一次快速失败的 open，且上报侧按指纹去重，不会刷屏。
      initPromise = null
      throw error
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

/**
 * 读出全部键值。
 *
 * keys 与 values 必须在**同一个只读事务**里读。曾经写成
 * `await db.getAllKeys(STORE)` 再 `await db.getAll(STORE)` —— 在 idb 里这是两个独立事务、
 * 两次快照，中间只要有一次写入落库，两个数组就会错位：
 *
 *     keys   = [k1, k2, k3, k4, k5]      写入前读的
 *     values = [v0, v1, v2, v3, v4, v5]  写入后读的（多了一条排在最前的 k0）
 *     → { k1: v0, k2: v1, k3: v2, k4: v3, k5: v4 }  每个 key 都拿到别人的值
 *
 * 这不是理论竞态：同一标签页里 `setStorage()`（音乐音量、工作区配置的 watch、
 * 应用市场开关……）随时可能落库，而打开市场应用时 `collectSandboxStorage()` 正走这里。
 * 沙箱存储靠 key 前缀 `sandbox:<appId>:` 切快照，错位后会把**别的应用的值**注入到
 * 本应用名下，破坏 sandbox-bridge 声明的命名空间隔离。
 */
export const dbGetAll = async (): Promise<Record<string, unknown>> => {
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const result: Record<string, unknown> = {}
  try {
    // 两个请求在同一事务内一次性发出，因此读到的是同一个快照
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()])
    await tx.done
    keys.forEach((key, i) => {
      result[key as string] = values[i]
    })
  } catch (error) {
    // 只读事务无需回滚，但必须吃掉 tx.done 的 rejection，否则会变成 unhandled rejection
    await Promise.allSettled([tx.done])
    throw error
  }
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
