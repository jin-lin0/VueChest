import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRACKS } from '../game'
import {
  DEFAULT_RACING_SAVE,
  loadRaceConfig,
  loadRacingSave,
  loadRacingSettings,
  saveRacingSettings,
  updateRecord,
} from '../storage'

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
}

describe('赛车存档', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
  })

  it('空或损坏存档回退默认值', () => {
    expect(loadRacingSave()).toEqual(DEFAULT_RACING_SAVE)
    installStorage({ 'racing:save:v1': '{bad json' })
    expect(loadRacingSave()).toEqual(DEFAULT_RACING_SAVE)
  })

  it('设置字段会夹到安全范围', () => {
    installStorage({
      'racing:settings:v1': JSON.stringify({ steeringSensitivity: 9, masterVolume: -2, particles: 999 }),
    })
    const settings = loadRacingSettings()
    expect(settings.steeringSensitivity).toBe(1.5)
    expect(settings.masterVolume).toBe(0)
    expect(settings.particles).toBe(100)
  })

  it('非法比赛配置回退安全默认值，写入失败不阻断游戏', () => {
    installStorage({
      'racing:config:v1': JSON.stringify({ mode: 'unknown', trackId: 'moon', laps: 99, aiCount: 12 }),
    })
    expect(loadRaceConfig()).toMatchObject({ mode: 'quick', trackId: 'forest', laps: 3, aiCount: 3 })
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
    })
    expect(() => saveRacingSettings(loadRacingSettings())).not.toThrow()
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
