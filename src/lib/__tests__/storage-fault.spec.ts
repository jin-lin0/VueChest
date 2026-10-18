import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 宿主侧的落盘失败必须看得见。
 *
 * 这些 catch 原先只写 `console.error`：界面照常，用户以为存住了，刷新之后新数据没了。
 * 两类要盯的行为：
 *   1. 首次失败**必须**弹一次（这才是修复本身）；
 *   2. 同一指纹只弹一次 —— `setStorage()` 是「每次改动都写一遍」的调用方式，
 *      配额打满后不去重就是满屏红条；`initStorage()` 失败更会让后面每一次写入
 *      都变成同一根因的重复症状，所以那种情况下按 key 逐个弹是错的。
 */

const mocks = vi.hoisted(() => ({
  db: {
    dbGetAll: vi.fn(),
    dbSet: vi.fn(),
    dbRemove: vi.fn(),
    dbImportAll: vi.fn(),
    dbApplyPatch: vi.fn(),
  },
  addToast: vi.fn(),
}))

vi.mock('@/lib/db', () => mocks.db)
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ addToast: mocks.addToast, removeToast: vi.fn() }),
}))

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  // 上报同时写控制台（线上排障要看），用例里先吞掉，需要时再断言
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.db.dbGetAll.mockResolvedValue({})
  mocks.db.dbSet.mockResolvedValue(undefined)
  mocks.db.dbRemove.mockResolvedValue(undefined)
  mocks.db.dbImportAll.mockResolvedValue(undefined)
  mocks.db.dbApplyPatch.mockResolvedValue(undefined)
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

async function loadStorage() {
  return import('../storage')
}

/** setStorage/removeStorage 的失败处理挂在 promise 的 catch 上，等一轮宏任务。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('落盘失败的上报', () => {
  it('初始化失败：报一次，且不阻断启动（读不到就当空库继续跑）', async () => {
    mocks.db.dbGetAll.mockRejectedValue(new Error('SecurityError: 存储被策略禁用'))
    const { initStorage } = await loadStorage()

    await expect(initStorage()).resolves.toBeUndefined()
    await flush()

    expect(mocks.addToast).toHaveBeenCalledTimes(1)
    const [type, message] = mocks.addToast.mock.calls[0]
    expect(type).toBe('error')
    expect(message).toContain('存储被策略禁用')
    expect(message).toContain('不会被保存')
    // 线上排障要看得到：控制台与界面两条路都得留下
    expect(consoleErrorSpy).toHaveBeenCalledWith(message)
  })

  it('初始化已经失败过：后续每次写入都是同一根因，不再按 key 逐个弹', async () => {
    mocks.db.dbGetAll.mockRejectedValue(new Error('SecurityError'))
    mocks.db.dbSet.mockRejectedValue(new Error('SecurityError'))
    const { initStorage, setStorage } = await loadStorage()
    await initStorage()

    setStorage('music-volume', 60)
    setStorage('workspace-layout', { a: 1 })
    setStorage('music-volume', 70)
    await flush()

    expect(mocks.addToast).toHaveBeenCalledTimes(1)
  })

  it('初始化失败时拦住所有普通持久化入口，避免默认配置覆盖未读出的旧数据', async () => {
    mocks.db.dbGetAll.mockRejectedValue(new Error('瞬时打开失败'))
    const storage = await loadStorage()
    await storage.initStorage()
    storage.setStorage('layout', 'default')
    storage.removeStorage('favorites')
    await expect(storage.applyStoragePatch({ layout: 'default' })).rejects.toThrow('保护原有数据')
    await expect(storage.removeStorageAsync('favorites')).rejects.toThrow('保护原有数据')
    expect(mocks.db.dbSet).not.toHaveBeenCalled()
    expect(mocks.db.dbRemove).not.toHaveBeenCalled()
    expect(mocks.db.dbApplyPatch).not.toHaveBeenCalled()
    expect(storage.getStorage('layout')).toBe('default')
  })

  it('用户明确全量导入成功后可以恢复保存', async () => {
    mocks.db.dbGetAll.mockRejectedValue(new Error('瞬时打开失败'))
    const storage = await loadStorage()
    await storage.initStorage()
    await storage.importAllData({ restored: true })
    storage.setStorage('fresh', 1)
    expect(mocks.db.dbSet).toHaveBeenCalledWith('fresh', 1)
  })

  it('异步删除落盘失败时保留缓存中的原值', async () => {
    mocks.db.dbGetAll.mockResolvedValue({ keep: 1 })
    mocks.db.dbRemove.mockRejectedValue(new Error('删除失败'))
    const storage = await loadStorage()
    await storage.initStorage()
    await expect(storage.removeStorageAsync('keep')).rejects.toThrow('删除失败')
    expect(storage.getStorage('keep')).toBe(1)
  })

  it('写入失败：说明「只留在当前页面、刷新会丢」，同一 key 只弹一次', async () => {
    mocks.db.dbSet.mockRejectedValue(new Error('QuotaExceededError'))
    const { initStorage, setStorage } = await loadStorage()
    await initStorage()

    setStorage('docs-draft', { big: true })
    setStorage('docs-draft', { big: true, again: true })
    await flush()

    expect(mocks.addToast).toHaveBeenCalledTimes(1)
    const [type, message] = mocks.addToast.mock.calls[0]
    expect(type).toBe('error')
    expect(message).toContain('QuotaExceededError')
    expect(message).toContain('docs-draft')
    expect(message).toContain('刷新后会丢失')
  })

  it('不同 key 各自报一次：它们可能是不相干的两处故障', async () => {
    mocks.db.dbSet.mockRejectedValue(new Error('QuotaExceededError'))
    const { initStorage, setStorage } = await loadStorage()
    await initStorage()

    setStorage('a', 1)
    setStorage('b', 2)
    await flush()

    expect(mocks.addToast).toHaveBeenCalledTimes(2)
    expect(mocks.addToast.mock.calls[0][1]).toContain('a')
    expect(mocks.addToast.mock.calls[1][1]).toContain('b')
  })

  it('删除失败：提示「刷新后可能重新出现」——这与写入失败的后果不同', async () => {
    mocks.db.dbRemove.mockRejectedValue(new Error('QuotaExceededError'))
    const { initStorage, removeStorage } = await loadStorage()
    await initStorage()

    removeStorage('music-favorites')
    await flush()

    expect(mocks.addToast).toHaveBeenCalledTimes(1)
    expect(mocks.addToast.mock.calls[0][1]).toContain('music-favorites')
    expect(mocks.addToast.mock.calls[0][1]).toContain('重新出现')
  })

  it('非 Error 抛出物不会把 [object Object] 喂到界面上', async () => {
    mocks.db.dbSet.mockRejectedValue({ code: 22 })
    const { initStorage, setStorage } = await loadStorage()
    await initStorage()

    setStorage('weird', 1)
    await flush()

    expect(mocks.addToast).toHaveBeenCalledTimes(1)
    expect(mocks.addToast.mock.calls[0][1]).toContain('写入被拒绝')
    expect(mocks.addToast.mock.calls[0][1]).not.toContain('[object Object]')
  })

  it('一切正常时不打扰用户', async () => {
    const { initStorage, setStorage, removeStorage } = await loadStorage()
    await initStorage()

    setStorage('ok', 1)
    removeStorage('ok')
    await flush()

    expect(mocks.addToast).not.toHaveBeenCalled()
  })
})
