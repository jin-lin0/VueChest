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
