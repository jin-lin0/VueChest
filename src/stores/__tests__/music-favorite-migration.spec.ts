// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '@/config'
import type { FavoriteGroup, Song } from '../music-types'

// 使用有状态的服务端模拟，验证批量迁移及失败记录的持久化。
const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  addToast: vi.fn(),
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

// 必须导出 API_BASE：music store 会连带加载 @/lib/musicApi，它在模块顶层读这个常量
vi.mock('@/lib/request', () => ({
  API_BASE: 'http://localhost:3000',
  api: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { id: 1 }, token: 'account-1' }),
}))

// 全局 Toast 是模块级单例，store 里调用它不需要组件上下文
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

/**
 * 假服务端的**唯一状态源**：GET 读它、POST 改它。
 * 不能把调用方传进来的数组直接当状态——那样 POST 改的是另一个变量，
 * GET 会一直返回最初那份，于是「本地清空」永远看起来是对的（正是这个缺陷能长期存在的原因）。
 */
let serverGroups: FavoriteGroup[] = []

const defaultGroup = (): FavoriteGroup | null =>
  serverGroups.find((group) => group.isDefault) ?? null

const serverSongIds = () => (defaultGroup()?.songs ?? []).map((song) => song.id)

/**
 * 批量加歌：模拟服务端按 songId 去重后追加，返回真实的 requested/added/skipped。
 * 这样「服务端到底收到了什么」完全由本函数决定，而不是由测试自己假设。
 */
async function applyBatch(url: string, body: unknown) {
  if (!String(url).includes('/songs/batch')) {
    throw new Error(`未预期的 POST ${url}`)
  }
  const group = defaultGroup()
  if (!group) throw new Error('没有默认组可加')
  const songs = (body as { songs: Song[] }).songs
  const existing = new Set(group.songs.map((song) => song.id))
  const added = songs.filter((song) => !existing.has(song.id))
  group.songs = [...group.songs, ...added]
  return {
    data: { requested: songs.length, added: added.length, skipped: songs.length - added.length },
  }
}

function seedGroups(groups: FavoriteGroup[], localSongs: Song[]) {
  serverGroups = groups.map((group) => ({ ...group, songs: [...group.songs] }))
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, localSongs)
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/music-favorites/groups') {
      return { data: serverGroups.map((group) => ({ ...group, songs: [...group.songs] })) }
    }
    throw new Error(`未预期的 GET ${url}`)
  })
  mocks.apiPost.mockImplementation(applyBatch)
}

function seed(initialServerSongs: Song[], localSongs: Song[]) {
  seedGroups(
    [{ id: DEFAULT_GROUP_ID, name: '我的喜欢', isDefault: true, songs: initialServerSongs }],
    localSongs,
  )
}

function batchCalls() {
  return mocks.apiPost.mock.calls.filter(([url]) => String(url).includes('/songs/batch'))
}

function groupsGets() {
  return mocks.apiGet.mock.calls.filter(([url]) => url === '/api/music-favorites/groups')
}

function storedFavorites() {
  return mocks.storage.get(`${STORAGE_KEYS.MUSIC_FAVORITES_PENDING_PREFIX}:1`) as Song[] | undefined
}

function storedIds() {
  return (storedFavorites() ?? []).map((song) => song.id)
}

function toastMessages() {
  return mocks.addToast.mock.calls.map(([, message]) => String(message))
}

beforeEach(() => {
  mocks.storage.clear()
  mocks.apiGet.mockReset()
  mocks.apiPost.mockReset()
  mocks.addToast.mockReset()
  serverGroups = []
  setActivePinia(createPinia())
})

afterEach(() => vi.restoreAllMocks())

