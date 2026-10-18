// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '@/config'
import type { FavoriteGroup, Song } from '../music-types'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  addToast: vi.fn(),
  auth: { isAuthenticated: true, user: { id: 1 }, token: 'account-1' },
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorage: (key: string) => mocks.storage.delete(key),
  applyStoragePatch: async (data: Record<string, unknown>) => {
    Object.entries(data).forEach(([key, value]) => mocks.storage.set(key, value))
  },
}))

vi.mock('@/lib/request', () => ({
  API_BASE: 'http://localhost:3000',
  api: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: vi.fn(),
    delete: mocks.apiDelete,
  },
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ addToast: mocks.addToast, removeToast: vi.fn() }),
}))

import { useMusicStore } from '../music'

const DEFAULT_GROUP_ID = 9

const makeSong = (id: string): Song => ({
  id,
  name: `歌 ${id}`,
  artists: '某人',
  album: '专辑',
  coverUrl: '',
  url: '',
  server: 'netease',
})

const group = (songs: Song[]): FavoriteGroup => ({
  id: DEFAULT_GROUP_ID,
  name: '我的喜欢',
  isDefault: true,
  songs,
})

function seedLocalFavorites(songs: Song[]) {
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, songs)
}

function storedIds() {
  return (
    (mocks.storage.get(`${STORAGE_KEYS.MUSIC_FAVORITES_PENDING_PREFIX}:1`) ?? []) as Song[]
  ).map((song) => song.id)
}

function groupsGets() {
  return mocks.apiGet.mock.calls.filter(([url]) => url === '/api/music-favorites/groups')
}

beforeEach(() => {
  mocks.storage.clear()
  mocks.apiGet.mockReset()
  mocks.apiPost.mockReset()
  mocks.apiDelete.mockReset()
  mocks.addToast.mockReset()
  mocks.auth.isAuthenticated = true
  setActivePinia(createPinia())
})

afterEach(() => vi.restoreAllMocks())

describe('loadFavoriteGroups 只在真正拿到服务端分组时才算「已加载」', () => {
  it('成功：groupsLoaded 置真、返回 true、水合分组与默认组', async () => {
    seedLocalFavorites([])
    mocks.apiGet.mockResolvedValue({ data: [group([makeSong('s1')])] })

    const store = useMusicStore()
    const ok = await store.loadFavoriteGroups()

    expect(ok).toBe(true)
    expect(store.groupsLoaded).toBe(true)
    expect(store.favoriteGroups).toHaveLength(1)
    expect(store.favorites.map((song) => song.id)).toEqual(['s1'])
  })

  it('失败：groupsLoaded 保持 false，返回 false（UI 才能退回本地兜底）', async () => {
    seedLocalFavorites([makeSong('l1')])
    mocks.apiGet.mockRejectedValue(new Error('网络连接失败'))

    const store = useMusicStore()
    const ok = await store.loadFavoriteGroups()

    expect(ok).toBe(false)
    // 关键：不能置真。置真会让 App.vue 走服务端分支，显示成一个空分组列表
    expect(store.groupsLoaded).toBe(false)
    expect(store.favoriteGroups).toEqual([])
    // 本地那份必须还在——它正是 UI 兜底展示的数据来源
    expect(store.favorites.map((song) => song.id)).toEqual(['l1'])
    expect(storedIds()).toEqual(['l1'])
  })

  it('失败后重试成功（点收藏 tab 的路径）：groupsLoaded 变真', async () => {
    seedLocalFavorites([])
    mocks.apiGet
      .mockRejectedValueOnce(new Error('网络连接失败'))
      .mockResolvedValueOnce({ data: [group([makeSong('s1')])] })

    const store = useMusicStore()
    expect(await store.loadFavoriteGroups()).toBe(false)
    expect(store.groupsLoaded).toBe(false)

    expect(await store.loadFavoriteGroups()).toBe(true)
    expect(store.groupsLoaded).toBe(true)
    expect(store.favorites.map((song) => song.id)).toEqual(['s1'])
  })

  it('未登录：不发请求、不置 groupsLoaded、返回 false', async () => {
    seedLocalFavorites([makeSong('l1')])
    mocks.auth.isAuthenticated = false

    const store = useMusicStore()

    expect(await store.loadFavoriteGroups()).toBe(false)
    expect(groupsGets()).toEqual([])
    expect(store.groupsLoaded).toBe(false)
  })

  it('并发调用只发一次请求', async () => {
    seedLocalFavorites([])
    let resolveGet: ((value: unknown) => void) | undefined
    // 显式写成 Promise<unknown>：不写类型参数时 resolve 的入参被推成 never，
    // 与上面 resolveGet 的签名对不上（vue-tsc --build 会报 TS2322）。
    mocks.apiGet.mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          resolveGet = resolve
        }),
    )

    const store = useMusicStore()
    const first = store.loadFavoriteGroups()
    const second = store.loadFavoriteGroups()

    await vi.waitFor(() => expect(groupsGets()).toHaveLength(1))
    expect(store.isSyncingFavorites).toBe(true)

    resolveGet?.({ data: [group([])] })
    await Promise.all([first, second])

    await vi.waitFor(() => expect(groupsGets()).toHaveLength(1))
    expect(store.isSyncingFavorites).toBe(false)
    expect(store.groupsLoaded).toBe(true)
  })
})

