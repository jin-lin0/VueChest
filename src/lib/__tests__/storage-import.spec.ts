import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `importAllData()` 必须先落盘、再改内存缓存。
 *
 * 仓库里已有这个约定：`applyStoragePatch()` 的注释写着「等待持久化成功后再更新内存缓存，
 * 用于安装、同步等必须确认写入的操作」。`importAllData()` 原先反着来 —— 先 `cache.clear()`
 * 再灌新数据，最后才 `await dbImportAll()`。`dbImportAll` 一旦失败（备份过大触发配额、
 * 浏览器拒绝持久化），内存里已经是**从未落库的新数据**，磁盘上仍是旧数据，而唯一调用方
 * `WorkspaceHome.handleImport()` 只在成功时刷新页面，于是用户会继续在假数据上操作。
 */

const mocks = vi.hoisted(() => ({
  dbGetAll: vi.fn(),
  dbSet: vi.fn(),
  dbRemove: vi.fn(),
  dbImportAll: vi.fn(),
  dbApplyPatch: vi.fn(),
}))

vi.mock('@/lib/db', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.dbGetAll.mockResolvedValue({})
  mocks.dbSet.mockResolvedValue(undefined)
  mocks.dbRemove.mockResolvedValue(undefined)
  mocks.dbImportAll.mockResolvedValue(undefined)
  mocks.dbApplyPatch.mockResolvedValue(undefined)
})

/** 每个用例都重新加载模块，绕开 `initStorage` 的「只初始化一次」标记。 */
async function loadStorage() {
  return import('../storage')
}

describe('importAllData 的提交顺序', () => {
  it('落盘失败时不得动内存缓存，旧数据必须原样保留', async () => {
    mocks.dbGetAll.mockResolvedValue({ keep: { original: true } })
    const { getStorage, importAllData, initStorage } = await loadStorage()
    await initStorage()
    expect(getStorage('keep')).toEqual({ original: true })

    mocks.dbImportAll.mockRejectedValue(new Error('QuotaExceededError'))
    await expect(importAllData({ replaced: { fresh: true } })).rejects.toThrow('QuotaExceededError')

    // 磁盘没写成 → 内存也不许改：不能出现「内存新、磁盘旧」的分裂状态
    expect(getStorage('keep')).toEqual({ original: true })
    expect(getStorage('replaced')).toBeNull()
    expect(mocks.dbImportAll).toHaveBeenCalledTimes(1)
  })

  it('落盘成功后才替换内存缓存', async () => {
    mocks.dbGetAll.mockResolvedValue({ old: 1 })
    const { getStorage, importAllData, initStorage } = await loadStorage()
    await initStorage()

    await importAllData({ fresh: 2 })

    expect(mocks.dbImportAll).toHaveBeenCalledWith({ fresh: 2 })
    expect(getStorage('fresh')).toBe(2)
    expect(getStorage('old')).toBeNull()
  })

  it('先落盘、后改缓存：dbImportAll 结算之前缓存不得被改过', async () => {
    mocks.dbGetAll.mockResolvedValue({ old: 1 })
    const { getStorage, importAllData, initStorage } = await loadStorage()
    await initStorage()

    let cacheDuringPersist: unknown = 'unset'
    mocks.dbImportAll.mockImplementation(async () => {
      cacheDuringPersist = getStorage('old')
    })

    await importAllData({ fresh: 2 })

    expect(cacheDuringPersist, '落盘期间旧缓存已被清掉，说明是「先改内存」').toBe(1)
  })
})