describe('首次登录迁移本地收藏', () => {
  it('250 首拆成 3 个批量请求（100/100/50），不再逐首 POST', async () => {
    const local = Array.from({ length: 250 }, (_, index) => makeSong(`l${index + 1}`))
    seed([], local)

    await useMusicStore().loadFavoriteGroups()

    const calls = batchCalls()
    expect(calls).toHaveLength(3)
    expect(calls.map(([, body]) => (body as { songs: Song[] }).songs.length)).toEqual([
      100, 100, 50,
    ])
    // 关键回归：不能有任何一次打到单条接口
    const singleAdds = mocks.apiPost.mock.calls.filter(([url]) =>
      /\/groups\/\d+\/songs$/.test(String(url)),
    )
    expect(singleAdds).toEqual([])
    for (const [url] of calls) {
      expect(url).toBe(`/api/music-favorites/groups/${DEFAULT_GROUP_ID}/songs/batch`)
    }
  })

  it('已在默认组里的歌不再提交给服务端', async () => {
    seed([makeSong('l1'), makeSong('l3')], [makeSong('l1'), makeSong('l2'), makeSong('l3')])

    await useMusicStore().loadFavoriteGroups()

    const calls = batchCalls()
    expect(calls).toHaveLength(1)
    expect((calls[0][1] as { songs: Song[] }).songs.map((song) => song.id)).toEqual(['l2'])
  })

  it('本地没有收藏时一个请求都不发', async () => {
    seed([], [])

    await useMusicStore().loadFavoriteGroups()

    expect(batchCalls()).toEqual([])
  })

  it('每批不超过 100 首（服务端上限 200 以内）', async () => {
    const local = Array.from({ length: 301 }, (_, index) => makeSong(`l${index + 1}`))
    seed([], local)

    await useMusicStore().loadFavoriteGroups()

    for (const [, body] of batchCalls()) {
      expect((body as { songs: Song[] }).songs.length).toBeLessThanOrEqual(100)
    }
  })

  it('没有默认组时不迁移（也不会误清空本地收藏）', async () => {
    seedGroups(
      [{ id: DEFAULT_GROUP_ID, name: '通勤', isDefault: false, songs: [] }],
      [makeSong('l1')],
    )

    await useMusicStore().loadFavoriteGroups()

    expect(batchCalls()).toEqual([])
    expect(storedFavorites()).toEqual([makeSong('l1')])
  })
})

