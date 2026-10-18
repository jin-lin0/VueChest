import { beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '@/config'
import type { FavoriteGroup, Song } from '../music-types'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  addToast: vi.fn(),
  patch: vi.fn(),
  auth: null as unknown as {
    token: string | null
    user: { id: number } | null
    isAuthenticated: boolean
  },
}))
vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) => mocks.storage.get(key) ?? fallback ?? null,
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  applyStoragePatch: mocks.patch,
}))
vi.mock('@/lib/request', () => ({
  API_BASE: 'http://localhost:3000',
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ addToast: mocks.addToast }) }))
import { useMusicStore } from '../music'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const song = (id: string): Song => ({
  id,
  name: id,
  artists: '',
  album: '',
  coverUrl: '',
  url: '',
  server: 'netease',
})
const groups = (id: number, songs: Song[] = []): { data: FavoriteGroup[] } => ({
  data: [{ id, name: '我的喜欢', isDefault: true, songs }],
})
function account(id: number | null) {
  mocks.auth.isAuthenticated = false
  mocks.auth.token = id === null ? null : `account-${id}`
  mocks.auth.user = id === null ? null : { id }
  mocks.auth.isAuthenticated = id !== null
}
const storedIds = () =>
  (mocks.storage.get(STORAGE_KEYS.MUSIC_FAVORITES) as Song[]).map((item) => item.id)

const pendingKey = (id: number) => `${STORAGE_KEYS.MUSIC_FAVORITES_PENDING_PREFIX}:${id}`
const pendingIds = (id: number) =>
  ((mocks.storage.get(pendingKey(id)) ?? []) as Song[]).map((item) => item.id)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.patch.mockReset().mockImplementation(async (data: Record<string, unknown>) => {
    Object.entries(data).forEach(([key, value]) => mocks.storage.set(key, value))
  })
  mocks.get.mockReset()
  mocks.post.mockReset().mockResolvedValue({})
  mocks.delete.mockReset().mockResolvedValue({})
  mocks.storage.clear()
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, [])
  mocks.auth = reactive({ token: 'account-1', user: { id: 1 }, isAuthenticated: true })
  setActivePinia(createPinia())
})

it('退出账号立即切回本地，迟到的云收藏不能回填', async () => {
  const pending = deferred<{ data: FavoriteGroup[] }>()
  mocks.get.mockReturnValueOnce(pending.promise)
  const store = useMusicStore()
  const load = store.loadFavoriteGroups()
  account(null)
  pending.resolve(groups(10, [song('private')]))
  expect(await load).toBe(false)
  expect(store.favoriteGroups).toEqual([])
  expect(store.favorites).toEqual([])
  expect(store.groupsLoaded).toBe(false)
})

it('切换账号后可立即发新请求，旧请求收尾不影响新账号的 loading', async () => {
  const old = deferred<{ data: FavoriteGroup[] }>()
  const current = deferred<{ data: FavoriteGroup[] }>()
  mocks.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const store = useMusicStore()
  const first = store.loadFavoriteGroups()
  await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
  account(2)
  const second = store.loadFavoriteGroups()
  old.resolve(groups(10, [song('old-account')]))
  await first
  expect(store.isSyncingFavorites).toBe(true)
  current.resolve(groups(20, [song('new-account')]))
  expect(await second).toBe(true)
  expect(store.favorites.map((item) => item.id)).toEqual(['new-account'])
})

it('同一账号并发加载者都等待并拿到实际结果', async () => {
  const pending = deferred<{ data: FavoriteGroup[] }>()
  mocks.get.mockReturnValueOnce(pending.promise)
  const store = useMusicStore()
  const first = store.loadFavoriteGroups()
  const second = store.loadFavoriteGroups()
  await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
  pending.resolve(groups(10))
  expect(await Promise.all([first, second])).toEqual([true, true])
})

it('迁移中切换账号，不再发送剩余批次，也不清掉本地副本', async () => {
  mocks.storage.set(
    STORAGE_KEYS.MUSIC_FAVORITES,
    Array.from({ length: 150 }, (_, i) => song(`local-${i}`)),
  )
  mocks.get.mockResolvedValueOnce(groups(10))
  const batch = deferred<unknown>()
  mocks.post.mockReturnValueOnce(batch.promise)
  const store = useMusicStore()
  const loading = store.loadFavoriteGroups()
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
  account(2)
  batch.resolve({})
  expect(await loading).toBe(false)
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(mocks.get).toHaveBeenCalledTimes(1)
  expect(storedIds()).toEqual([])
  expect(pendingIds(1)).toHaveLength(150)
})

it('迁移期间新增收藏在加载结束后写入账号，不被旧快照覆盖', async () => {
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, [song('old')])
  mocks.get.mockResolvedValueOnce(groups(10)).mockResolvedValueOnce(groups(10, [song('old')]))
  const batch = deferred<unknown>()
  mocks.post.mockReturnValueOnce(batch.promise)
  const store = useMusicStore()
  const loading = store.loadFavoriteGroups()
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
  const adding = store.toggleFavoriteSong(song('new'))
  batch.resolve({})
  await Promise.all([loading, adding])
  expect(storedIds()).toEqual([])
  expect(store.favorites.map((item) => item.id)).toEqual(['old', 'new'])
  expect(mocks.post).toHaveBeenLastCalledWith('/api/music-favorites/groups/10/songs', {
    song: song('new'),
  })
})

