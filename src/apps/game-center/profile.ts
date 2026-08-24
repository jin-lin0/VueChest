import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config/storage-keys'

export type GameId = 'racing' | 'rhythm' | 'snake' | 'neon-survivor'

export interface GameResult {
  id: string
  gameId: GameId
  playedAt: number
  score?: number
  won?: boolean
  rank?: string | number
  duration?: number
  metadata?: Record<string, string | number | boolean | null>
}

export interface GameCenterProfile {
  version: 2
  launches: Record<GameId, number>
  recent: Array<{ gameId: GameId; openedAt: number }>
  results: GameResult[]
  dailyCompletions: Record<string, { gameId: GameId; completedAt: number; resultId: string }>
  streak: { current: number; best: number; lastDate: string }
}

export interface DailyChallenge {
  gameId: GameId
  title: string
  detail: string
  route: string
}

export interface GameArchive {
  version: 2
  exportedAt: string
  profile: GameCenterProfile
  gameData: {
    racingSave: unknown
    racingSettings: unknown
    racingConfig: unknown
    rhythmSettings: unknown
    survivorBestScore: number
    survivorSound: boolean
  }
}

export const DEFAULT_GAME_PROFILE: GameCenterProfile = {
  version: 2,
  launches: { racing: 0, rhythm: 0, snake: 0, 'neon-survivor': 0 },
  recent: [],
  results: [],
  dailyCompletions: {},
  streak: { current: 0, best: 0, lastDate: '' },
}

const ROUTES: Record<GameId, string> = {
  racing: '/racing',
  rhythm: '/rhythm',
  snake: '/snake',
  'neon-survivor': '/neon-survivor',
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function previousDateKey(key: string) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() - 1)
  return dateKey(date)
}

export function normalizeGameProfile(value: unknown): GameCenterProfile {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_GAME_PROFILE)
  const raw = value as Partial<GameCenterProfile>
  const ids = Object.keys(ROUTES) as GameId[]
  const results = Array.isArray(raw.results)
    ? raw.results
        .filter((item): item is GameResult =>
          Boolean(item && ids.includes(item.gameId) && Number.isFinite(item.playedAt)),
        )
        .slice(0, 200)
    : []
  const dailyCompletions = Object.fromEntries(
    Object.entries(raw.dailyCompletions || {}).filter(([, item]) =>
      Boolean(
        item && ids.includes(item.gameId) && Number.isFinite(item.completedAt) && item.resultId,
      ),
    ),
  )
  return {
    version: 2,
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
    results,
    dailyCompletions,
    streak: {
      current: Math.max(0, Number(raw.streak?.current) || 0),
      best: Math.max(0, Number(raw.streak?.best) || 0),
      lastDate: typeof raw.streak?.lastDate === 'string' ? raw.streak.lastDate : '',
    },
  }
}

export function loadGameProfile(): GameCenterProfile {
  return normalizeGameProfile(
    getStorage<GameCenterProfile>(STORAGE_KEYS.GAME_CENTER_PROFILE, DEFAULT_GAME_PROFILE),
  )
}

function save(profile: GameCenterProfile) {
  setStorage(STORAGE_KEYS.GAME_CENTER_PROFILE, profile)
  return profile
}

export function recordGameLaunch(gameId: GameId): GameCenterProfile {
  const profile = loadGameProfile()
  profile.launches[gameId] += 1
  profile.recent = [
    { gameId, openedAt: Date.now() },
    ...profile.recent.filter((item) => item.gameId !== gameId),
  ].slice(0, 12)
  return save(profile)
}

export function recordGameLaunchFromRoute(path: string): GameCenterProfile | null {
  const match = (Object.entries(ROUTES) as Array<[GameId, string]>).find(
    ([, route]) => path === route || path.startsWith(`${route}/`),
  )
  return match ? recordGameLaunch(match[0]) : null
}

export function recordGameResult(
  gameId: GameId,
  result: Omit<GameResult, 'id' | 'gameId' | 'playedAt'>,
): GameCenterProfile {
  return save(applyGameResult(loadGameProfile(), gameId, result))
}

