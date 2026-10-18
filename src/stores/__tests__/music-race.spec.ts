// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Song } from '../music-types'

/**
 * 音乐 store 的**过期响应**竞态。
 *
 * 这 8 个加载函数的形状都是「await 拿数据 → 写进一个 ref」，而 ref 是共享的：
 * 先发的请求不保证先返回。后到的旧响应于是会覆盖新结果，更要命的是它
 * ① 走 catch 时会把新结果清空，② 走 finally 时会把还在加载的 loading 提前熄掉。
 *
 * 用户侧表现是「界面自相矛盾」：
 * - 连按两次回车搜「周杰伦」「林俊杰」→ 输入框和结果标题写的是林俊杰，歌单是周杰伦的；
 * - 连点两个歌单 → 播放队列整个被换成先点的那个；
 * - 快速切分类/语种 → 标签高亮在「摇滚」，列表是「华语」的；
 * - 连点两个歌手 → 头部写着歌手 B，下方作品是歌手 A 的。
 *
 * 这里用手动能决定 resolve 顺序的 promise 把「乱序返回」造出来，
 * 断言**只有最后发起的那次请求**能写结果。
 */
const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  apiGet: vi.fn(),
  addToast: vi.fn(),
  auth: { isAuthenticated: false },
  search: vi.fn(),
  playlistTracks: vi.fn(),
  topPlaylist: vi.fn(),
  artistList: vi.fn(),
  searchSuggest: vi.fn(),
  artist: vi.fn(),
  artistAlbum: vi.fn(),
  album: vi.fn(),
  simiSong: vi.fn(),
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

vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ addToast: mocks.addToast, removeToast: vi.fn() }),
}))

vi.mock('@/lib/musicApi', () => ({
  MUSIC_ENDPOINTS: {},
  musicApi: {
    search: mocks.search,
    playlistTracks: mocks.playlistTracks,
    topPlaylist: mocks.topPlaylist,
    artistList: mocks.artistList,
    searchSuggest: mocks.searchSuggest,
    artist: mocks.artist,
    artistAlbum: mocks.artistAlbum,
    album: mocks.album,
    simiSong: mocks.simiSong,
  },
}))

import { useMusicStore } from '../music'

/** 手动决定何时、以何值结算的 promise，用来制造「后发的先返回」。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 让所有已就绪的微任务跑完。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const song = (id: string, name = `歌 ${id}`): Song => ({
  id,
  name,
  artists: '某人',
  album: '专辑',
  coverUrl: '',
  url: '',
  server: 'netease',
})

/** 网易云原始结构（search 等接口返回的是第三方 shape，不是项目约定的 { success, data }）。 */
const neteaseSongs = (songs: Song[]) => ({
  result: { songs: songs.map((s) => ({ id: Number(s.id), name: s.name })) },
})

const searchIds = (store: { searchResults: Song[] }) => store.searchResults.map((s) => s.id)

beforeEach(() => {
  mocks.storage.clear()
  for (const fn of [
    mocks.search,
    mocks.playlistTracks,
    mocks.topPlaylist,
    mocks.artistList,
    mocks.searchSuggest,
    mocks.artist,
    mocks.artistAlbum,
    mocks.album,
    mocks.simiSong,
    mocks.apiGet,
  ])
    fn.mockReset()
  mocks.auth.isAuthenticated = false
  setActivePinia(createPinia())
})

it('清空联想后，仍在途的响应不能把建议重新填回', async () => {
  const pending = deferred<unknown>()
  mocks.searchSuggest.mockReturnValueOnce(pending.promise)
  const store = useMusicStore()
  const request = store.fetchSearchSuggest('歌')
  store.clearSuggestions()
  pending.resolve({ result: { songs: [{ id: 1, name: '旧建议' }] } })
  await request
  expect(store.searchSuggestions.songs).toEqual([])
})

