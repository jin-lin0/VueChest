// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * 应用市场 store 的**过期响应**竞态。
 *
 * `fetchApps` 的形状是「await 拿数据 → 写进共享 ref」，而先发的请求不保证先返回。
 * 应用市场的搜索框是**边打字边发请求**（`@input` 直接触发），所以乱序返回是常态：
 * 敲「周」再敲「林」，若「周」的响应后到，列表就会变回周杰伦的结果，
 * 而输入框和角标写的是林俊杰 —— 界面自相矛盾。
 * 更隐蔽的两条：旧请求走 catch 会把新结果**清空**并写上一个已经过期的错误，
 * 走 finally 会把仍在进行中的 loading **提前熄掉**（骨架屏消失、列表闪成空）。
 *
 * 这里用手动决定 resolve 顺序的 promise 把「乱序返回」造出来，
 * 断言**只有最后发起的那次请求**能写结果、能写错误、能收尾。
 */
const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  apiGet: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorage: (key: string) => mocks.storage.delete(key),
  applyStoragePatch: vi.fn(),
}))

vi.mock('@/lib/request', () => ({
  API_BASE: 'http://localhost:3000',
  api: { get: mocks.apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: false, token: '', user: null }),
}))

import { useMarketStore } from '../market'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Pending = ReturnType<typeof deferred<unknown>>

const appOf = (id: number, name: string) => ({
  id,
  name,
  icon: '📦',
  description: name,
  version: '1.0.0',
  author: 'me',
  category: '工具',
  size: 100,
  isOfficial: false,
  downloads: 1,
  createdAt: '2026-10-15',
  updatedAt: '2026-10-15',
})

/** 与 `api.get` 的返回形状对齐：调用方解构的是 `{ data }`，再取 `data.items`。 */
const response = (items: unknown[]) => ({ data: { items } })

const pending: Pending[] = []

function names(store: ReturnType<typeof useMarketStore>) {
  return store.availableApps.map((item) => item.name)
}

beforeEach(() => {
  pending.length = 0
  mocks.storage.clear()
  mocks.apiGet.mockReset()
  mocks.apiGet.mockImplementation(() => {
    const d = deferred<unknown>()
    pending.push(d)
    return d.promise
  })
  setActivePinia(createPinia())
})

describe('market store 过期响应竞态', () => {
  it('后到的旧响应不得覆盖新结果，也不得提前熄掉加载态', async () => {
    const store = useMarketStore()
    const first = store.fetchApps({ keyword: '周' })
    const second = store.fetchApps({ keyword: '林' })
    expect(pending).toHaveLength(2)

    // 新请求先返回
    pending[1].resolve(response([appOf(2, '林俊杰歌单')]))
    await second
    expect(names(store)).toEqual(['林俊杰歌单'])

    // 旧请求后返回：它的结果已经过期，必须被丢弃
    pending[0].resolve(response([appOf(1, '周杰伦歌单')]))
    await first
    expect(names(store)).toEqual(['林俊杰歌单'])
    expect(store.fetchError).toBe('')
    expect(store.isLoading).toBe(false)
  })

  it('旧请求失败不得清空新结果，也不得写上一个已过期的错误', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useMarketStore()
    const first = store.fetchApps({ keyword: '周' })
    const second = store.fetchApps({ keyword: '林' })

    pending[1].resolve(response([appOf(2, '林俊杰歌单')]))
    await second
    expect(names(store)).toEqual(['林俊杰歌单'])

    pending[0].reject(new Error('网络错误'))
    await first
    expect(names(store)).toEqual(['林俊杰歌单'])
    expect(store.fetchError).toBe('')

    consoleError.mockRestore()
  })

  it('旧请求收尾不得把仍在飞行中的新请求的 loading 熄掉', async () => {
    const store = useMarketStore()
    const first = store.fetchApps({ keyword: 'a' })
    const second = store.fetchApps({ keyword: 'ab' })

    pending[0].resolve(response([appOf(1, 'a')]))
    await first
    // 第二次仍在飞行中，骨架屏必须还在
    expect(store.isLoading).toBe(true)

    pending[1].resolve(response([appOf(2, 'ab')]))
    await second
    expect(store.isLoading).toBe(false)
    expect(names(store)).toEqual(['ab'])
  })

  it('只有一次请求时照常写入（守卫不能把正常路径也挡掉）', async () => {
    const store = useMarketStore()
    const only = store.fetchApps({ keyword: 'x' })
    pending[0].resolve(response([appOf(9, 'x')]))
    await only

    expect(names(store)).toEqual(['x'])
    expect(store.fetchError).toBe('')
    expect(store.isLoading).toBe(false)
  })

  it('搜索关键字确实发给了服务端（守卫没有顺手把参数吃掉）', async () => {
    const store = useMarketStore()
    const only = store.fetchApps({ category: '工具', keyword: '林', page: 2, limit: 20 })
    const [url] = mocks.apiGet.mock.calls[0]
    expect(String(url)).toContain('keyword=%E6%9E%97')
    expect(String(url)).toContain('category=%E5%B7%A5%E5%85%B7')
    expect(String(url)).toContain('page=2')
    expect(String(url)).toContain('limit=20')

    pending[0].resolve(response([]))
    await only
    expect(store.isLoading).toBe(false)
  })

  it('连续失败时错误信息来自最后一次请求', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useMarketStore()
    const first = store.fetchApps({ keyword: '周' })
    const second = store.fetchApps({ keyword: '林' })

    pending[0].reject(new Error('旧错误'))
    await first
    expect(store.fetchError).toBe('')

    pending[1].reject(new Error('新错误'))
    await second
    expect(store.fetchError).toBe('新错误')
    expect(store.isLoading).toBe(false)

    consoleError.mockRestore()
  })
})
