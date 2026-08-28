import { describe, expect, it } from 'vitest'
import {
  formatMusicDuration,
  parseLyrics,
  parseMetingSong,
  parseNeteaseSong,
} from '../music-parsers'

describe('music parsers', () => {
  it('规整 Meting 与网易云歌曲字段', () => {
    expect(
      parseMetingSong({
        title: 'Song A',
        author: 'Artist A',
        album: 'Album A',
        pic: 'cover-a',
        url: 'https://example.com/song?id=42',
      }),
    ).toMatchObject({ id: '42', name: 'Song A', artists: 'Artist A', server: 'netease' })

    expect(
      parseNeteaseSong({
        id: 7,
        name: 'Song B',
        ar: [{ id: 3, name: 'Artist B' }],
        al: { id: 5, name: 'Album B', picUrl: 'cover-b' },
        dt: 125000,
      }),
    ).toMatchObject({
      id: '7',
      artists: 'Artist B',
      albumId: '5',
      artistId: '3',
      duration: 125000,
    })
  })

  it('解析双位和三位毫秒歌词时间', () => {
    expect(parseLyrics('[00:01.50]第一句\n[01:02.125]第二句\n[ar:作者]')).toEqual([
      { time: 1.5, text: '第一句' },
      { time: 62.125, text: '第二句' },
    ])
  })

  it('格式化毫秒时长', () => {
    expect(formatMusicDuration(125000)).toBe('2:05')
  })
})
