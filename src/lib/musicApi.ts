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
export const CACHE_TTL = 5 * 60 * 1000

/**
 * 条目上限。key 里带**用户输入**（`search:${keyword}`、`suggest:${keyword}`）和各类
 * 歌曲/歌手/专辑 id，长会话里只增不减，而每条还压着完整的响应体（搜索结果可达几十 KB）。
 * 不设上限就是一个稳定泄漏；300 条足够覆盖「来回切页」的热点。
 */
export const MAX_CACHE_ENTRIES = 300

// 用 Map 而不是普通对象：既保插入顺序（据此淘汰最久未用），也不受原型键（'constructor' 等）干扰。
const cache = new Map<string, { data: unknown; expire: number }>()

/**
 * 命中判定只看「有没有这条、过没过期」，**不能看 data 的真假**。
 * 空歌词是上游的正常返回——实测 https://meting.mikus.ink/api?...&type=lrc&id=abc
 * 回的是 HTTP 200 + 0 字节；用真假判命中会让这类结果每次都被重拉（缓存写了却永远读不出来）。
 */
function readCache<T>(key: string): { hit: boolean; data?: T } {
  const entry = cache.get(key)
  if (!entry) return { hit: false }
  if (Date.now() >= entry.expire) {
    cache.delete(key)
    return { hit: false }
  }
  // 命中即移到末尾：淘汰顺序按「最久未用」而不是「最早写入」
  cache.delete(key)
  cache.set(key, entry)
  return { hit: true, data: entry.data as T }
}

function writeCache(key: string, data: unknown) {
  cache.delete(key)
  cache.set(key, { data, expire: Date.now() + CACHE_TTL })
  if (cache.size <= MAX_CACHE_ENTRIES) return

  // 超限：先批量丢掉已过期的（LRU 顺序下它们必然排在最前面，这里只是把逐条淘汰合成一次），
  // 再从最久未用的开始淘汰到上限。
  const now = Date.now()
  for (const [k, entry] of cache) {
    if (now >= entry.expire) cache.delete(k)
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

// ===== 请求层（第三方结构：无 success 校验，只校验 HTTP 状态）=====
async function requestJson<T>(path: string, base: string, cacheKey?: string): Promise<T> {
  if (cacheKey) {
    const cached = readCache<T>(cacheKey)
    if (cached.hit) return cached.data as T
  }
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`Music API error: ${res.status}`)
  const data = (await res.json()) as T
  if (cacheKey) writeCache(cacheKey, data)
  return data
}

async function requestText(path: string, base: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const cached = readCache<string>(cacheKey)
    if (cached.hit) return cached.data as string
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
