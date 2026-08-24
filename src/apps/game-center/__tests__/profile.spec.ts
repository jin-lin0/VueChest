import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/config/storage-keys'

const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>() }))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
}))

import {
  applyGameResult,
  dailyChallenge,
  exportGameArchive,
  importGameArchive,
  normalizeGameProfile,
} from '../profile'

beforeEach(() => mocks.storage.clear())

describe('game center profile', () => {
  it('normalizes damaged local data', () => {
    const result = normalizeGameProfile({ launches: { racing: -2, rhythm: 3 }, recent: [] })
    expect(result.launches.racing).toBe(0)
    expect(result.launches.rhythm).toBe(3)
    expect(result.launches.snake).toBe(0)
  })

  it('creates a deterministic daily challenge', () => {
    const date = new Date('2026-08-24T00:00:00+08:00')
    expect(dailyChallenge(date)).toEqual(dailyChallenge(date))
  })

  it('records real results and completes the matching daily challenge', () => {
    const date = new Date('2026-08-24T12:00:00+08:00')
    const challenge = dailyChallenge(date)
    const initial = normalizeGameProfile({})
    const result = applyGameResult(
      initial,
      challenge.gameId,
      { score: 1234, won: true },
      date.getTime(),
    )
    expect(result.results[0].score).toBe(1234)
    expect(Object.keys(result.dailyCompletions)).toContain('2026-08-24')
    expect(result.streak.current).toBe(1)
  })

  it('exports and restores every game store through one IndexedDB-shaped archive', () => {
    const profile = normalizeGameProfile({ launches: { racing: 2 } })
    mocks.storage.set(STORAGE_KEYS.GAME_CENTER_PROFILE, profile)
    mocks.storage.set(STORAGE_KEYS.RACING_SAVE, { version: 1, championshipWins: 2 })
    mocks.storage.set(STORAGE_KEYS.RACING_SETTINGS, { quality: 'high' })
    mocks.storage.set(STORAGE_KEYS.RACING_CONFIG, { mode: 'time-trial' })
    mocks.storage.set(STORAGE_KEYS.RHYTHM_SETTINGS, { noteSpeed: 1.2 })
    mocks.storage.set(STORAGE_KEYS.SURVIVOR_BEST_SCORE, 50_000)
    mocks.storage.set(STORAGE_KEYS.SURVIVOR_SOUND, false)

    const archive = exportGameArchive()
    expect(archive.version).toBe(2)
    expect(archive.gameData.racingSettings).toEqual({ quality: 'high' })
    expect(archive.gameData.survivorBestScore).toBe(50_000)

    mocks.storage.clear()
    importGameArchive(archive)

    expect(mocks.storage.get(STORAGE_KEYS.GAME_CENTER_PROFILE)).toEqual(profile)
    expect(mocks.storage.get(STORAGE_KEYS.RACING_SAVE)).toEqual({
      version: 1,
      championshipWins: 2,
    })
    expect(mocks.storage.get(STORAGE_KEYS.RHYTHM_SETTINGS)).toEqual({ noteSpeed: 1.2 })
    expect(mocks.storage.get(STORAGE_KEYS.SURVIVOR_SOUND)).toBe(false)
  })

  it('rejects the removed mixed-storage archive format', () => {
    expect(() => importGameArchive({ version: 1, profile: {} })).toThrow('格式不正确')
    expect(mocks.storage.size).toBe(0)
  })
})