describe('加载失败后点心形不能把这次点击丢掉', () => {
  it('已登录但分组没加载成功 → 走本地分支：写内存 + 落盘，且不发请求', async () => {
    seedLocalFavorites([makeSong('l1')])
    mocks.apiGet.mockRejectedValue(new Error('网络连接失败'))

    const store = useMusicStore()
    await store.loadFavoriteGroups()
    expect(store.groupsLoaded).toBe(false)

    await store.toggleFavoriteSong(makeSong('l2'))

    // 点击被留下来，等下次加载成功时由 migrateLocalFavorites 迁进账号
    expect(store.favorites.map((song) => song.id)).toEqual(['l1', 'l2'])
    expect(storedIds()).toEqual(['l1', 'l2'])
    // 没有默认组可用，不该盲发服务端请求
    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })

  it('加载成功后同一个点击走服务端分支（对照，确保本地兜底不越界）', async () => {
    seedLocalFavorites([])
    mocks.apiGet.mockResolvedValue({ data: [group([])] })
    mocks.apiPost.mockResolvedValue({ data: {} })

    const store = useMusicStore()
    await store.loadFavoriteGroups()

    await store.toggleFavoriteSong(makeSong('s1'))

    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    expect(String(mocks.apiPost.mock.calls[0][0])).toBe(
      `/api/music-favorites/groups/${DEFAULT_GROUP_ID}/songs`,
    )
    expect(store.favorites.map((song) => song.id)).toEqual(['s1'])
    // 服务端分支不写本地副本：它是唯一能承载「没迁走的收藏」的地方，不该被覆写
    expect(storedIds()).toEqual([])
  })

  it('失败期间点的收藏，重试成功后真的进了账号（两个修复串起来的端到端断言）', async () => {
    seedLocalFavorites([makeSong('l1')])
    mocks.apiGet
      .mockRejectedValueOnce(new Error('网络连接失败')) // 首次加载失败
      .mockResolvedValueOnce({ data: [group([])] }) // 重试成功：账号里还什么都没有
      .mockResolvedValueOnce({ data: [group([makeSong('l1'), makeSong('l2')])] }) // 迁移后重拉
    mocks.apiPost.mockResolvedValue({ data: { requested: 2, added: 2, skipped: 0 } })

    const store = useMusicStore()
    await store.loadFavoriteGroups()
    expect(store.groupsLoaded).toBe(false)

    // 加载失败的窗口里点心形 → 先落在本地
    await store.toggleFavoriteSong(makeSong('l2'))
    expect(storedIds()).toEqual(['l1', 'l2'])

    // 点开收藏页触发重试
    expect(await store.ensureFavoriteGroupsLoaded()).toBe(true)

    // 本地那两首被批量迁进默认组，本地副本随之清空——没有一首漏掉
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    expect(String(mocks.apiPost.mock.calls[0][0])).toBe(
      `/api/music-favorites/groups/${DEFAULT_GROUP_ID}/songs/batch`,
    )
    const body = mocks.apiPost.mock.calls[0][1] as { songs: Song[] }
    expect(body.songs.map((song) => song.id)).toEqual(['l1', 'l2'])
    expect(storedIds()).toEqual([])
    expect(store.favorites.map((song) => song.id)).toEqual(['l1', 'l2'])
  })
})

describe('ensureFavoriteGroupsLoaded：收藏页的重试入口', () => {
  it('已加载成功：不再发请求', async () => {
    seedLocalFavorites([])
    mocks.apiGet.mockResolvedValue({ data: [group([])] })

    const store = useMusicStore()
    await store.loadFavoriteGroups()
    expect(groupsGets()).toHaveLength(1)

    expect(await store.ensureFavoriteGroupsLoaded()).toBe(true)
    expect(groupsGets()).toHaveLength(1)
  })

  it('上次失败：重试一次并把 groupsLoaded 置真', async () => {
    seedLocalFavorites([])
    mocks.apiGet
      .mockRejectedValueOnce(new Error('网络连接失败'))
      .mockResolvedValueOnce({ data: [group([makeSong('s1')])] })

    const store = useMusicStore()
    await store.loadFavoriteGroups()
    expect(store.groupsLoaded).toBe(false)

    expect(await store.ensureFavoriteGroupsLoaded()).toBe(true)
    expect(groupsGets()).toHaveLength(2)
    expect(store.groupsLoaded).toBe(true)
  })

  it('未登录：不发请求、返回 false', async () => {
    seedLocalFavorites([])
    mocks.auth.isAuthenticated = false

    const store = useMusicStore()

    expect(await store.ensureFavoriteGroupsLoaded()).toBe(false)
    expect(groupsGets()).toEqual([])
  })
})
