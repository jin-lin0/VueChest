import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/config/storage-keys'

const KEY = STORAGE_KEYS.RHYTHM_SETTINGS
const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>() }))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorage: (key: string) => mocks.storage.delete(key),
}))

import {
  loadSettings,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  type RhythmSettings,
} from '../settings'

function installStorage(value?: unknown) {
  mocks.storage.clear()
  if (value !== undefined) mocks.storage.set(KEY, value)
}

describe('settings 持久化', () => {
  beforeEach(() => installStorage())

  it('空存档返回默认值', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('默认下落速度 0.7s、校准 -20ms', () => {
    expect(DEFAULT_SETTINGS.noteSpeed).toBeCloseTo(0.7, 5)
    expect(DEFAULT_SETTINGS.userOffset).toBe(-20)
  })

  it('存了能读回来（往返一致）', () => {
    const custom: RhythmSettings = {
      noteSpeed: 1.4,
      userOffset: 35,
      preset: 'hard',
      targetDensity: 4,
      chordRatio: 0.25,
      beatBias: 3,
      holdEnabled: false,
      holdRmsPercentile: 0.4,
      quantizeDivision: 4,
    }
    saveSettings(custom)
    expect(loadSettings()).toEqual(custom)
  })

  it('返回的是副本，改动不会污染 DEFAULT_SETTINGS', () => {
    const a = loadSettings()
    a.noteSpeed = 99
    expect(DEFAULT_SETTINGS.noteSpeed).toBeCloseTo(0.7, 5)
    expect(loadSettings().noteSpeed).toBeCloseTo(0.7, 5)
  })

  it('clearSettings 后回到默认', () => {
    saveSettings({ ...DEFAULT_SETTINGS, noteSpeed: 2 })
    clearSettings()
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  describe('存档损坏时的容错', () => {
    it('非对象数据返回默认值', () => {
      installStorage('damaged')
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
      installStorage(42)
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
      installStorage(null)
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('缺字段的存档由默认值补齐', () => {
      installStorage({ noteSpeed: 1.2 })
      const settings = loadSettings()
      expect(settings.noteSpeed).toBeCloseTo(1.2, 5)
      expect(settings.userOffset).toBe(DEFAULT_SETTINGS.userOffset)
      expect(settings.holdEnabled).toBe(DEFAULT_SETTINGS.holdEnabled)
    })

    it('类型错误的字段使用默认值', () => {
      installStorage({ noteSpeed: 'fast', holdEnabled: 'yes', preset: 7 })
      const settings = loadSettings()
      expect(settings.noteSpeed).toBe(DEFAULT_SETTINGS.noteSpeed)
      expect(settings.holdEnabled).toBe(DEFAULT_SETTINGS.holdEnabled)
      expect(settings.preset).toBe(DEFAULT_SETTINGS.preset)
    })

    it('noteSpeed 为 0 时夹到安全下限', () => {
      installStorage({ noteSpeed: 0 })
      expect(loadSettings().noteSpeed).toBe(0.4)
    })

    it('NaN / Infinity 使用默认值', () => {
      installStorage({ noteSpeed: Number.NaN, userOffset: Number.POSITIVE_INFINITY })
      const settings = loadSettings()
      expect(settings.noteSpeed).toBe(DEFAULT_SETTINGS.noteSpeed)
      expect(settings.userOffset).toBe(DEFAULT_SETTINGS.userOffset)
    })

    it('超出滑块范围的值被夹到边界', () => {
      installStorage({
        noteSpeed: 99,
        userOffset: -9999,
        targetDensity: 100,
        chordRatio: -1,
        beatBias: 0,
        holdRmsPercentile: 5,
      })
      const settings = loadSettings()
      expect(settings.noteSpeed).toBe(2.2)
      expect(settings.userOffset).toBe(-150)
      expect(settings.targetDensity).toBe(6)
      expect(settings.chordRatio).toBe(0)
      expect(settings.beatBias).toBe(1)
      expect(settings.holdRmsPercentile).toBe(0.6)
    })

    it('非法量化网格使用默认值', () => {
      installStorage({ quantizeDivision: 3 })
      expect(loadSettings().quantizeDivision).toBe(DEFAULT_SETTINGS.quantizeDivision)
    })
  })
})
