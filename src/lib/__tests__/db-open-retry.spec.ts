import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `openDB()` 失败后不能把那个被拒绝的 promise 留在缓存里。
 *
 * 旧写法是 `initPromise = openDB(...).then(...)`，一次**瞬时**失败（另一个标签页正在升级
 * 数据库、打开时配额检查没过、用户刚允许站点存储）之后，`initPromise` 会一直是一个已拒绝的
 * promise：此后每次读写都直接复用它、每次都失败，而且永远不会重试 ——
 * 一次瞬时故障被放大成「整个会话都不落盘」，只有刷新页面才有救。
 *
 * 这里用真实的 fake-indexeddb，只在 `openDB` 外面套一层「第一次必失败」的代理，
 * 其余行为（含 idb 自己打开数据库的过程）全部走真实实现。
 */

const state = { attempts: 0, failFirst: true }

vi.mock('idb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb')>()
  return {
    ...actual,
    openDB: async (...args: unknown[]) => {
      state.attempts += 1
      if (state.failFirst && state.attempts === 1) {
        throw new Error('AbortError: 数据库正被另一个标签页升级')
      }
      return (actual.openDB as (...a: unknown[]) => Promise<unknown>)(...args)
    },
  }
})

beforeEach(() => {
  vi.resetModules()
  state.attempts = 0
  state.failFirst = true
})

describe('db 打开失败的恢复', () => {
  it('启动快照读取失败后，即使数据库恢复，也不能用空缓存的默认值覆盖旧布局', async () => {
    state.failFirst = false
    const seed = await import('../db')
    await seed.dbSet('startup-layout', { custom: true })
    vi.resetModules()
    state.attempts = 0
    state.failFirst = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const storage = await import('../storage')
      await storage.initStorage()
      storage.setStorage('startup-layout', { default: true })
      const db = await import('../db')
      expect((await db.dbGetAll())['startup-layout']).toEqual({ custom: true })
      await db.dbRemove('startup-layout')
    } finally {
      log.mockRestore()
    }
  })

  it('第一次打开失败会向上抛出，下一次读写重新打开并成功', async () => {
    const { dbSet, dbGetAll } = await import('../db')

    await expect(dbGetAll()).rejects.toThrow('数据库正被另一个标签页升级')
    expect(state.attempts).toBe(1)

    // 关键断言：这里必须**重新 open**，而不是复用那个已拒绝的 promise
    await dbSet('music-volume', 55)
    expect(state.attempts).toBe(2)

    await expect(dbGetAll()).resolves.toEqual({ 'music-volume': 55 })
  })

  it('并发调用共用同一次打开：失败后两个调用方都拿到拒绝，且只尝试了一次', async () => {
    const { dbSet, dbRemove } = await import('../db')

    const results = await Promise.allSettled([dbSet('a', 1), dbRemove('b')])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(state.attempts).toBe(1)
  })

  it('成功之后不再重复打开（缓存的正常路径没被改坏）', async () => {
    state.failFirst = false
    const { dbSet, dbGetAll, dbRemove } = await import('../db')

    await dbSet('a', 1)
    await dbRemove('a')
    await dbGetAll()

    expect(state.attempts).toBe(1)
  })
})
