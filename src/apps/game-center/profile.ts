import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config/storage-keys'

export type GameId = 'racing' | 'rhythm' | 'snake' | 'neon-survivor'

export interface GameCenterProfile {
  version: 1
  launches: Record<GameId, number>
  recent: Array<{ gameId: GameId; openedAt: number }>
}

export interface DailyChallenge {
  gameId: GameId
  title: string
  detail: string
  route: string
}

export const DEFAULT_GAME_PROFILE: GameCenterProfile = {
  version: 1,
  launches: { racing: 0, rhythm: 0, snake: 0, 'neon-survivor': 0 },
  recent: [],
}

const ROUTES: Record<GameId, string> = {
  racing: '/racing',
  rhythm: '/rhythm',
  snake: '/snake',
  'neon-survivor': '/neon-survivor',
}

export function normalizeGameProfile(value: unknown): GameCenterProfile {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_GAME_PROFILE)
  const raw = value as Partial<GameCenterProfile>
  const ids = Object.keys(ROUTES) as GameId[]
  return {
    version: 1,
    launches: Object.fromEntries(
      ids.map((id) => [id, Math.max(0, Number(raw.launches?.[id]) || 0)]),
    ) as Record<GameId, number>,
    recent: Array.isArray(raw.recent)
      ? raw.recent
          .filter((item): item is { gameId: GameId; openedAt: number } =>
            Boolean(item && ids.includes(item.gameId) && Number.isFinite(item.openedAt)),
          )
          .slice(0, 12)
      : [],
  }
}

export function loadGameProfile(): GameCenterProfile {
  return normalizeGameProfile(
    getStorage<GameCenterProfile>(STORAGE_KEYS.GAME_CENTER_PROFILE, DEFAULT_GAME_PROFILE),
  )
}

export function recordGameLaunch(gameId: GameId): GameCenterProfile {
  const profile = loadGameProfile()
  profile.launches[gameId] += 1
  profile.recent = [
    { gameId, openedAt: Date.now() },
    ...profile.recent.filter((item) => item.gameId !== gameId),
  ].slice(0, 12)
  setStorage(STORAGE_KEYS.GAME_CENTER_PROFILE, profile)
  return profile
}

export function recordGameLaunchFromRoute(path: string): GameCenterProfile | null {
  const match = (Object.entries(ROUTES) as Array<[GameId, string]>).find(
    ([, route]) => path === route || path.startsWith(`${route}/`),
  )
  return match ? recordGameLaunch(match[0]) : null
}

export function dailyChallenge(date: Date): DailyChallenge {
  const dayKey = Number(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`,
  )
  const challenges: DailyChallenge[] = [
    {
      gameId: 'racing',
      title: '计时赛',
      detail: '在任意固定赛道完成一圈有效成绩',
      route: '/racing',
    },
    { gameId: 'rhythm', title: '节奏练习', detail: '完成一首歌曲并保持连续击打', route: '/rhythm' },
    { gameId: 'snake', title: '对战练习', detail: '完成一局本地或人机对战', route: '/snake' },
    {
      gameId: 'neon-survivor',
      title: '生存挑战',
      detail: '完成一局并刷新本机最高分',
      route: '/neon-survivor',
    },
  ]
  return challenges[dayKey % challenges.length]
}
