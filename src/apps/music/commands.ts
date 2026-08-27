import { useMusicStore } from '@/stores/music'
import { defineAppCommandProvider } from '@/lib/app-command'

export function useMusicCommandProvider() {
  const music = useMusicStore()

  return defineAppCommandProvider({
    appKey: 'builtin:10',
    appName: '音乐播放',
    commands: () => [
      {
        id: 'music-random-play',
        label: '随机播放音乐',
        description: '从播放队列、收藏、历史或推荐新歌中随机播放',
        icon: '⤨',
        keywords: ['音乐', '随机', '播放', 'shuffle', 'random'],
        priority: 100,
        execute: async () => {
          const song = await music.playRandom()
          if (!song) throw new Error('暂时没有可播放的音乐')
          return { message: `正在播放：${song.name} · ${song.artists}` }
        },
      },
      {
        id: 'music-toggle-play',
        label: music.isPlaying ? '暂停音乐' : '继续播放音乐',
        description: music.activeSong
          ? `${music.activeSong.name} · ${music.activeSong.artists}`
          : '当前没有正在播放的歌曲',
        icon: music.isPlaying ? 'Ⅱ' : '▶',
        keywords: ['音乐', '播放', '暂停', '继续', 'pause', 'resume'],
        priority: 80,
        disabledReason: () => (music.activeSong ? null : '当前没有正在播放的歌曲'),
        execute: () => {
          music.togglePlay()
          return { message: music.isPlaying ? '已继续播放' : '音乐已暂停' }
        },
      },
      {
        id: 'music-next',
        label: '播放下一首',
        description: music.playlist.length
          ? `当前队列 ${music.playlist.length} 首`
          : '播放队列为空',
        icon: '≫',
        keywords: ['音乐', '下一首', '切歌', 'next'],
        priority: 70,
        disabledReason: () => (music.playlist.length ? null : '播放队列为空'),
        execute: () => {
          music.playNext()
          return { message: '已切换到下一首' }
        },
      },
    ],
  })
}