export function applyGameResult(
  value: GameCenterProfile,
  gameId: GameId,
  result: Omit<GameResult, 'id' | 'gameId' | 'playedAt'>,
  playedAt = Date.now(),
): GameCenterProfile {
  const profile = normalizeGameProfile(structuredClone(value))
  const entry: GameResult = { ...result, id: crypto.randomUUID(), gameId, playedAt }
  profile.results = [entry, ...profile.results].slice(0, 200)
  const resultDate = new Date(playedAt)
  const today = dateKey(resultDate)
  if (dailyChallenge(resultDate).gameId === gameId && !profile.dailyCompletions[today]) {
    profile.dailyCompletions[today] = { gameId, completedAt: entry.playedAt, resultId: entry.id }
    const continued = profile.streak.lastDate === previousDateKey(today)
    profile.streak.current = continued ? profile.streak.current + 1 : 1
    profile.streak.best = Math.max(profile.streak.best, profile.streak.current)
    profile.streak.lastDate = today
  }
  return profile
}

export function isDailyChallengeComplete(profile: GameCenterProfile, date = new Date()) {
  return Boolean(profile.dailyCompletions[dateKey(date)])
}

export function dailyChallenge(date: Date): DailyChallenge {
  const dayKey = Number(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`,
  )
  const challenges: DailyChallenge[] = [
    { gameId: 'racing', title: '计时赛', detail: '完成一场比赛并产生有效结算', route: '/racing' },
    { gameId: 'rhythm', title: '节奏练习', detail: '完成一首歌曲并生成结算成绩', route: '/rhythm' },
    { gameId: 'snake', title: '对战练习', detail: '完成一局本地或人机对战', route: '/snake' },
    {
      gameId: 'neon-survivor',
      title: '生存挑战',
      detail: '完成一局幸存者远征',
      route: '/neon-survivor',
    },
  ]
  return challenges[dayKey % challenges.length]
}

export function exportGameArchive(): GameArchive {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: loadGameProfile(),
    gameData: {
      racingSave: getStorage<unknown>(STORAGE_KEYS.RACING_SAVE),
      racingSettings: getStorage<unknown>(STORAGE_KEYS.RACING_SETTINGS),
      racingConfig: getStorage<unknown>(STORAGE_KEYS.RACING_CONFIG),
      rhythmSettings: getStorage<unknown>(STORAGE_KEYS.RHYTHM_SETTINGS),
      survivorBestScore: getStorage<number>(STORAGE_KEYS.SURVIVOR_BEST_SCORE, 0) || 0,
      survivorSound: getStorage<boolean>(STORAGE_KEYS.SURVIVOR_SOUND, true) !== false,
    },
  }
}

export function importGameArchive(value: unknown) {
  if (!value || typeof value !== 'object' || (value as GameArchive).version !== 2)
    throw new Error('游戏存档格式不正确')
  const archive = value as GameArchive
  const gameData = archive.gameData
  if (!gameData || typeof gameData !== 'object') throw new Error('游戏存档数据不完整')
  save(normalizeGameProfile(archive.profile))
  for (const [key, item] of [
    [STORAGE_KEYS.RACING_SAVE, gameData.racingSave],
    [STORAGE_KEYS.RACING_SETTINGS, gameData.racingSettings],
    [STORAGE_KEYS.RACING_CONFIG, gameData.racingConfig],
    [STORAGE_KEYS.RHYTHM_SETTINGS, gameData.rhythmSettings],
  ] as const) {
    if (item && typeof item === 'object') setStorage(key, item)
  }
  if (Number.isFinite(gameData.survivorBestScore)) {
    setStorage(STORAGE_KEYS.SURVIVOR_BEST_SCORE, Math.max(0, gameData.survivorBestScore))
  }
  if (typeof gameData.survivorSound === 'boolean') {
    setStorage(STORAGE_KEYS.SURVIVOR_SOUND, gameData.survivorSound)
  }
}
