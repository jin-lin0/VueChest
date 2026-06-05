import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage } from '@/utils'
import { STORAGE_KEYS } from '@/config'

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

interface ApiCache {
  [key: string]: { data: unknown; expire: number }
}

const CACHE_TTL = 5 * 60 * 1000

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

  // Recommended playlists
  const recommendPlaylists = ref<Playlist[]>([])
  const isLoadingRecommend = ref(false)

  // Search history
  const searchHistory = ref<string[]>(
    getStorage<string[]>(STORAGE_KEYS.MUSIC_SEARCH_HISTORY, []) || [],
  )

  // Favorites
  const favorites = ref<Song[]>(getStorage<Song[]>(STORAGE_KEYS.MUSIC_FAVORITES, []) || [])

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

  const cache: ApiCache = {}

  const getCached = <T>(key: string): T | null => {
    const entry = cache[key]
    if (entry && Date.now() < entry.expire) return entry.data as T
    delete cache[key]
    return null
  }

  const setCache = (key: string, data: unknown) => {
    cache[key] = { data, expire: Date.now() + CACHE_TTL }
  }

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

  // 解析网易云搜索结果
  const parseNeteaseSong = (song: Record<string, unknown>): Song => {
    const artists =
      (song.ar as Record<string, unknown>[]) || (song.artists as Record<string, unknown>[]) || []
    const album =
      (song.al as Record<string, unknown>) || (song.album as Record<string, unknown>) || {}
    return {
      id: String(song.id),
      name: (song.name as string) || '未知',
      artists: artists.map((a) => a.name as string).join(' / ') || '未知',
      album: (album.name as string) || '未知',
      coverUrl: (album.picUrl as string) || '',
      url: '',
      server: 'netease',
      duration: song.dt as number | undefined,
      fee: song.fee as number | undefined,
      mvId: song.mv as number | undefined,
      sq: !!song.sq,
    }
  }

  const searchSongs = async (keyword: string) => {
    const q = keyword.trim()
    if (!q) return
    isSearching.value = true
    searchQuery.value = q
    addSearchHistory(q)
    try {
      const cacheKey = `search:${searchServer.value}:${q}`
      let data = getCached<Record<string, unknown>>(cacheKey)
      if (!data) {
        const res = await fetch(`${SERVER_API}/netease/search?keywords=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error(`Server API error: ${res.status}`)
        data = await res.json()
        setCache(cacheKey, data)
      }
      const result = data as Record<string, unknown>
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

  const SERVER_API = 'https://server.020201.xyz'

  const fetchRecommendPlaylists = async () => {
    isLoadingRecommend.value = true
    try {
      const cacheKey = 'toplist:netease'
      let data = getCached<Record<string, unknown>>(cacheKey)
      if (!data) {
        const res = await fetch(`${SERVER_API}/netease/toplist`)
        if (!res.ok) throw new Error(`Server API error: ${res.status}`)
        data = await res.json()
        setCache(cacheKey, data)
      }

      const toplist = (data as Record<string, unknown>).list as Record<string, unknown>[]
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
          const playlistId = String(item.id)
          const cacheKey = `playlist:netease:${playlistId}`
          if (!getCached(cacheKey)) {
            fetch(`/meting-api?server=netease&type=playlist&id=${playlistId}`)
              .then((res) => res.json())
              .then((data) => setCache(cacheKey, data))
              .catch(() => {})
          }
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
      const cacheKey = `playlist:${server}:${playlistId}`
      let data = getCached<Record<string, unknown>[]>(cacheKey)
      if (!data) {
        const res = await fetch(`/meting-api?server=${server}&type=playlist&id=${playlistId}`)
        if (!res.ok) throw new Error(`Meting API error: ${res.status}`)
        data = await res.json()
        setCache(cacheKey, data)
      }
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
      const cacheKey = `lrc:${song.server}:${song.id}`
      let text = getCached<string>(cacheKey)
      if (!text) {
        const res = await fetch(`/meting-api?server=${song.server}&type=lrc&id=${song.id}`)
        if (!res.ok) throw new Error(`Meting API error: ${res.status}`)
        text = await res.text()
        setCache(cacheKey, text)
      }
      lyrics.value = parseLyrics(text!)
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
      playlist.value = list
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
      const cacheKey = `songurl:${song.id}`
      let url = getCached<string>(cacheKey)
      if (!url) {
        // 优先使用 meting-api（直接返回音频流，稳定可靠）
        url = `/meting-api?server=netease&type=url&id=${song.id}`
        setCache(cacheKey, url)
      }

      if (url) {
        songUrl.value = url
        isPlaying.value = true
        getLyrics(song)
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

  const toggleFavorite = () => {
    const song = activeSong.value || currentSong.value
    if (!song) return
    const idx = favorites.value.findIndex((s) => s.id === song.id)
    if (idx >= 0) {
      favorites.value.splice(idx, 1)
    } else {
      favorites.value.unshift(song)
    }
    setStorage(STORAGE_KEYS.MUSIC_FAVORITES, favorites.value)
  }

  const isFavoriteSong = (songId: string) => {
    return favorites.value.some((s) => s.id === songId)
  }

  const toggleFavoriteSong = (song: Song) => {
    const idx = favorites.value.findIndex((s) => s.id === song.id)
    if (idx >= 0) {
      favorites.value.splice(idx, 1)
    } else {
      favorites.value.push(song)
    }
    setStorage(STORAGE_KEYS.MUSIC_FAVORITES, favorites.value)
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
    searchHistory,
    favorites,
    currentSong,
    currentLyricIndex,
    isFavorite,
    searchSongs,
    fetchRecommendPlaylists,
    loadPlaylistTracks,
    playSong,
    togglePlay,
    closePlayer,
    playNext,
    playPrev,
    setVolume,
    toggleFavorite,
    isFavoriteSong,
    toggleFavoriteSong,
    cyclePlayMode,
    removeSongFromPlaylist,
    formatDuration,
    removeSearchHistory,
    clearSearchHistory,
  }
})
