// 音乐数据层统一出口：路由配置化 + 单一请求层。
//
// 说明：netease 后端（/api/netease/*）与 meting 代理（/meting-api）返回的
// 都是第三方原始结构，不带项目约定的 { success, data } 字段，也不能统一 res.json()
// （meting 歌词是纯文本）。因此这里用**独立**的请求层，不依赖 lib/request 的 api 封装，
// 只做 ok 校验 + 缓存 + 错误标准化。收藏分组等自有后端接口仍走 api 封装。

import { API_BASE } from '@/lib/request'

// /api/netease/* 必须指向自有后端
const BACKEND = API_BASE
// /meting-api 走相对路径：dev 经 vite 代理，prod 经 vercel.json rewrite，不加 base

// ===== 路由配置表（全仓唯一路径来源）=====
export const MUSIC_ENDPOINTS = {
  // —— 自有后端 /api/netease/*（NeteaseCloudMusicApi 原始 shape）——
  search: (kw: string, limit = 30) =>
    `/api/netease/search?keywords=${encodeURIComponent(kw)}&limit=${limit}`,
  toplist: () => `/api/netease/toplist`,
  personalized: (limit = 12) => `/api/netease/personalized?limit=${limit}`,
  topSong: (type = 0) => `/api/netease/top/song?type=${type}`,
  playlistCatlist: () => `/api/netease/playlist/catlist`,
  topPlaylist: (cat: string, limit = 18) =>
    `/api/netease/top/playlist?limit=${limit}&cat=${encodeURIComponent(cat)}`,
  searchSuggest: (kw: string) => `/api/netease/search/suggest?keywords=${encodeURIComponent(kw)}`,
  searchHot: () => `/api/netease/search/hot`,
  artist: (id: string) => `/api/netease/artist?id=${id}`,
  artistAlbum: (id: string, limit = 30) => `/api/netease/artist/album?id=${id}&limit=${limit}`,
  album: (id: string) => `/api/netease/album?id=${id}`,
  artistList: (area: number, limit = 30) => `/api/netease/artist/list?area=${area}&limit=${limit}`,
  simiSong: (id: string, limit = 20) => `/api/netease/simi/song?id=${id}&limit=${limit}`,

  // —— meting 代理 /meting-api（扁平结构，歌词为纯文本）——
  playlistTracks: (server: string, id: string) =>
    `/meting-api?server=${server}&type=playlist&id=${id}`,
  songUrl: (server: string, id: string) => `/meting-api?server=${server}&type=url&id=${id}`,
  lyric: (server: string, id: string) => `/meting-api?server=${server}&type=lrc&id=${id}`,
}

// ===== 缓存 =====
const CACHE_TTL = 5 * 60 * 1000
const cache: Record<string, { data: unknown; expire: number }> = {}

function readCache<T>(key: string): T | null {
  const entry = cache[key]
  if (entry && Date.now() < entry.expire) return entry.data as T
  delete cache[key]
  return null
}

function writeCache(key: string, data: unknown) {
  cache[key] = { data, expire: Date.now() + CACHE_TTL }
}

// ===== 请求层（第三方结构：无 success 校验，只校验 HTTP 状态）=====
async function requestJson<T>(path: string, base: string, cacheKey?: string): Promise<T> {
  if (cacheKey) {
    const hit = readCache<T>(cacheKey)
    if (hit) return hit
  }
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`Music API error: ${res.status}`)
  const data = (await res.json()) as T
  if (cacheKey) writeCache(cacheKey, data)
  return data
}

async function requestText(path: string, base: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const hit = readCache<string>(cacheKey)
    if (hit) return hit
  }
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`Music API error: ${res.status}`)
  const text = await res.text()
  if (cacheKey) writeCache(cacheKey, text)
  return text
}

// ===== 业务服务（store 只调这些，不再出现 raw fetch / 硬编码 URL）=====
export const musicApi = {
  // —— netease 后端（base = BACKEND）——
  search(keyword: string, limit = 30) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.search(keyword, limit),
      BACKEND,
      `search:${keyword}:${limit}`,
    )
  },
  toplist() {
    return requestJson<Record<string, unknown>>(MUSIC_ENDPOINTS.toplist(), BACKEND, 'toplist')
  },
  personalized(limit = 12) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.personalized(limit),
      BACKEND,
      `personalized:${limit}`,
    )
  },
  topSong(type = 0) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.topSong(type),
      BACKEND,
      `newsong:${type}`,
    )
  },
  playlistCatlist() {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.playlistCatlist(),
      BACKEND,
      'catlist',
    )
  },
  topPlaylist(cat: string, limit = 18) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.topPlaylist(cat, limit),
      BACKEND,
      `catpl:${cat}:${limit}`,
    )
  },
  searchSuggest(keyword: string) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.searchSuggest(keyword),
      BACKEND,
      `suggest:${keyword}`,
    )
  },
  searchHot() {
    return requestJson<Record<string, unknown>>(MUSIC_ENDPOINTS.searchHot(), BACKEND, 'hotsearch')
  },
  artist(id: string) {
    return requestJson<Record<string, unknown>>(MUSIC_ENDPOINTS.artist(id), BACKEND, `artist:${id}`)
  },
  artistAlbum(id: string, limit = 30) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.artistAlbum(id, limit),
      BACKEND,
      `artistalbum:${id}:${limit}`,
    )
  },
  album(id: string) {
    return requestJson<Record<string, unknown>>(MUSIC_ENDPOINTS.album(id), BACKEND, `album:${id}`)
  },
  artistList(area: number, limit = 30) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.artistList(area, limit),
      BACKEND,
      `artistlist:${area}:${limit}`,
    )
  },
  simiSong(id: string, limit = 20) {
    return requestJson<Record<string, unknown>>(
      MUSIC_ENDPOINTS.simiSong(id, limit),
      BACKEND,
      `simi:${id}:${limit}`,
    )
  },

  // —— meting 代理（base = '' 相对路径）——
  playlistTracks(server: string, id: string) {
    return requestJson<Record<string, unknown>[]>(
      MUSIC_ENDPOINTS.playlistTracks(server, id),
      '',
      `playlist:${server}:${id}`,
    )
  },
  // 返回可直接作为 <audio src> 的流地址（meting 端点本身）
  songUrlPath(server: string, id: string) {
    return MUSIC_ENDPOINTS.songUrl(server, id)
  },
  lyric(server: string, id: string) {
    return requestText(MUSIC_ENDPOINTS.lyric(server, id), '', `lrc:${server}:${id}`)
  },
}
