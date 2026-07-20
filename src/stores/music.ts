import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config'
import { api } from '@/lib/request'
import { musicApi } from '@/apps/music/api/musicApi'
import { useAuthStore } from '@/stores/auth'

export interface Song {
  id: string
  name: string
  artists: string
  album: string
  coverUrl: string
  url: string
  server: string
  duration?: number
  fee?: number
  mvId?: number
  sq?: boolean
  artistId?: string
  albumId?: string
}

export interface Artist {
  id: string
  name: string
  picUrl: string
  musicSize?: number
  albumSize?: number
  briefDesc?: string
}

export interface Album {
  id: string
  name: string
  picUrl: string
  artist?: string
  publishTime?: number
  size?: number
  description?: string
  company?: string
}

export interface SuggestItem {
  id: string
  name: string
  extra?: string
  picUrl?: string
}

export interface SearchSuggest {
  songs: SuggestItem[]
  artists: SuggestItem[]
  albums: SuggestItem[]
}

export interface HotSearch {
  searchWord: string
  score: number
  iconUrl?: string
  content?: string
}

export interface FavoriteGroup {
  id: number
  name: string
  isDefault: boolean
  songs: Song[]
}

export interface LyricLine {
  time: number
  text: string
}

export interface Playlist {
  id: string
  name: string
  coverUrl: string
  trackCount: number
  description: string
  server: string
}

