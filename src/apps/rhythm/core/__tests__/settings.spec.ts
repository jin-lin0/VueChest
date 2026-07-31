import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadSettings,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  type RhythmSettings,
} from '../settings'

const KEY = 'rhythm:settings'

/** 极简 localStorage 替身：只实现被用到的四个方法 */
function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', mock)
  return store
}

describe('settings 持久化', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('空存档返回默认值', () => {
    installStorage()
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('默认下落速度 0.7s、校准 -20ms', () => {
    // 这两个是用户明确指定的默认手感，属于产品决策，用测试钉住
    expect(DEFAULT_SETTINGS.noteSpeed).toBeCloseTo(0.7, 5)
    expect(DEFAULT_SETTINGS.userOffset).toBe(-20)
  })

  it('存了能读回来（往返一致）', () => {
    installStorage()
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
    installStorage()
    const a = loadSettings()
    a.noteSpeed = 99
    expect(DEFAULT_SETTINGS.noteSpeed).toBeCloseTo(0.7, 5)
    expect(loadSettings().noteSpeed).toBeCloseTo(0.7, 5)
  })

  it('clearSettings 后回到默认', () => {
    installStorage()
    saveSettings({ ...DEFAULT_SETTINGS, noteSpeed: 2.0 })
    clearSettings()
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  describe('存档损坏时的容错（localStorage 是用户可改的）', () => {
    it('非 JSON 字符串 → 默认值', () => {
      installStorage({ [KEY]: 'not json at all' })
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('JSON 但不是对象 → 默认值', () => {
      installStorage({ [KEY]: '42' })
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('null → 默认值', () => {
      installStorage({ [KEY]: 'null' })
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('缺字段的旧版存档 → 缺的走默认，有的保留', () => {
      installStorage({ [KEY]: JSON.stringify({ noteSpeed: 1.2 }) })
      const s = loadSettings()
      expect(s.noteSpeed).toBeCloseTo(1.2, 5)
      expect(s.userOffset).toBe(DEFAULT_SETTINGS.userOffset)
      expect(s.holdEnabled).toBe(DEFAULT_SETTINGS.holdEnabled)
    })

    it('类型错误的字段 → 走默认', () => {
      installStorage({
        [KEY]: JSON.stringify({ noteSpeed: 'fast', holdEnabled: 'yes', preset: 7 }),
      })
      const s = loadSettings()
      expect(s.noteSpeed).toBe(DEFAULT_SETTINGS.noteSpeed)
      expect(s.holdEnabled).toBe(DEFAULT_SETTINGS.holdEnabled)
      expect(s.preset).toBe(DEFAULT_SETTINGS.preset)
    })

    it('noteSpeed 为 0 会让渲染除零，必须被夹到下限', () => {
      installStorage({ [KEY]: JSON.stringify({ noteSpeed: 0 }) })
      expect(loadSettings().noteSpeed).toBe(0.4)
    })

    it('NaN / Infinity → 走默认', () => {
      // JSON 里存不了 NaN，但可能来自手改或别处写入
      installStorage({ [KEY]: '{"noteSpeed":null,"userOffset":1e999}' })
      const s = loadSettings()
      expect(s.noteSpeed).toBe(DEFAULT_SETTINGS.noteSpeed)
      expect(s.userOffset).toBe(DEFAULT_SETTINGS.userOffset)
    })

    it('超出滑块范围的值被夹到边界', () => {
      installStorage({
        [KEY]: JSON.stringify({
          noteSpeed: 99,
          userOffset: -9999,
          targetDensity: 100,
          chordRatio: -1,
          beatBias: 0,
          holdRmsPercentile: 5,
        }),
      })
      const s = loadSettings()
      expect(s.noteSpeed).toBe(2.2)
      expect(s.userOffset).toBe(-150)
      expect(s.targetDensity).toBe(6)
      expect(s.chordRatio).toBe(0)
      expect(s.beatBias).toBe(1)
      expect(s.holdRmsPercentile).toBe(0.6)
    })

    it('非法的量化网格（只允许 1/2/4）→ 走默认', () => {
      installStorage({ [KEY]: JSON.stringify({ quantizeDivision: 3 }) })
      expect(loadSettings().quantizeDivision).toBe(DEFAULT_SETTINGS.quantizeDivision)
    })
  })

  describe('localStorage 不可用（隐私模式）', () => {
    it('读取抛异常时返回默认值而非崩溃', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('SecurityError')
        },
      })
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('写入抛异常时静默忽略——存不下不该影响正在玩的这局', () => {
      vi.stubGlobal('localStorage', {
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {
          throw new Error('SecurityError')
        },
      })
      expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow()
      expect(() => clearSettings()).not.toThrow()
    })
  })
})