describe('迁移后的本地副本只清「确实已进账号」的部分', () => {
  it('全部迁成功：清空本地（含落盘），且不打扰用户', async () => {
    seed([], [makeSong('l1'), makeSong('l2')])

    await useMusicStore().loadFavoriteGroups()

    expect(storedFavorites()).toEqual([])
    expect(toastMessages()).toEqual([])
  })

  it('本地收藏全部已在默认组时，连那次确认查询都省掉', async () => {
    seed([makeSong('l1')], [makeSong('l1')])

    await useMusicStore().loadFavoriteGroups()

    expect(batchCalls()).toEqual([])
    // 调用方刚刚用同一份服务端数据水合过，这里再查一次纯属浪费一次远端往返
    expect(groupsGets()).toHaveLength(1)
    expect(storedFavorites()).toEqual([])
  })

  it('中间一批失败：失败的 100 首留在本地且落盘，其余清掉', async () => {
    const local = Array.from({ length: 250 }, (_, index) => makeSong(`l${index + 1}`))
    seed([], local)
    // 第 2 批发不出去（网络错误）——服务端根本没收到这 100 首
    mocks.apiPost
      .mockImplementationOnce(applyBatch)
      .mockImplementationOnce(async () => {
        throw new Error('网络错误')
      })
      .mockImplementationOnce(applyBatch)

    await useMusicStore().loadFavoriteGroups()

    expect(batchCalls()).toHaveLength(3)
    expect(storedIds()).toEqual(Array.from({ length: 100 }, (_, index) => `l${index + 101}`))
    // 真正的服务端状态也要对上：失败的这批确实没进去
    expect(serverSongIds()).not.toContain('l101')
    expect(serverSongIds()).toContain('l250')
  })

  it('全部批次都失败：一首都不丢', async () => {
    const local = [makeSong('l1'), makeSong('l2'), makeSong('l3')]
    seed([], local)
    mocks.apiPost.mockImplementation(async () => {
      throw new Error('网络错误')
    })

    await useMusicStore().loadFavoriteGroups()

    expect(storedIds()).toEqual(['l1', 'l2', 'l3'])
  })

  it('同一账号再次加载会重试未迁成功的收藏（幂等）', async () => {
    seed([], [makeSong('l1'), makeSong('l2')])
    mocks.apiPost.mockImplementation(async () => {
      throw new Error('网络错误')
    })
    const store = useMusicStore()
    await store.loadFavoriteGroups()
    expect(storedIds()).toEqual(['l1', 'l2'])

    // 下次登录，这次网络正常
    mocks.apiPost.mockReset()
    mocks.apiPost.mockImplementation(applyBatch)
    await store.loadFavoriteGroups()

    expect(storedFavorites()).toEqual([])
    expect(serverSongIds()).toEqual(['l1', 'l2'])
  })

  it('并发下别的设备已加过同一首（服务端报 added=0）也算迁移成功', async () => {
    const local = [makeSong('l1'), makeSong('l2')]
    seed([], local)
    // 模拟「请求发出瞬间另一台设备已经把它加进去了」：接口返回成功，但服务端侧
    // 其实是我们之外的写入者加的 —— added=0 / skipped=2，两首都在账号里
    mocks.apiPost.mockImplementation(async () => ({
      data: { requested: 2, added: 0, skipped: 2 },
    }))
    const realGet = mocks.apiGet.getMockImplementation()!
    mocks.apiGet.mockImplementation(async (url: string) => {
      // 另一台设备的写入先落库：我们这条 bulkCreate 整体回滚（added=0），
      // 但重新拉列表时两首确实已经在账号里
      const group = defaultGroup()
      if (group) group.songs = [...local]
      return realGet(url)
    })

    await useMusicStore().loadFavoriteGroups()

    expect(storedFavorites()).toEqual([])
  })

  it('拿不到服务端权威列表时一首都不清（宁可下次重迁）', async () => {
    seed([], [makeSong('l1'), makeSong('l2')])
    let first = true
    const realGet = mocks.apiGet.getMockImplementation()!
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (!first) throw new Error('网络错误')
      first = false
      return realGet(url)
    })

    await useMusicStore().loadFavoriteGroups()

    // 批量 POST 其实成功了，但没有权威列表可以确认，于是保守地全部留着
    expect(storedIds()).toEqual(['l1', 'l2'])
  })

  it('有残留时如实告知用户，并说明收藏没丢', async () => {
    const local = Array.from({ length: 150 }, (_, index) => makeSong(`l${index + 1}`))
    seed([], local)
    mocks.apiPost.mockImplementationOnce(applyBatch).mockImplementationOnce(async () => {
      throw new Error('网络错误')
    })

    await useMusicStore().loadFavoriteGroups()

    expect(storedIds()).toHaveLength(50)
    expect(mocks.addToast).toHaveBeenCalledTimes(1)
    const [type, message] = mocks.addToast.mock.calls[0]
    expect(type).toBe('warning')
    expect(message).toContain('50')
    expect(message).toContain('本地')
  })

  it('乐观地把本地清空会丢数据——这条用例就是那个缺陷的回归', async () => {
    // 与「全部批次都失败」同构，但断言的是**行为本身**：
    // 只要服务端没收到，本地就必须还在。历史实现的 catch + 无条件清空会让本用例变红。
    seed([], [makeSong('l1')])
    mocks.apiPost.mockImplementation(async () => {
      throw new Error('网络错误')
    })

    await useMusicStore().loadFavoriteGroups()

    expect(storedFavorites()).not.toEqual([])
    expect(storedIds()).toEqual(['l1'])
  })
})
