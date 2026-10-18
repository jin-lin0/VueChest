import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'


const STORE = 'key-value'
const DB_NAME = 'vue-chest-db'

/** 待注入的「并发写入」；只生效一次。 */
const hooks: { beforeValuesRead?: () => Promise<void> } = {}

/**
 * 在独立读取 keys 与 values 之间插入写入，其余操作交给真实 idb 和 fake-indexeddb。
 * 同一事务读取应避免该快照错位。
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
