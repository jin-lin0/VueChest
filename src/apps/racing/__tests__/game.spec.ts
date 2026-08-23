import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { getMedal, normalizeRaceConfig, seededRandom, TRACKS, type RaceConfig } from '../game'
import {
  checkpointPointIndices,
  generateTrackPoints,
  isOutsideTrack,
  trackOffsetAt,
} from '../track'
import {
  addCombo,
  AI_DIFFICULTY,
  championshipPoints,
  driftBoostMultiplier,
  driftLevel,
  driftScore,
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
    expect(first.map((point) => [point.x, point.z])).toEqual(
      second.map((point) => [point.x, point.z]),
    )
    expect(TRACKS.desert.checkpoints).toBe(6)
    const checkpointIndices = checkpointPointIndices(first.length, TRACKS.desert.checkpoints)
    expect(checkpointIndices[0]).toBeGreaterThan(0)
    expect(checkpointIndices.at(-1)).toBe(0)
  })

  it('全部固定赛道的两侧边界均不自交', () => {
    const intersects = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      c: { x: number; z: number },
      d: { x: number; z: number },
    ) => {
      const cross = (p: typeof a, q: typeof a, r: typeof a) =>
        (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
      return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
    }

    for (const track of Object.values(TRACKS)) {
      const points = generateTrackPoints(track)
      for (const side of [-1, 1]) {
        const edge = points.map((_, index) =>
          trackOffsetAt(points, index, (track.width / 2) * side),
        )
        for (let i = 0; i < edge.length; i++) {
          for (let j = i + 2; j < edge.length; j++) {
            if (i === 0 && j === edge.length - 1) continue
            expect(
              intersects(
                edge[i],
                edge[(i + 1) % edge.length],
                edge[j],
                edge[(j + 1) % edge.length],
              ),
              `${track.id} 边界 ${i} 与 ${j} 不应相交`,
            ).toBe(false)
          }
        }
      }
      expect(isOutsideTrack(points, points[0].x, points[0].z, track.width)).toBe(false)
    }
  })

  it('极夜回环比赤沙峡谷更窄且单位距离弯角更密集', () => {
    const turnMetrics = (track: (typeof TRACKS)[keyof typeof TRACKS]) => {
      const points = generateTrackPoints(track)
      let length = 0
      let turns = 0
      let maxTurn = 0
      for (let i = 0; i < points.length; i++) {
        const previous = points[(i - 1 + points.length) % points.length]
        const current = points[i]
        const next = points[(i + 1) % points.length]
        const incoming = current.clone().sub(previous).normalize()
        const outgoing = next.clone().sub(current).normalize()
        length += current.distanceTo(next)
        const turn = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing))))
        turns += turn
        maxTurn = Math.max(maxTurn, turn)
      }
      return { density: turns / length, maxTurn: THREE.MathUtils.radToDeg(maxTurn) }
    }
    const ridge = turnMetrics(TRACKS.ridge)
    const desert = turnMetrics(TRACKS.desert)
    expect(TRACKS.ridge.width).toBeLessThan(TRACKS.desert.width)
    expect(ridge.density).toBeGreaterThan(desert.density * 1.4)
    expect(ridge.maxTurn).toBeGreaterThanOrEqual(40)
    expect(ridge.maxTurn).toBeLessThanOrEqual(45)
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
    expect(driftLevel(11)).toBe('none')
    expect(driftLevel(12)).toBe('good')
    expect(driftLevel(30)).toBe('great')
    expect(driftLevel(50)).toBe('perfect')
    expect(driftBoostMultiplier('perfect')).toBeCloseTo(1.16)
    expect(driftScore('good')).toBe(120)
    expect(driftScore('perfect')).toBe(500)
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
    expect(itemPoolForRank(4, 4).filter((item) => item === 'nitro')).toHaveLength(2)
    expect(Object.values([itemPoolForRank(1, 4), itemPoolForRank(4, 4)]).flat()).not.toContain(
      'swap',
    )
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
