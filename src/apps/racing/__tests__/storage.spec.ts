import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { TRACKS } from '../game'

const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>() }))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
}))

import {
  DEFAULT_RACING_SAVE,
  loadRaceConfig,
  loadRacingSave,
  loadRacingSettings,
  saveRacingSettings,
  updateRecord,
} from '../storage'

function installStorage(initial: Record<string, unknown> = {}) {
  mocks.storage.clear()
  for (const [key, value] of Object.entries(initial)) mocks.storage.set(key, value)
}

describe('赛车存档', () => {
  beforeEach(() => installStorage())

  it('空或损坏存档回退默认值', () => {
    expect(loadRacingSave()).toEqual(DEFAULT_RACING_SAVE)
    installStorage({ [STORAGE_KEYS.RACING_SAVE]: 'damaged' })
    expect(loadRacingSave()).toEqual(DEFAULT_RACING_SAVE)
  })

  it('设置字段会夹到安全范围', () => {
    installStorage({
      [STORAGE_KEYS.RACING_SETTINGS]: {
        steeringSensitivity: 9,
        masterVolume: -2,
        particles: 999,
      },
    })
    const settings = loadRacingSettings()
    expect(settings.steeringSensitivity).toBe(1.5)
    expect(settings.masterVolume).toBe(0)
    expect(settings.particles).toBe(100)
  })

  it('非法比赛配置回退安全默认值，设置通过统一存储写入', () => {
    installStorage({
      [STORAGE_KEYS.RACING_CONFIG]: {
        mode: 'unknown',
        trackId: 'moon',
        laps: 99,
        aiCount: 12,
      },
    })
    expect(loadRaceConfig()).toMatchObject({
      mode: 'quick',
      trackId: 'forest',
      laps: 3,
      aiCount: 3,
    })
    const settings = loadRacingSettings()
    saveRacingSettings(settings)
    expect(mocks.storage.get(STORAGE_KEYS.RACING_SETTINGS)).toEqual(settings)
  })

  it('高难赛道配置和纪录可以持久化读取', () => {
    installStorage({
      [STORAGE_KEYS.RACING_CONFIG]: {
        mode: 'quick',
        trackId: 'ridge',
        difficulty: 'expert',
        laps: 3,
        aiCount: 3,
        localPlayers: 1,
      },
      [STORAGE_KEYS.RACING_SAVE]: {
        ...DEFAULT_RACING_SAVE,
        records: {
          'ridge:1': {
            trackId: 'ridge',
            carId: 1,
            bestLap: 52,
            bestTotal: 160,
            medal: 'silver',
          },
        },
      },
    })
    expect(loadRaceConfig().trackId).toBe('ridge')
    expect(loadRacingSave().records['ridge:1']?.medal).toBe('silver')
  })

  it('只保留更快纪录并按三条赛道奖牌解锁外观', () => {
    let save = structuredClone(DEFAULT_RACING_SAVE)
    for (const trackId of ['forest', 'desert', 'snow'] as const) {
      save = updateRecord(save, {
        trackId,
        carId: 1,
        bestLap: TRACKS[trackId].medalLapTimes.gold,
        bestTotal: 100,
        medal: 'gold',
      }).save
    }
    expect(save.unlockedLiveries).toContain('champion-metal')
    const slower = updateRecord(save, {
      trackId: 'forest',
      carId: 1,
      bestLap: 999,
      bestTotal: 999,
      medal: 'none',
    }).save
    expect(slower.records['forest:1'].bestLap).toBe(TRACKS.forest.medalLapTimes.gold)
  })
})