it('清空相似歌曲后立即结束等待，旧结果不能重新出现', async () => {
  const pending = deferred<unknown>()
  mocks.simiSong.mockReturnValueOnce(pending.promise)
  const store = useMusicStore()
  const request = store.fetchSimiSongs('1')
  await store.fetchSimiSongs('')
  expect(store.isLoadingSimi).toBe(false)
  pending.resolve({ songs: [{ id: 1, name: '旧相似歌曲' }] })
  await request
  expect(store.simiSongs).toEqual([])
})

describe('搜索：过期响应不能覆盖、清空或提前熄灭 loading', () => {
  it('头一次搜索后返回，不能盖掉第二次的结果', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.searchSongs('周杰伦')
    const secondCall = store.searchSongs('林俊杰')

    // 第二次（林俊杰）先返回
    second.resolve(neteaseSongs([song('2', '林俊杰的歌')]))
    await flush()
    expect(searchIds(store)).toEqual(['2'])

    // 第一次（周杰伦）姗姗来迟——它已经过期了
    first.resolve(neteaseSongs([song('1', '周杰伦的歌')]))
    await Promise.all([firstCall, secondCall])

    expect(store.searchQuery).toBe('林俊杰')
    expect(searchIds(store)).toEqual(['2'])
  })

  it('过期请求失败，不能把已经拿到的结果清空', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.searchSongs('周杰伦')
    const secondCall = store.searchSongs('林俊杰')

    second.resolve(neteaseSongs([song('2', '林俊杰的歌')]))
    await flush()
    expect(searchIds(store)).toEqual(['2'])

    first.reject(new Error('网络超时'))
    await Promise.all([firstCall, secondCall])

    expect(searchIds(store)).toEqual(['2'])
  })

  it('过期请求失败，不能在更新的请求还在飞的时候熄掉 loading', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.searchSongs('周杰伦')
    const secondCall = store.searchSongs('林俊杰')
    expect(store.isSearching).toBe(true)

    first.reject(new Error('网络超时'))
    await firstCall

    // 第二次搜索尚未返回，转圈必须继续
    expect(store.isSearching).toBe(true)

    second.resolve(neteaseSongs([song('2')]))
    await secondCall
    expect(store.isSearching).toBe(false)
    expect(searchIds(store)).toEqual(['2'])
  })
})

describe('歌单：后到的旧响应不能替换播放队列', () => {
  it('连点两个歌单，队列保持后点的那个', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.playlistTracks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.loadPlaylistTracks('111')
    const secondCall = store.loadPlaylistTracks('222')

    second.resolve([{ title: 'B 的歌', author: 'b', url: 'https://x/song?id=22' }])
    await flush()
    expect(store.playlist.map((s) => s.id)).toEqual(['22'])

    first.resolve([{ title: 'A 的歌', author: 'a', url: 'https://x/song?id=11' }])
    await Promise.all([firstCall, secondCall])

    expect(store.playlist.map((s) => s.id)).toEqual(['22'])
  })
})

describe('分类 / 语种：标签高亮与列表必须属于同一次请求', () => {
  it('快速切分类，列表跟着最后一次点击', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.topPlaylist.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.fetchCatPlaylists('华语')
    const secondCall = store.fetchCatPlaylists('摇滚')

    second.resolve({ playlists: [{ id: 2, name: '摇滚歌单' }] })
    await flush()
    expect(store.catPlaylists.map((p) => p.name)).toEqual(['摇滚歌单'])

    first.resolve({ playlists: [{ id: 1, name: '华语歌单' }] })
    await Promise.all([firstCall, secondCall])

    expect(store.activeCat).toBe('摇滚')
    expect(store.catPlaylists.map((p) => p.name)).toEqual(['摇滚歌单'])
  })

  it('快速切语种，歌手列表跟着最后一次点击', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.artistList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.fetchArtistList(7)
    const secondCall = store.fetchArtistList(3)

    second.resolve({ artists: [{ id: 2, name: '欧美歌手' }] })
    await flush()
    expect(store.topArtists.map((a) => a.name)).toEqual(['欧美歌手'])

    first.resolve({ artists: [{ id: 1, name: '华语歌手' }] })
    await Promise.all([firstCall, secondCall])

    expect(store.activeArtistArea).toBe(3)
    expect(store.topArtists.map((a) => a.name)).toEqual(['欧美歌手'])
  })
})