it('退出后收藏新歌不能把上个账号的歌曲写进游客收藏', async () => {
  mocks.get.mockResolvedValueOnce(groups(10, [song('private')]))
  const store = useMusicStore()
  await store.loadFavoriteGroups()
  account(null)
  await store.toggleFavoriteSong(song('guest'))
  expect(storedIds()).toEqual(['guest'])
})

it('退出后迟到的收藏写入回包不能重新暴露旧账号的数据', async () => {
  mocks.get.mockResolvedValueOnce(groups(10, [song('private')]))
  const store = useMusicStore()
  await store.loadFavoriteGroups()
  const pending = deferred<unknown>()
  mocks.post.mockReturnValueOnce(pending.promise)
  const write = store.toggleFavoriteSong(song('another-private'))
  account(null)
  pending.resolve({})
  await write
  expect(store.favorites).toEqual([])
  expect(store.favoriteGroups).toEqual([])
})

it('迁移期间取消本地收藏，不能在迁移结束后重新出现', async () => {
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, [song('old')])
  mocks.get.mockResolvedValueOnce(groups(10)).mockResolvedValueOnce(groups(10, [song('old')]))
  const batch = deferred<unknown>()
  mocks.post.mockReturnValueOnce(batch.promise)
  const store = useMusicStore()
  const loading = store.loadFavoriteGroups()
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
  const removing = store.toggleFavoriteSong(song('old'))
  batch.resolve({})
  await Promise.all([loading, removing])
  expect(mocks.delete).toHaveBeenCalledWith('/api/music-favorites/groups/10/songs/old')
  expect(store.favorites).toEqual([])
  expect(storedIds()).toEqual([])
})

it('同一首歌连续点击期间只发一次写入，不生成重复歌曲', async () => {
  mocks.get.mockResolvedValueOnce(groups(10))
  const store = useMusicStore()
  await store.loadFavoriteGroups()
  const pending = deferred<unknown>()
  mocks.post.mockReturnValueOnce(pending.promise)
  const first = store.toggleFavoriteSong(song('new'))
  const second = store.toggleFavoriteSong(song('new'))
  pending.resolve({})
  await Promise.all([first, second])
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(store.favorites.map((item) => item.id)).toEqual(['new'])
})

it('账号 A 断网收藏只属于 A，切换 B 不上传，回到 A 才重试', async () => {
  mocks.get.mockRejectedValueOnce(new Error('offline'))
  const store = useMusicStore()
  await store.loadFavoriteGroups()
  await store.toggleFavoriteSong(song('private-A'))
  expect(pendingIds(1)).toEqual(['private-A'])
  expect(storedIds()).toEqual([])

  account(2)
  mocks.get.mockResolvedValueOnce(groups(20))
  await store.loadFavoriteGroups()
  expect(mocks.post).not.toHaveBeenCalled()
  expect(store.favorites).toEqual([])

  account(1)
  // 重新创建 store，验证归属不是只存在于内存中的临时标记。
  setActivePinia(createPinia())
  mocks.get.mockResolvedValueOnce(groups(10)).mockResolvedValueOnce(groups(10, [song('private-A')]))
  await useMusicStore().loadFavoriteGroups()
  expect(mocks.post).toHaveBeenCalledWith('/api/music-favorites/groups/10/songs/batch', {
    songs: [song('private-A')],
  })
  expect(pendingIds(1)).toEqual([])
})

it('游客收藏迁移失败后已归属 A，B 不能接手上传', async () => {
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, [song('guest')])
  mocks.get.mockResolvedValue(groups(10))
  mocks.post.mockRejectedValueOnce(new Error('offline'))
  const store = useMusicStore()
  await store.loadFavoriteGroups()
  expect(pendingIds(1)).toEqual(['guest'])
  expect(storedIds()).toEqual([])

  account(2)
  mocks.get.mockResolvedValue(groups(20))
  await store.loadFavoriteGroups()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(pendingIds(1)).toEqual(['guest'])
})

it('认领落盘失败时不上传、不清理游客原件', async () => {
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, [song('guest')])
  mocks.patch.mockRejectedValueOnce(new Error('quota'))
  expect(await useMusicStore().loadFavoriteGroups()).toBe(false)
  expect(storedIds()).toEqual(['guest'])
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.post).not.toHaveBeenCalled()
})

it('认领落盘期间切换账号，B 等待后不能重复认领', async () => {
  mocks.storage.set(STORAGE_KEYS.MUSIC_FAVORITES, [song('guest')])
  const saving = deferred<void>()
  mocks.patch.mockImplementationOnce(async (data: Record<string, unknown>) => {
    await saving.promise
    Object.entries(data).forEach(([key, value]) => mocks.storage.set(key, value))
  })
  const store = useMusicStore()
  const first = store.loadFavoriteGroups()
  await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1))
  account(2)
  mocks.get.mockResolvedValue(groups(20))
  const second = store.loadFavoriteGroups()
  saving.resolve()
  expect(await first).toBe(false)
  expect(await second).toBe(true)
  expect(mocks.post).not.toHaveBeenCalled()
  expect(pendingIds(1)).toEqual(['guest'])
  expect(pendingIds(2)).toEqual([])
})
