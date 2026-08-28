import type { Album, Artist, LyricLine, Playlist, Song } from './music-types'

export function extractMusicId(url: string): string {
  const match = url.match(/[?&]id=(\d+)/)
  return match ? match[1] : ''
}

export function parseMetingSong(raw: Record<string, unknown>): Song {
  const apiUrl = (raw.url as string) || ''
  return {
    id: extractMusicId(apiUrl),
    name: (raw.title as string) || '未知',
    artists: (raw.author as string) || '未知',
    album: (raw.album as string) || '未知',
    coverUrl: (raw.pic as string) || '',
    url: apiUrl,
    server: 'netease',
  }
}

export function parseNeteaseSong(song: Record<string, unknown>): Song {
  const artists =
    (song.ar as Record<string, unknown>[]) || (song.artists as Record<string, unknown>[]) || []
  const album =
    (song.al as Record<string, unknown>) || (song.album as Record<string, unknown>) || {}
  const firstArtistId = artists[0]?.id
  return {
    id: String(song.id),
    name: (song.name as string) || '未知',
    artists: artists.map((artist) => artist.name as string).join(' / ') || '未知',
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

export function parseMusicPlaylist(raw: Record<string, unknown>): Playlist {
  return {
    id: String(raw.id),
    name: (raw.name as string) || '未知歌单',
    coverUrl: (raw.coverImgUrl as string) || (raw.picUrl as string) || '',
    trackCount: (raw.trackCount as number) || 0,
    description: (raw.description as string) || '',
    server: 'netease',
  }
}

export function parseMusicAlbum(raw: Record<string, unknown>): Album {
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

export function parseMusicArtist(raw: Record<string, unknown>): Artist {
  return {
    id: String(raw.id),
    name: (raw.name as string) || '未知歌手',
    picUrl: (raw.picUrl as string) || '',
    musicSize: raw.musicSize as number | undefined,
    albumSize: raw.albumSize as number | undefined,
    briefDesc: raw.briefDesc as string | undefined,
  }
}

export function parseLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
    if (!match) continue
    const minutes = Number.parseInt(match[1])
    const seconds = Number.parseInt(match[2])
    const milliseconds = Number.parseInt(match[3])
    const time =
      minutes * 60 + seconds + milliseconds / (match[3].length === 3 ? 1000 : 100)
    const text = match[4].trim()
    if (text) lines.push({ time, text })
  }
  return lines
}

export function formatMusicDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
