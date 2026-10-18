import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `dbGetAll()` 必须给出**一致快照**。
 *
 * 旧写法是 `await db.getAllKeys(store)` 再 `await db.getAll(store)` —— 在 idb 里这是
 * **两个独立事务**，各自取一次当前状态。中间只要有一次写入落地，两个数组就会错位：
 *
 *     keys   = [k1, k2, k3, k4, k5]      ← 写入前读的
 *     values = [v0, v1, v2, v3, v4, v5]  ← 写入后读的（多了一条排在最前的 k0）
 *     → { k1: v0, k2: v1, k3: v2, k4: v3, k5: v4 }   每个 key 都拿到了别人的值
 *
 * 这不是理论竞态：同一标签页里 `setStorage()`（音乐播放器音量、工作区配置的 watch、
 * 应用市场开关……）随时可能落库，而 `collectSandboxStorage()` 恰好在打开市场应用时
 * 走 `dbGetAll()`。按 key 前缀切快照的沙箱存储，错位后会把**别的应用的值**注入到
 * 本应用名下，直接破坏 `sandbox-bridge.ts` 开头声明的「应用之间互相读写数据」隔离。
 */

const STORE = 'key-value'
const DB_NAME = 'vue-chest-db'

/** 待注入的「并发写入」；只生效一次。 */
const hooks: { beforeValuesRead?: () => Promise<void> } = {}

/**
 * 为什么要 mock `idb`：缺陷本身就是「values 走了一次**单独的** `db.getAll()` 事务」。
 * 这个缝在真实 IndexedDB 上无法从外部精确命中（写入必须恰好落在两次读之间），
 * 所以这里只在 `openDB` 外面套一层代理，把「读完 keys、即将读 values」这一刻暴露出来，
 * 其余 API 全部原样委托给真实实现（fake-indexeddb + idb），不改变被测代码的行为。
 *
 * 修好之后 `dbGetAll` 只走 `db.transaction()`，`db.getAll` 不再被调用 —— 缝自然消失。
 */
vi.mock('idb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb')>()
  return {
    ...actual,
    openDB: async (...args: unknown[]) => {
      const raw = await (actual.openDB as (...a: unknown[]) => Promise<object>)(...args)
      return new Proxy(raw, {
        get(target, prop) {
          if (prop === 'getAll') {
            return async (storeName: string, ...rest: unknown[]) => {
              const hook = hooks.beforeValuesRead
              hooks.beforeValuesRead = undefined
              if (hook) await hook()
              const method = (target as Record<string, unknown>).getAll as (
                ...a: unknown[]
              ) => unknown
              return method.call(target, storeName, ...rest)
            }
          }
          const value = (target as Record<string | symbol, unknown>)[prop]
          return typeof value === 'function'
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value
        },
      })
    },
  }
})

const { dbGetAll, dbSet } = await import('../db')
const { openDB } = await import('idb')

beforeEach(async () => {
  const db = await openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    },
  })
  await db.clear(STORE)
})

afterEach(() => {
  hooks.beforeValuesRead = undefined
})

describe('dbGetAll 的一致性', () => {
  it('读 keys 与读 values 之间落库的写入，不得让 key 与 value 错配', async () => {
    const keys = [
      'sandbox:1:todo',
      'sandbox:2:secret',
      'sandbox:2:note',
      'sandbox:3:settings',
      'host:workspace',
    ]
    for (const key of keys) await dbSet(key, { owner: key })

    // 模拟「另一次 setStorage 恰好在两次读之间提交」
    hooks.beforeValuesRead = async () => {
      await dbSet('sandbox:0:injected', { owner: 'sandbox:0:injected' })
    }

    const all = await dbGetAll()

    // 不变量：快照里每个 key 的取值只能是它自己写进去的那个
    for (const [key, value] of Object.entries(all)) {
      expect(value, `${key} 拿到了别的 key 的值`).toEqual({ owner: key })
    }
    for (const key of keys) {
      expect(Object.keys(all), `快照丢了 ${key}`).toContain(key)
    }
  })

  it('keys 与 values 来自同一个事务（否则中间必然存在可被写入命中的窗口）', async () => {
    await dbSet('k1', 'v1')
    await dbSet('k2', 'v2')

    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction')
    try {
      const all = await dbGetAll()
      expect(all).toEqual({ k1: 'v1', k2: 'v2' })
      expect(
        spy.mock.calls.length,
        'dbGetAll 开了不止一个事务：keys 与 values 是两次独立快照',
      ).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})
