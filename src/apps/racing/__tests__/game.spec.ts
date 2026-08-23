import { describe, expect, it } from 'vitest'
import { getMedal, normalizeRaceConfig, seededRandom, TRACKS, type RaceConfig } from '../game'
import { generateTrackPoints } from '../track'
import {
  addCombo,
  AI_DIFFICULTY,
  championshipPoints,
  driftBoostMultiplier,
  driftLevel,
  itemPoolForRank,
  perfectStart,
  resolveHit,
  sortChampionship,
  tickCombo,
} from '../rules'

const BASE: RaceConfig = {
  mode: 'quick',
  trackId: 'forest',
  difficulty: 'standard',
  laps: 5,
  aiCount: 2,
  localPlayers: 1,
}

describe('赛车模式规则', () => {
  it('计时赛固定为单人、三圈、无 AI，并禁止随机赛道', () => {
    expect(normalizeRaceConfig({ ...BASE, mode: 'time-trial', trackId: 'random' })).toMatchObject({
      trackId: 'forest',
      localPlayers: 1,
      laps: 3,
      aiCount: 0,
    })
  })

  it('固定种子生成可重复随机序列', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('固定赛道的中心线与检查点基数保持确定', () => {
    const first = generateTrackPoints(TRACKS.desert)
    const second = generateTrackPoints(TRACKS.desert)
    expect(first.map((point) => [point.x, point.z])).toEqual(second.map((point) => [point.x, point.z]))
    expect(TRACKS.desert.checkpoints).toBe(6)
  })

  it('圈速按照配置判定奖牌', () => {
    const track = TRACKS.forest
    expect(getMedal(track, track.medalLapTimes.gold)).toBe('gold')
    expect(getMedal(track, track.medalLapTimes.silver)).toBe('silver')
    expect(getMedal(track, track.medalLapTimes.bronze)).toBe('bronze')
    expect(getMedal(track, track.medalLapTimes.bronze + 1)).toBe('none')
  })
})

describe('驾驶反馈规则', () => {
  it('漂移蓄力映射到三级反馈和加速倍率', () => {
    expect(driftLevel(24)).toBe('none')
    expect(driftLevel(25)).toBe('good')
    expect(driftLevel(55)).toBe('great')
    expect(driftLevel(90)).toBe('perfect')
    expect(driftBoostMultiplier('perfect')).toBeCloseTo(1.16)
  })

  it('完美起步窗口与烧胎判定互斥', () => {
    expect(perfectStart(0.1)).toBe('perfect')
    expect(perfectStart(-0.4)).toBe('burnout')
    expect(perfectStart(0.4)).toBe('normal')
  })

  it('护盾抵挡一次攻击，第二次攻击才减速', () => {
    const blocked = resolveHit(30, 1, 0.3)
    expect(blocked).toEqual({ speed: 30, shieldHits: 0, blocked: true })
    expect(resolveHit(blocked.speed, blocked.shieldHits, 0.3)).toEqual({
      speed: 9,
      shieldHits: 0,
      blocked: false,
    })
  })

  it('连击三秒后逐级衰减，新动作会刷新等待时间', () => {
    expect(tickCombo({ value: 4, idle: 2.9 }, 0.05).value).toBe(4)
    expect(tickCombo({ value: 4, idle: 2.9 }, 0.2).value).toBe(3)
    expect(addCombo({ value: 9, idle: 8 }, 2)).toEqual({ value: 10, idle: 0 })
  })
})

describe('道具与锦标赛', () => {
  it('AI 三档难度逐级提高配速并降低失误率', () => {
    expect(AI_DIFFICULTY.casual.pace).toBeLessThan(AI_DIFFICULTY.standard.pace)
    expect(AI_DIFFICULTY.expert.pace).toBeGreaterThan(AI_DIFFICULTY.standard.pace)
    expect(AI_DIFFICULTY.expert.mistakeChance).toBeLessThan(AI_DIFFICULTY.casual.mistakeChance)
  })

  it('领先与落后玩家拥有不同道具池', () => {
    expect(itemPoolForRank(1, 4)).toContain('roadblock')
    expect(itemPoolForRank(4, 4)).toContain('swap')
    expect(itemPoolForRank(1, 4)).not.toContain('swap')
  })

  it('锦标赛按积分、冠军数、总时间排序', () => {
    expect(championshipPoints(1)).toBe(10)
    const sorted = sortChampionship([
      { racerId: 'a', points: 10, wins: 0, totalTime: 120 },
      { racerId: 'b', points: 10, wins: 1, totalTime: 130 },
      { racerId: 'c', points: 6, wins: 0, totalTime: 90 },
    ])
    expect(sorted.map((entry) => entry.racerId)).toEqual(['b', 'a', 'c'])
  })
})