describe('详情页：连点两个目标，头部与内容必须同属最后一个', () => {
  it('连点两个歌手', async () => {
    mocks.artistAlbum.mockResolvedValue({ hotAlbums: [] })
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.artist.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.openArtist('1')
    const secondCall = store.openArtist('2')

    second.resolve({ artist: { id: 2, name: '歌手 B' }, hotSongs: [{ id: 22, name: 'B 的歌' }] })
    await flush()
    expect(store.currentArtist?.name).toBe('歌手 B')

    first.resolve({ artist: { id: 1, name: '歌手 A' }, hotSongs: [{ id: 11, name: 'A 的歌' }] })
    await Promise.all([firstCall, secondCall])

    expect(store.currentArtist?.name).toBe('歌手 B')
    expect(store.artistHotSongs.map((s) => s.id)).toEqual(['22'])
  })

  it('连点两张专辑', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.album.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.openAlbum('1')
    const secondCall = store.openAlbum('2')

    second.resolve({ album: { id: 2, name: '专辑 B' }, songs: [{ id: 22, name: 'B' }] })
    await flush()
    expect(store.currentAlbum?.name).toBe('专辑 B')

    first.resolve({ album: { id: 1, name: '专辑 A' }, songs: [{ id: 11, name: 'A' }] })
    await Promise.all([firstCall, secondCall])

    expect(store.currentAlbum?.name).toBe('专辑 B')
    expect(store.albumSongs.map((s) => s.id)).toEqual(['22'])
  })

  it('快速切歌，相似推荐属于最后一首', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.simiSong.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.fetchSimiSongs('1')
    const secondCall = store.fetchSimiSongs('2')

    second.resolve({ songs: [{ id: 22, name: '像 2 的' }] })
    await flush()
    expect(store.simiSongs.map((s) => s.id)).toEqual(['22'])

    first.resolve({ songs: [{ id: 11, name: '像 1 的' }] })
    await Promise.all([firstCall, secondCall])

    expect(store.simiSongs.map((s) => s.id)).toEqual(['22'])
  })
})