export const useMusicStore = defineStore('music', () => {
  const searchQuery = ref('')
  const searchResults = ref<Song[]>([])
  const isSearching = ref(false)
  const searchServer = ref<'netease' | 'tencent'>('netease')

  // Player state
  const playlist = ref<Song[]>([])
  const currentIndex = ref(-1)
  const activeSong = ref<Song | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(getStorage<number>(STORAGE_KEYS.MUSIC_VOLUME) ?? 0.7)
  const playMode = ref<'list' | 'single' | 'random'>('list')
  const songUrl = ref('')
  const showPlaylist = ref(false)
  const playerBarVisible = ref(false)
  const lyrics = ref<LyricLine[]>([])
  const isLoadingUrl = ref(false)

  // Recommended playlists (官方榜单)
  const recommendPlaylists = ref<Playlist[]>([])
  const isLoadingRecommend = ref(false)

  // ===== Discover 发现页 =====
  const personalizedPlaylists = ref<Playlist[]>([]) // 推荐歌单
  const newSongs = ref<Song[]>([]) // 新歌速递
  const isLoadingDiscover = ref(false)
  const playlistCats = ref<string[]>([]) // 歌单分类标签
  const activeCat = ref<string>('全部')
  const catPlaylists = ref<Playlist[]>([]) // 当前分类下的歌单
  const isLoadingCat = ref(false)

  // ===== 搜索增强 =====
  const searchSuggestions = ref<SearchSuggest>({ songs: [], artists: [], albums: [] })
  const hotSearches = ref<HotSearch[]>([])

  // ===== 歌手 / 专辑详情 =====
  const detailView = ref<'none' | 'artist' | 'album'>('none')
  const currentArtist = ref<Artist | null>(null)
  const artistHotSongs = ref<Song[]>([])
  const artistAlbums = ref<Album[]>([])
  const isLoadingArtist = ref(false)
  const currentAlbum = ref<Album | null>(null)
  const albumSongs = ref<Song[]>([])
  const isLoadingAlbum = ref(false)

  // ===== 相似推荐 =====
  const simiSongs = ref<Song[]>([])
  const isLoadingSimi = ref(false)

  // Search history
  const searchHistory = ref<string[]>(
    getStorage<string[]>(STORAGE_KEYS.MUSIC_SEARCH_HISTORY, []) || [],
  )

  // ===== 收藏（我的喜欢 + 用户分组）=====
  // 未登录时 favorites 仅来自本地；登录后由服务端分组水合
  const localFavorites = ref<Song[]>(getStorage<Song[]>(STORAGE_KEYS.MUSIC_FAVORITES, []) || [])
  // “我的喜欢”镜像：未登录=本地数组，登录后=默认分组歌曲
  const favorites = ref<Song[]>(localFavorites.value)

  // 登录后的收藏分组（含默认组“我的喜欢”与用户自建组）
  const favoriteGroups = ref<FavoriteGroup[]>([])
  const groupsLoaded = ref(false)
  const isSyncingFavorites = ref(false)

  const currentSong = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < playlist.value.length) {
      return playlist.value[currentIndex.value]
    }
    return null
  })

  const currentLyricIndex = computed(() => {
    if (lyrics.value.length === 0) return -1
    let idx = -1
    for (let i = 0; i < lyrics.value.length; i++) {
      if (lyrics.value[i].time <= currentTime.value) {
        idx = i
      } else {
        break
      }
    }
    return idx
  })

  const isFavorite = computed(() => {
    const song = activeSong.value || currentSong.value
    if (!song) return false
    return favorites.value.some((s) => s.id === song.id)
  })

  const saveSearchHistory = () => {
    setStorage(STORAGE_KEYS.MUSIC_SEARCH_HISTORY, searchHistory.value)
  }

  const addSearchHistory = (keyword: string) => {
    const q = keyword.trim()
    if (!q) return
    searchHistory.value = searchHistory.value.filter((s) => s !== q)
    searchHistory.value.unshift(q)
    if (searchHistory.value.length > 15) searchHistory.value.pop()
    saveSearchHistory()
  }

  const removeSearchHistory = (keyword: string) => {
    searchHistory.value = searchHistory.value.filter((s) => s !== keyword)
    saveSearchHistory()
  }

  const clearSearchHistory = () => {
    searchHistory.value = []
    saveSearchHistory()
  }

  // 从 url 字段提取歌曲 ID
  const extractId = (url: string): string => {
    const match = url.match(/[?&]id=(\d+)/)
    return match ? match[1] : ''
  }

  // 解析 meting-api 返回的数据（包含 url）
  const parseMetingSong = (raw: Record<string, unknown>): Song => {
    const apiUrl = (raw.url as string) || ''
    return {
      id: extractId(apiUrl),
      name: (raw.title as string) || '未知',
      artists: (raw.author as string) || '未知',
      album: (raw.album as string) || '未知',
      coverUrl: (raw.pic as string) || '',
      url: apiUrl,
      server: 'netease',
    }
  }

  // 解析网易云搜索结果（兼容 ar/artists、al/album、dt/duration 多种字段）
  const parseNeteaseSong = (song: Record<string, unknown>): Song => {
    const artists =
      (song.ar as Record<string, unknown>[]) || (song.artists as Record<string, unknown>[]) || []
    const album =
      (song.al as Record<string, unknown>) || (song.album as Record<string, unknown>) || {}
    const firstArtistId = artists[0]?.id
    return {
      id: String(song.id),
      name: (song.name as string) || '未知',
      artists: artists.map((a) => a.name as string).join(' / ') || '未知',
      album: (album.name as string) || '未知',
      coverUrl: (album.picUrl as string) || '',
      url: '',
      server: 'netease',
      duration: (song.dt as number) ?? (song.duration as number) ?? undefined,
      fee: song.fee as number | undefined,
      mvId: (song.mv as number) ?? (song.mvid as number) ?? undefined,
      sq: !!song.sq,
      artistId: firstArtistId != null ? String(firstArtistId) : undefined,
      albumId: album.id != null ? String(album.id) : undefined,
    }
  }

  // 解析歌单（兼容 coverImgUrl/picUrl）
  const parsePlaylist = (raw: Record<string, unknown>): Playlist => ({
    id: String(raw.id),
    name: (raw.name as string) || '未知歌单',
    coverUrl: (raw.coverImgUrl as string) || (raw.picUrl as string) || '',
    trackCount: (raw.trackCount as number) || 0,
    description: (raw.description as string) || '',
    server: 'netease',
  })

  // 解析专辑
  const parseAlbum = (raw: Record<string, unknown>): Album => {
    const artist = raw.artist as Record<string, unknown> | undefined
    return {
      id: String(raw.id),
      name: (raw.name as string) || '未知专辑',
      picUrl: (raw.picUrl as string) || '',
      artist: (artist?.name as string) || undefined,
      publishTime: raw.publishTime as number | undefined,
      size: raw.size as number | undefined,
      description: raw.description as string | undefined,
      company: raw.company as string | undefined,
    }
  }

  const searchSongs = async (keyword: string) => {
    const q = keyword.trim()
    if (!q) return
    isSearching.value = true
    searchQuery.value = q
    addSearchHistory(q)
    try {
      const result = (await musicApi.search(q)) as Record<string, unknown>
      const songs =
        ((result.result as Record<string, unknown>)?.songs as Record<string, unknown>[]) || []
      searchResults.value = songs.map(parseNeteaseSong)
    } catch (e) {
      console.error('Search failed:', e)
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

  const fetchRecommendPlaylists = async () => {
    isLoadingRecommend.value = true
    try {
      const data = (await musicApi.toplist()) as Record<string, unknown>

      const toplist = data.list as Record<string, unknown>[]
      if (toplist && Array.isArray(toplist)) {
        recommendPlaylists.value = toplist.slice(0, 10).map((item) => ({
          id: String(item.id),
          name: item.name as string,
          coverUrl: (item.coverImgUrl as string) || '',
          trackCount: (item.trackCount as number) || 0,
          description: (item.description as string) || '',
          server: 'netease',
        }))

        // 预加载歌单内容（不阻塞UI）
        toplist.slice(0, 10).forEach((item) => {
          musicApi.preloadPlaylist('netease', String(item.id))
        })
      }
    } catch (e) {
      console.error('Fetch recommend failed:', e)
      recommendPlaylists.value = []
    } finally {
      isLoadingRecommend.value = false
    }
  }

  const loadPlaylistTracks = async (playlistId: string, server = 'netease') => {
    try {
      const data = await musicApi.playlistTracks(server, playlistId)
      const newPlaylist = (data || []).map(parseMetingSong)
      const playingSongId = activeSong.value?.id
      playlist.value = newPlaylist

      if (playingSongId) {
        // 正在播放歌曲时，尝试在新列表中找到同一首歌
        const idx = newPlaylist.findIndex((s) => s.id === playingSongId)
        currentIndex.value = idx >= 0 ? idx : -1
      } else if (newPlaylist.length > 0) {
        currentIndex.value = 0
      }
    } catch (e) {
      console.error('Load playlist failed:', e)
    }
  }

  const getLyrics = async (song: Song) => {
    try {
      const text = await musicApi.lyric(song.server, song.id)
      lyrics.value = parseLyrics(text)
    } catch {
      lyrics.value = []
    }
  }

  const parseLyrics = (raw: string): LyricLine[] => {
    const lines: LyricLine[] = []
    for (const line of raw.split('\n')) {
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
      if (match) {
        const m = parseInt(match[1])
        const s = parseInt(match[2])
        const ms = parseInt(match[3])
        const time = m * 60 + s + ms / (match[3].length === 3 ? 1000 : 100)
        const text = match[4].trim()
        if (text) lines.push({ time, text })
      }
    }
    return lines
  }

  const playSong = async (song: Song, list?: Song[]) => {
    if (list) {
      playlist.value = [...list]
      currentIndex.value = list.findIndex((s) => s.id === song.id)
    } else {
      const existIdx = playlist.value.findIndex((s) => s.id === song.id)
      if (existIdx >= 0) {
        currentIndex.value = existIdx
      } else {
        playlist.value.push(song)
        currentIndex.value = playlist.value.length - 1
      }
    }

    isLoadingUrl.value = true
    activeSong.value = song
    playerBarVisible.value = true

    try {
      const url = musicApi.songUrlPath(song.server || 'netease', song.id)

      if (url) {
        songUrl.value = url
        isPlaying.value = true
        getLyrics(song)
        fetchSimiSongs(song.id)
        isLoadingUrl.value = false
        return true
      }
    } catch (e) {
      console.error('Get song url failed:', e)
    }

    isLoadingUrl.value = false
    return false
  }

  const togglePlay = () => {
    isPlaying.value = !isPlaying.value
  }

  const closePlayer = () => {
    playerBarVisible.value = false
    isPlaying.value = false
    activeSong.value = null
    songUrl.value = ''
    currentIndex.value = -1
    lyrics.value = []
    currentTime.value = 0
    duration.value = 0
  }

  const playNext = () => {
    if (playlist.value.length === 0) return
    let next: number
    if (playMode.value === 'random') {
      next = Math.floor(Math.random() * playlist.value.length)
    } else if (playMode.value === 'single') {
      next = currentIndex.value
    } else {
      next = (currentIndex.value + 1) % playlist.value.length
    }
    const song = playlist.value[next]
    if (song) playSong(song)
  }

  const playPrev = () => {
    if (playlist.value.length === 0) return
    let prev: number
    if (playMode.value === 'random') {
      prev = Math.floor(Math.random() * playlist.value.length)
    } else {
      prev = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length
    }
    const song = playlist.value[prev]
    if (song) playSong(song)
  }

  const setVolume = (v: number) => {
    volume.value = Math.max(0, Math.min(1, v))
    setStorage(STORAGE_KEYS.MUSIC_VOLUME, volume.value)
  }

  const getDefaultGroup = (): FavoriteGroup | null =>
    favoriteGroups.value.find((g) => g.isDefault) || null

  // 登录态：把本地收藏一次性迁移进账号默认组，随后清空本地
  const migrateLocalFavorites = async (defaultGroupId: number) => {
    if (localFavorites.value.length === 0) return
    const def = getDefaultGroup()
    if (!def) return
    const existing = new Set(def.songs.map((s) => s.id))
    for (const song of localFavorites.value) {
      if (existing.has(song.id)) continue
      try {
        await api.post(`/api/music-favorites/groups/${defaultGroupId}/songs`, { song })
      } catch {
        /* 忽略单项失败 */
      }
    }
    try {
      const { data } = await api.get<{ data: FavoriteGroup[] }>('/api/music-favorites/groups')
      favoriteGroups.value = data
      favorites.value = getDefaultGroup()?.songs ?? []
    } catch {}
    localFavorites.value = []
    setStorage(STORAGE_KEYS.MUSIC_FAVORITES, [])
  }

  // 登录后从服务端拉取全部收藏分组并水合；首次登录自动合并本地收藏
  const loadFavoriteGroups = async () => {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return
    isSyncingFavorites.value = true
    try {
      const { data } = await api.get<{ data: FavoriteGroup[] }>('/api/music-favorites/groups')
      favoriteGroups.value = data
      const def = getDefaultGroup()
      if (def) {
        favorites.value = def.songs
        await migrateLocalFavorites(def.id)
      }
    } catch (e) {
      console.error('加载音乐收藏分组失败:', e)
    } finally {
      groupsLoaded.value = true
      isSyncingFavorites.value = false
    }
  }

  // 点击爱心：切换“我的喜欢”成员（登录→服务端，未登录→本地）
  const toggleFavoriteSong = async (song: Song) => {
    const authStore = useAuthStore()
    if (authStore.isAuthenticated && groupsLoaded.value) {
      const def = getDefaultGroup()
      if (!def) return
      const inLikes = favorites.value.some((s) => s.id === song.id)
      try {
        if (inLikes) {
          await api.delete(`/api/music-favorites/groups/${def.id}/songs/${song.id}`)
          def.songs = def.songs.filter((s) => s.id !== song.id)
        } else {
          await api.post(`/api/music-favorites/groups/${def.id}/songs`, { song })
          def.songs = [...def.songs, song]
        }
        favorites.value = [...def.songs]
      } catch (e) {
        console.error('同步“我的喜欢”失败:', e)
      }
    } else {
      const idx = favorites.value.findIndex((s) => s.id === song.id)
      if (idx >= 0) {
        favorites.value.splice(idx, 1)
      } else {
        favorites.value.push(song)
      }
      localFavorites.value = favorites.value
      setStorage(STORAGE_KEYS.MUSIC_FAVORITES, favorites.value)
    }
  }

  const isFavoriteSong = (songId: string) => {
    return favorites.value.some((s) => s.id === songId)
  }

  // 新建收藏分组（登录后可用）
  const createFavoriteGroup = async (name: string): Promise<FavoriteGroup | null> => {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return null
    try {
      const { data } = await api.post<{ data: FavoriteGroup }>('/api/music-favorites/groups', {
        name,
      })
      favoriteGroups.value = [...favoriteGroups.value, data]
      return data
    } catch (e) {
      console.error('创建收藏分组失败:', e)
      return null
    }
  }

  // 删除收藏分组（默认组不可删）
  const deleteFavoriteGroup = async (groupId: number) => {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return
    try {
      await api.delete(`/api/music-favorites/groups/${groupId}`)
      favoriteGroups.value = favoriteGroups.value.filter((g) => g.id !== groupId)
    } catch (e) {
      console.error('删除收藏分组失败:', e)
    }
  }

  // 把歌曲加入某分组（已存在则忽略）
  const addToGroup = async (song: Song, groupId: number) => {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return
    const g = favoriteGroups.value.find((x) => x.id === groupId)
    if (!g || g.songs.some((s) => s.id === song.id)) return
    try {
      await api.post(`/api/music-favorites/groups/${groupId}/songs`, { song })
      g.songs = [...g.songs, song]
      if (g.isDefault) favorites.value = [...g.songs]
    } catch (e) {
      console.error('加入分组失败:', e)
    }
  }

  // 从某分组移除歌曲
  const removeFromGroup = async (songId: string, groupId: number) => {
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) return
    const g = favoriteGroups.value.find((x) => x.id === groupId)
    if (!g) return
    try {
      await api.delete(`/api/music-favorites/groups/${groupId}/songs/${songId}`)
      g.songs = g.songs.filter((s) => s.id !== songId)
      if (g.isDefault) favorites.value = [...g.songs]
    } catch (e) {
      console.error('移出分组失败:', e)
    }
  }

  const isInGroup = (songId: string, groupId: number) => {
    const g = favoriteGroups.value.find((x) => x.id === groupId)
    return !!g?.songs.some((s) => s.id === songId)
  }

  const toggleFavorite = () => {
    const song = activeSong.value || currentSong.value
    if (song) toggleFavoriteSong(song)
  }

  const cyclePlayMode = () => {
    const modes: Array<'list' | 'single' | 'random'> = ['list', 'single', 'random']
    const idx = modes.indexOf(playMode.value)
    playMode.value = modes[(idx + 1) % modes.length]
  }

  const removeSongFromPlaylist = (index: number) => {
    const removedSong = playlist.value[index]
    playlist.value.splice(index, 1)
    if (index < currentIndex.value) {
      currentIndex.value--
    } else if (index === currentIndex.value) {
      if (playlist.value.length === 0) {
        currentIndex.value = -1
        songUrl.value = ''
        isPlaying.value = false
        activeSong.value = null
      } else {
        currentIndex.value = Math.min(currentIndex.value, playlist.value.length - 1)
      }
    }
    // 如果移除的是当前播放歌曲且不在播放列表中了
    if (removedSong && activeSong.value?.id === removedSong.id) {
      const stillInList = playlist.value.some((s) => s.id === removedSong.id)
      if (!stillInList) {
        activeSong.value = null
      }
    }
  }

  // ===== Discover 发现页 =====
  const fetchDiscover = async () => {
    if (personalizedPlaylists.value.length > 0 && newSongs.value.length > 0) return
    isLoadingDiscover.value = true
    try {
      const [pl, ns] = await Promise.all([
        musicApi.personalized(12).catch(() => null),
        musicApi.topSong(0).catch(() => null),
      ])
      const results = (pl?.result as Record<string, unknown>[]) || []
      personalizedPlaylists.value = results.map(parsePlaylist)
      const data = (ns?.data as Record<string, unknown>[]) || []
      newSongs.value = data.slice(0, 24).map(parseNeteaseSong)
    } catch (e) {
      console.error('Fetch discover failed:', e)
    } finally {
      isLoadingDiscover.value = false
    }
  }

  const fetchPlaylistCats = async () => {
    if (playlistCats.value.length > 0) return
    try {
      const data = await musicApi.playlistCatlist()
      const sub = (data.sub as Record<string, unknown>[]) || []
      // 取热门标签（hot 优先），最多 14 个
      const hot = sub.filter((s) => s.hot).map((s) => s.name as string)
      const rest = sub.filter((s) => !s.hot).map((s) => s.name as string)
      playlistCats.value = ['全部', ...hot, ...rest].slice(0, 15)
    } catch (e) {
      console.error('Fetch catlist failed:', e)
      playlistCats.value = ['全部', '华语', '流行', '摇滚', '民谣', '电子']
    }
  }

  const fetchCatPlaylists = async (cat: string) => {
    activeCat.value = cat
    isLoadingCat.value = true
    try {
      const data = await musicApi.topPlaylist(cat)
      const playlists = (data.playlists as Record<string, unknown>[]) || []
      catPlaylists.value = playlists.map(parsePlaylist)
    } catch (e) {
      console.error('Fetch category playlists failed:', e)
      catPlaylists.value = []
    } finally {
      isLoadingCat.value = false
    }
  }

  // ===== 搜索增强 =====
  const fetchSearchSuggest = async (keyword: string) => {
    const q = keyword.trim()
    if (!q) {
      clearSuggestions()
      return
    }
    try {
      const data = await musicApi.searchSuggest(q)
      const result = (data.result as Record<string, unknown>) || {}
      const songs = ((result.songs as Record<string, unknown>[]) || []).map((s) => ({
        id: String(s.id),
        name: s.name as string,
        extra: ((s.artists as Record<string, unknown>[]) || [])
          .map((a) => a.name as string)
          .join(' / '),
      }))
      const artists = ((result.artists as Record<string, unknown>[]) || []).map((a) => ({
        id: String(a.id),
        name: a.name as string,
        picUrl: (a.img1v1Url as string) || (a.picUrl as string) || '',
      }))
      const albums = ((result.albums as Record<string, unknown>[]) || []).map((al) => ({
        id: String(al.id),
        name: al.name as string,
        extra: ((al.artist as Record<string, unknown>)?.name as string) || '',
        picUrl: (al.picUrl as string) || '',
      }))
      searchSuggestions.value = { songs, artists, albums }
    } catch (e) {
      console.error('Fetch suggest failed:', e)
      clearSuggestions()
    }
  }

  const clearSuggestions = () => {
    searchSuggestions.value = { songs: [], artists: [], albums: [] }
  }

  const fetchHotSearches = async () => {
    if (hotSearches.value.length > 0) return
    try {
      const data = await musicApi.searchHot()
      const list = (data.data as Record<string, unknown>[]) || []
      hotSearches.value = list.slice(0, 12).map((h) => ({
        searchWord: h.searchWord as string,
        score: (h.score as number) || 0,
        iconUrl: (h.iconUrl as string) || '',
        content: (h.content as string) || '',
      }))
    } catch (e) {
      console.error('Fetch hot searches failed:', e)
    }
  }

  // ===== 歌手 / 专辑详情 =====
  const openArtist = async (artistId: string) => {
    if (!artistId) return
    detailView.value = 'artist'
    isLoadingArtist.value = true
    currentArtist.value = null
    artistHotSongs.value = []
    artistAlbums.value = []
    try {
      const [detail, albums] = await Promise.all([
        musicApi.artist(artistId),
        musicApi.artistAlbum(artistId, 30).catch(() => null),
      ])
      const a = (detail.artist as Record<string, unknown>) || {}
      currentArtist.value = {
        id: String(a.id ?? artistId),
        name: (a.name as string) || '未知歌手',
        picUrl: (a.picUrl as string) || (a.img1v1Url as string) || '',
        musicSize: a.musicSize as number | undefined,
        albumSize: a.albumSize as number | undefined,
        briefDesc: a.briefDesc as string | undefined,
      }
      artistHotSongs.value = ((detail.hotSongs as Record<string, unknown>[]) || []).map(
        parseNeteaseSong,
      )
      const hotAlbums = (albums?.hotAlbums as Record<string, unknown>[]) || []
      artistAlbums.value = hotAlbums.map(parseAlbum)
    } catch (e) {
      console.error('Open artist failed:', e)
    } finally {
      isLoadingArtist.value = false
    }
  }

  const openAlbum = async (albumId: string) => {
    if (!albumId) return
    detailView.value = 'album'
    isLoadingAlbum.value = true
    currentAlbum.value = null
    albumSongs.value = []
    try {
      const data = await musicApi.album(albumId)
      const al = (data.album as Record<string, unknown>) || {}
      currentAlbum.value = parseAlbum(al)
      albumSongs.value = ((data.songs as Record<string, unknown>[]) || []).map(parseNeteaseSong)
    } catch (e) {
      console.error('Open album failed:', e)
    } finally {
      isLoadingAlbum.value = false
    }
  }

  const closeDetail = () => {
    detailView.value = 'none'
  }

  // ===== 相似推荐 =====
  const fetchSimiSongs = async (songId: string) => {
    if (!songId) {
      simiSongs.value = []
      return
    }
    isLoadingSimi.value = true
    try {
      const data = await musicApi.simiSong(songId, 20)
      simiSongs.value = ((data.songs as Record<string, unknown>[]) || []).map(parseNeteaseSong)
    } catch (e) {
      console.error('Fetch similar songs failed:', e)
      simiSongs.value = []
    } finally {
      isLoadingSimi.value = false
    }
  }

  const formatDuration = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${String(sec).padStart(2, '0')}`
  }

  return {
    searchQuery,
    searchResults,
    isSearching,
    searchServer,
    playlist,
    currentIndex,
    activeSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    playMode,
    songUrl,
    showPlaylist,
    playerBarVisible,
    lyrics,
    isLoadingUrl,
    recommendPlaylists,
    isLoadingRecommend,
    // discover
    personalizedPlaylists,
    newSongs,
    isLoadingDiscover,
    playlistCats,
    activeCat,
    catPlaylists,
    isLoadingCat,
    // search enhance
    searchSuggestions,
    hotSearches,
    // detail
    detailView,
    currentArtist,
    artistHotSongs,
    artistAlbums,
    isLoadingArtist,
    currentAlbum,
    albumSongs,
    isLoadingAlbum,
    // similar
    simiSongs,
    isLoadingSimi,
    searchHistory,
    favorites,
    favoriteGroups,
    groupsLoaded,
    isSyncingFavorites,
    currentSong,
    currentLyricIndex,
    isFavorite,
    searchSongs,
    fetchRecommendPlaylists,
    loadPlaylistTracks,
    playSong,
    // new methods
    fetchDiscover,
    fetchPlaylistCats,
    fetchCatPlaylists,
    fetchSearchSuggest,
    clearSuggestions,
    fetchHotSearches,
    openArtist,
    openAlbum,
    closeDetail,
    fetchSimiSongs,
    togglePlay,
    closePlayer,
    playNext,
    playPrev,
    setVolume,
    toggleFavorite,
    isFavoriteSong,
    toggleFavoriteSong,
    loadFavoriteGroups,
    createFavoriteGroup,
    deleteFavoriteGroup,
    addToGroup,
    removeFromGroup,
    isInGroup,
    cyclePlayMode,
    removeSongFromPlaylist,
    formatDuration,
    removeSearchHistory,
    clearSearchHistory,
  }
})