describe('过期请求先返回时，不能提前熄掉还在加载的 loading', () => {
  // 这一组只改结算顺序（先让**过期的**那次返回），专门盯 finally 里的守卫。
  // 守卫只写在成功路径时，数据断言全绿，但转圈会提前消失——所以必须单独钉。
  it('歌手 / 专辑 / 语种 / 分类 / 相似推荐 的 loading 都不被过期请求熄掉', async () => {
    mocks.artistAlbum.mockResolvedValue({ hotAlbums: [] })
    const a1 = deferred<unknown>()
    const a2 = deferred<unknown>()
    const b1 = deferred<unknown>()
    const b2 = deferred<unknown>()
    const c1 = deferred<unknown>()
    const c2 = deferred<unknown>()
    const d1 = deferred<unknown>()
    const d2 = deferred<unknown>()
    const e1 = deferred<unknown>()
    const e2 = deferred<unknown>()
    mocks.artist.mockReturnValueOnce(a1.promise).mockReturnValueOnce(a2.promise)
    mocks.album.mockReturnValueOnce(b1.promise).mockReturnValueOnce(b2.promise)
    mocks.artistList.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise)
    mocks.topPlaylist.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)
    mocks.simiSong.mockReturnValueOnce(e1.promise).mockReturnValueOnce(e2.promise)

    const store = useMusicStore()
    const artistA = store.openArtist('1')
    const artistB = store.openArtist('2')
    const albumA = store.openAlbum('1')
    const albumB = store.openAlbum('2')
    const listA = store.fetchArtistList(7)
    const listB = store.fetchArtistList(3)
    const catA = store.fetchCatPlaylists('华语')
    const catB = store.fetchCatPlaylists('摇滚')
    const simiA = store.fetchSimiSongs('1')
    const simiB = store.fetchSimiSongs('2')

    expect(store.isLoadingArtist).toBe(true)
    expect(store.isLoadingAlbum).toBe(true)
    expect(store.isLoadingArtists).toBe(true)
    expect(store.isLoadingCat).toBe(true)
    expect(store.isLoadingSimi).toBe(true)

    // 五次「过期的」请求先返回
    a1.resolve({ artist: { id: 1, name: '歌手 A' }, hotSongs: [{ id: 11, name: 'A 的歌' }] })
    b1.resolve({ album: { id: 1, name: '专辑 A' }, songs: [{ id: 11, name: 'A' }] })
    c1.resolve({ artists: [{ id: 1, name: '华语歌手' }] })
    d1.resolve({ playlists: [{ id: 1, name: '华语歌单' }] })
    e1.resolve({ songs: [{ id: 11, name: '像 1 的' }] })
    await Promise.all([artistA, albumA, listA, catA, simiA])

    // 更新的请求都还在飞：loading 必须继续转，结果也不能被写进去
    expect(store.isLoadingArtist).toBe(true)
    expect(store.isLoadingAlbum).toBe(true)
    expect(store.isLoadingArtists).toBe(true)
    expect(store.isLoadingCat).toBe(true)
    expect(store.isLoadingSimi).toBe(true)
    expect(store.currentArtist).toBeNull()
    expect(store.currentAlbum).toBeNull()
    expect(store.topArtists).toEqual([])
    expect(store.catPlaylists).toEqual([])
    expect(store.simiSongs).toEqual([])

    // 更新的请求陆续返回，这时才轮到它们落地
    a2.resolve({ artist: { id: 2, name: '歌手 B' }, hotSongs: [{ id: 22, name: 'B 的歌' }] })
    b2.resolve({ album: { id: 2, name: '专辑 B' }, songs: [{ id: 22, name: 'B' }] })
    c2.resolve({ artists: [{ id: 2, name: '欧美歌手' }] })
    d2.resolve({ playlists: [{ id: 2, name: '摇滚歌单' }] })
    e2.resolve({ songs: [{ id: 22, name: '像 2 的' }] })
    await Promise.all([artistB, albumB, listB, catB, simiB])

    expect(store.isLoadingArtist).toBe(false)
    expect(store.isLoadingAlbum).toBe(false)
    expect(store.isLoadingArtists).toBe(false)
    expect(store.isLoadingCat).toBe(false)
    expect(store.isLoadingSimi).toBe(false)
    expect(store.currentArtist?.name).toBe('歌手 B')
    expect(store.currentAlbum?.name).toBe('专辑 B')
    expect(store.topArtists.map((a) => a.name)).toEqual(['欧美歌手'])
    expect(store.catPlaylists.map((p) => p.name)).toEqual(['摇滚歌单'])
    expect(store.simiSongs.map((s) => s.id)).toEqual(['22'])
  })
})

describe('搜索联想：连打字时联想词属于最后一次输入', () => {
  it('先返回的旧联想不能盖掉新的', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.searchSuggest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const store = useMusicStore()
    const firstCall = store.fetchSearchSuggest('周')
    const secondCall = store.fetchSearchSuggest('林')

    second.resolve({ result: { songs: [{ id: 2, name: '林俊杰' }], artists: [], albums: [] } })
    await flush()
    expect(store.searchSuggestions.songs.map((s) => s.name)).toEqual(['林俊杰'])

    first.resolve({ result: { songs: [{ id: 1, name: '周杰伦' }], artists: [], albums: [] } })
    await Promise.all([firstCall, secondCall])

    expect(store.searchSuggestions.songs.map((s) => s.name)).toEqual(['林俊杰'])
  })
})
