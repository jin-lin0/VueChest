import { describe, it, expect } from 'vitest'
import {
  createRng,
  buildGrid,
  thresholdForDensity,
  silenceFloorOf,
  selectByQuota,
  fillLongSilences,
  generateBeatmap,
  beatmapDensity,
  difficultyLabel,
  isHold,
  noteEndTime,
  detectHolds,
  sampleGridRms,
  percentileOf,
  type GridPoint,
} from '../beatmap'

/**
 * 构造一条 odf 曲线：在指定时间点放置指定强度的峰，其余为低底噪。
 * frameDuration 固定 512/48000 ≈ 10.67ms。
 */
const FRAME_DUR = 512 / 48000

function makeOdf(peaks: { time: number; strength: number }[], duration: number) {
  const n = Math.ceil(duration / FRAME_DUR)
  const odf = new Float32Array(n)
  odf.fill(0.1) // 底噪
  for (const p of peaks) {
    const i = Math.round(p.time / FRAME_DUR)
    if (i >= 0 && i < n) odf[i] = p.strength
  }
  return odf
}

/** 把强度数组变成等间隔（0.25s）的网格点 */
const mk = (strengths: number[]): GridPoint[] =>
  strengths.map((s, i) => ({ time: i * 0.25, strength: s }))

describe('createRng', () => {
  it('同种子产生相同序列（谱面可复现）', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect(Array.from({ length: 20 }, () => a())).toEqual(Array.from({ length: 20 }, () => b()))
  })

  it('不同种子产生不同序列', () => {
    expect(createRng(1)()).not.toBe(createRng(2)())
  })

  it('输出落在 [0,1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('buildGrid', () => {
  it('网格点按 BPM 与精度等距分布', () => {
    // 120 BPM，division 2 → 每 0.25s 一点
    const odf = makeOdf([], 2)
    const grid = buildGrid(odf, FRAME_DUR, 120, 0, 2, 2)
    expect(grid.length).toBe(8)
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i].time - grid[i - 1].time).toBeCloseTo(0.25, 5)
    }
  })

  it('采样到附近的峰值强度', () => {
    // 峰放在 0.5s，网格点也在 0.5s
    const odf = makeOdf([{ time: 0.5, strength: 9 }], 2)
    const grid = buildGrid(odf, FRAME_DUR, 120, 0, 2, 2)
    const at = grid.find((g) => Math.abs(g.time - 0.5) < 1e-6)
    expect(at!.strength).toBeCloseTo(9, 1)
  })

  it('窗口内的偏移峰也能被捕捉（真实演奏有摇摆）', () => {
    // 峰偏离网格 30ms，仍在默认 ±50ms 窗口内
    const odf = makeOdf([{ time: 0.53, strength: 8 }], 2)
    const grid = buildGrid(odf, FRAME_DUR, 120, 0, 2, 2)
    const at = grid.find((g) => Math.abs(g.time - 0.5) < 1e-6)
    expect(at!.strength).toBeCloseTo(8, 1)
  })

  it('窗口外的峰不被误采', () => {
    // 峰偏离 120ms，超出 ±50ms
    const odf = makeOdf([{ time: 0.62, strength: 9 }], 2)
    const grid = buildGrid(odf, FRAME_DUR, 120, 0, 2, 2)
    const at = grid.find((g) => Math.abs(g.time - 0.5) < 1e-6)
    expect(at!.strength).toBeLessThan(1)
  })

  it('考虑 offset 平移', () => {
    const odf = makeOdf([], 2)
    const grid = buildGrid(odf, FRAME_DUR, 120, 0.1, 2, 2)
    expect(grid[0].time).toBeCloseTo(0.1, 5)
  })

  it('offset 为负时跳过负时间点', () => {
    const odf = makeOdf([], 2)
    const grid = buildGrid(odf, FRAME_DUR, 120, -0.3, 2, 2)
    for (const g of grid) expect(g.time).toBeGreaterThanOrEqual(0)
  })

  it('非法 bpm / duration 返回空', () => {
    const odf = makeOdf([], 2)
    expect(buildGrid(odf, FRAME_DUR, 0, 0, 2, 2)).toEqual([])
    expect(buildGrid(odf, FRAME_DUR, 120, 0, 0, 2)).toEqual([])
  })
})

describe('thresholdForDensity', () => {
  it('阈值使保留数量逼近目标密度', () => {
    // 100 个点，10 秒 → 目标 2/s 即保留 20 个
    const points = mk(Array.from({ length: 100 }, (_, i) => i + 1))
    const th = thresholdForDensity(points, 10, 2)
    const kept = points.filter((p) => p.strength >= th)
    expect(kept.length).toBeCloseTo(20, -1)
  })

  it('目标密度过高时返回 0（全部保留）', () => {
    const points = mk([1, 2, 3, 4, 5])
    expect(thresholdForDensity(points, 1, 100)).toBe(0)
  })

  it('空输入返回 0', () => {
    expect(thresholdForDensity([], 10, 2)).toBe(0)
  })

  it('密度越低阈值越高', () => {
    const points = mk(Array.from({ length: 100 }, (_, i) => i + 1))
    const low = thresholdForDensity(points, 10, 1)
    const high = thresholdForDensity(points, 10, 5)
    expect(low).toBeGreaterThan(high)
  })
})

describe('generateBeatmap', () => {
  const base = { songId: 's', title: 't', bpm: 120, offset: 0, duration: 20, frameDuration: FRAME_DUR }

  /** 每 0.25s 一个峰，强度交替，用于验证强度驱动的选择 */
  function alternatingOdf() {
    const peaks: { time: number; strength: number }[] = []
    for (let i = 0; i < 80; i++) {
      peaks.push({ time: i * 0.25, strength: i % 4 === 0 ? 20 : i % 2 === 0 ? 8 : 3 })
    }
    return makeOdf(peaks, 20)
  }

  it('所有音符严格落在 BPM 网格上（新算法的核心保证）', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() })
    const step = 60 / base.bpm / map.meta.quantizeDivision
    for (const n of map.notes) {
      const rel = (n.time - base.offset) / step
      expect(Math.abs(rel - Math.round(rel))).toBeLessThan(1e-6)
    }
  })

  it('密度逼近目标值', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() }, { targetDensity: 2 })
    // 允许 ±50% 误差：网格点数与强度分布会限制可达密度
    expect(beatmapDensity(map)).toBeGreaterThan(1)
    expect(beatmapDensity(map)).toBeLessThan(3.5)
  })

  it('产生双押：同一时刻有两个不同轨道的音符', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() }, { chordRatio: 0.25 })
    expect(map.meta.chordPoints).toBeGreaterThan(0)

    const byTime = new Map<number, number[]>()
    for (const n of map.notes) {
      const arr = byTime.get(n.time) ?? []
      arr.push(n.lane)
      byTime.set(n.time, arr)
    }
    const chords = [...byTime.values()].filter((l) => l.length === 2)
    expect(chords.length).toBe(map.meta.chordPoints)
    // 双押的两键必须不同轨
    for (const lanes of chords) expect(new Set(lanes).size).toBe(2)
  })

  it('双押跨左右手（0/1 与 2/3 各一个）', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() }, { chordRatio: 0.3, lanes: 4 })
    const byTime = new Map<number, number[]>()
    for (const n of map.notes) {
      const arr = byTime.get(n.time) ?? []
      arr.push(n.lane)
      byTime.set(n.time, arr)
    }
    for (const lanes of byTime.values()) {
      if (lanes.length !== 2) continue
      const left = lanes.filter((l) => l < 2).length
      const right = lanes.filter((l) => l >= 2).length
      expect(left).toBe(1)
      expect(right).toBe(1)
    }
  })

  it('chordRatio=0 时不产生任何双押', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() }, { chordRatio: 0 })
    expect(map.meta.chordPoints).toBe(0)
    const byTime = new Map<number, number>()
    for (const n of map.notes) byTime.set(n.time, (byTime.get(n.time) ?? 0) + 1)
    for (const count of byTime.values()) expect(count).toBe(1)
  })

  it('强度高的位置优先出音符', () => {
    // 只有 1s 处有强峰，其余为底噪
    const odf = makeOdf([{ time: 1.0, strength: 50 }], 20)
    const map = generateBeatmap({ ...base, odf }, { targetDensity: 0.05, chordRatio: 0 })
    expect(map.notes.length).toBeGreaterThan(0)
    expect(map.notes[0].time).toBeCloseTo(1.0, 2)
  })

  it('轨道号在合法范围内', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() }, { lanes: 4 })
    for (const n of map.notes) {
      expect(n.lane).toBeGreaterThanOrEqual(0)
      expect(n.lane).toBeLessThan(4)
    }
  })

  it('音符按时间升序', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() })
    for (let i = 1; i < map.notes.length; i++) {
      expect(map.notes[i].time).toBeGreaterThanOrEqual(map.notes[i - 1].time)
    }
  })

  it('相同种子生成完全相同的谱面', () => {
    const odf = alternatingOdf()
    const a = generateBeatmap({ ...base, odf }, { seed: 99 })
    const b = generateBeatmap({ ...base, odf }, { seed: 99 })
    expect(a.notes).toEqual(b.notes)
  })

  it('避免短间隔内连续同轨（手感要求）', () => {
    // 1/16 网格 + 高密度，制造大量紧邻音符
    const peaks = Array.from({ length: 300 }, (_, i) => ({ time: i * 0.0625, strength: 10 + (i % 5) }))
    const map = generateBeatmap(
      { ...base, odf: makeOdf(peaks, 20) },
      { quantizeDivision: 4, targetDensity: 6, chordRatio: 0 },
    )

    let violations = 0
    for (let i = 1; i < map.notes.length; i++) {
      const dt = map.notes[i].time - map.notes[i - 1].time
      if (dt > 0 && dt < 0.15 && map.notes[i].lane === map.notes[i - 1].lane) violations++
    }
    expect(violations).toBe(0)
  })

  it('bpm 为 0 时产出空谱面而不崩', () => {
    const map = generateBeatmap({ ...base, bpm: 0, odf: alternatingOdf() })
    expect(map.notes).toEqual([])
  })

  it('全静音 odf 不产生音符', () => {
    const odf = new Float32Array(Math.ceil(20 / FRAME_DUR)) // 全 0
    const map = generateBeatmap({ ...base, odf })
    expect(map.notes.length).toBe(0)
  })

  it('meta 统计自洽', () => {
    const map = generateBeatmap({ ...base, odf: alternatingOdf() }, { chordRatio: 0.2 })
    // 音符数 = 单键点 + 双押点 × 2
    const single = map.meta.activePoints - map.meta.chordPoints
    expect(map.notes.length).toBe(single + map.meta.chordPoints * 2)
    expect(map.meta.activePoints).toBeLessThanOrEqual(map.meta.gridPoints)
  })
})

describe('silenceFloorOf', () => {
  it('空输入返回 0', () => {
    expect(silenceFloorOf([])).toBe(0)
  })

  it('底线基于 p99 而非 max（不被单个爆音拉高）', () => {
    // 100 个点强度都是 10，再加一个 10000 的爆音
    const points = mk([...Array.from({ length: 100 }, () => 10), 10000])
    // p99 应落在 10 附近而非 10000
    expect(silenceFloorOf(points, 0.5)).toBeLessThan(100)
  })

  it('ratio 越大底线越高', () => {
    const points = mk(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(silenceFloorOf(points, 0.5)).toBeGreaterThan(silenceFloorOf(points, 0.1))
  })
})

describe('selectByQuota', () => {
  /** 生成等间隔网格点，强度由回调给出 */
  function grid(n: number, step: number, strengthOf: (i: number) => number): GridPoint[] {
    return Array.from({ length: n }, (_, i) => ({ time: i * step, strength: strengthOf(i) }))
  }

  it('每个窗口独立满足配额：安静段也能拿到音符', () => {
    // 前 10 秒强度 100，后 10 秒强度 1（安静段）
    const points = grid(80, 0.25, (i) => (i < 40 ? 100 : 1))
    const picked = selectByQuota(points, 10, 2, 2, 1, 0)

    const early = picked.filter((p) => p.time < 10).length
    const late = picked.filter((p) => p.time >= 10).length
    // 关键：安静段不该被清空。全局阈值下 late 会是 0
    expect(late).toBeGreaterThan(0)
    // 两段配额相同（各 10s × 2/s = 20）
    expect(Math.abs(early - late)).toBeLessThanOrEqual(2)
  })

  it('windowSeconds=0 退化为全局单窗口', () => {
    const points = grid(80, 0.25, (i) => (i < 40 ? 100 : 1))
    const picked = selectByQuota(points, 0, 2, 2, 1, 0)
    // 全局模式下强段吃掉所有配额
    expect(picked.every((p) => p.time < 10)).toBe(true)
  })

  it('beatBias 让弱整拍赢过弱半拍', () => {
    // division=2：偶数下标是整拍。让整拍强度 5、半拍强度 8
    const points = grid(40, 0.25, (i) => (i % 2 === 0 ? 5 : 8))

    const noBias = selectByQuota(points, 0, 1, 2, 1, 0)
    const withBias = selectByQuota(points, 0, 1, 2, 2, 0)

    const onBeatCount = (ps: GridPoint[]) =>
      ps.filter((p) => Math.round(p.time / 0.25) % 2 === 0).length

    // 无偏置：半拍更强，全被半拍占据
    expect(onBeatCount(noBias)).toBe(0)
    // 有偏置：整拍 5×2=10 > 半拍 8，全部翻转到整拍
    expect(onBeatCount(withBias)).toBe(withBias.length)
  })

  it('低于 floor 的点不入选（真正的休止不填）', () => {
    const points = grid(40, 0.25, (i) => (i < 20 ? 100 : 0.5))
    const picked = selectByQuota(points, 0, 10, 2, 1, 1)
    expect(picked.every((p) => p.strength > 1)).toBe(true)
  })

  it('配额超过可选点数时不越界', () => {
    const points = grid(4, 0.25, () => 10)
    const picked = selectByQuota(points, 0, 100, 2, 1, 0)
    expect(picked.length).toBe(4)
  })

  it('输出按时间升序', () => {
    const points = grid(60, 0.25, (i) => (i * 37) % 23)
    const picked = selectByQuota(points, 5, 2, 2, 1.5, 0)
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i].time).toBeGreaterThan(picked[i - 1].time)
    }
  })

  it('空输入 / 密度 0 返回空', () => {
    expect(selectByQuota([], 10, 2, 2, 1, 0)).toEqual([])
    expect(selectByQuota(mk([1, 2, 3]), 10, 0, 2, 1, 0)).toEqual([])
  })
})

describe('fillLongSilences', () => {
  function grid(n: number, step: number, strengthOf: (i: number) => number): GridPoint[] {
    return Array.from({ length: n }, (_, i) => ({ time: i * step, strength: strengthOf(i) }))
  }

  it('把超长空档切成不超过 maxSilence 的段', () => {
    const g = grid(100, 0.25, () => 10) // 0~24.75s
    // 只保留首尾两个音符，中间是 24 秒的巨大空档
    const selected = [g[0], g[99]]
    const filled = fillLongSilences(g, selected, 2, 0)

    let maxGap = 0
    for (let i = 1; i < filled.length; i++) {
      maxGap = Math.max(maxGap, filled[i].time - filled[i - 1].time)
    }
    expect(maxGap).toBeLessThanOrEqual(2 + 1e-9)
  })

  it('插入的是区间内最强点', () => {
    // 0~4s 网格，只有 2.0s 处特别强
    const g = grid(17, 0.25, (i) => (i === 8 ? 100 : 1))
    const filled = fillLongSilences(g, [g[0], g[16]], 2, 0)
    expect(filled.some((p) => Math.abs(p.time - 2.0) < 1e-9)).toBe(true)
  })

  it('全静音区间不插入（floor 生效）', () => {
    const g = grid(100, 0.25, () => 0.1)
    const filled = fillLongSilences(g, [g[0]], 2, 1)
    expect(filled.length).toBe(1)
  })

  it('也处理开头与结尾的空档', () => {
    const g = grid(100, 0.25, () => 10)
    // 唯一音符在正中间，两端各有 ~12 秒空档
    const filled = fillLongSilences(g, [g[50]], 2, 0)
    expect(filled[0].time).toBeLessThan(2)
    expect(g[99].time - filled[filled.length - 1].time).toBeLessThanOrEqual(2)
  })

  it('maxSilence<=0 时原样返回', () => {
    const g = grid(10, 0.25, () => 10)
    const selected = [g[0]]
    expect(fillLongSilences(g, selected, 0, 0)).toBe(selected)
  })

  it('不产生重复时间点', () => {
    const g = grid(100, 0.25, (i) => (i % 7) + 1)
    const filled = fillLongSilences(g, [g[0], g[99]], 1.5, 0)
    expect(new Set(filled.map((p) => p.time)).size).toBe(filled.length)
  })
})

describe('节奏体验指标（用户核心诉求：音乐和按键跟得上）', () => {
  const base = { songId: 's', title: 't', bpm: 120, offset: 0, duration: 40, frameDuration: FRAME_DUR }

  /** 模拟真实歌曲：安静主歌 + 密集副歌 + 一段间奏留白 */
  function songLikeOdf() {
    const peaks: { time: number; strength: number }[] = []
    for (let t = 0; t < 40; t += 0.25) {
      let s: number
      if (t < 12) s = 6 // 主歌：弱
      else if (t < 24) s = 40 // 副歌：强
      else if (t < 30) s = 0.05 // 间奏：几乎无声
      else s = 30 // 回到副歌
      peaks.push({ time: t, strength: s })
    }
    return makeOdf(peaks, 40)
  }

  it('段落密度均衡：主歌不再被清空', () => {
    const map = generateBeatmap({ ...base, odf: songLikeOdf() }, { targetDensity: 2, chordRatio: 0 })
    const verse = map.notes.filter((n) => n.time < 12).length
    const chorus = map.notes.filter((n) => n.time >= 12 && n.time < 24).length
    expect(verse).toBeGreaterThan(0)
    // 局部配额下两段应量级相当，而非全局阈值下的 0 : 全部
    expect(verse / chorus).toBeGreaterThan(0.5)
  })

  it('整拍填充率显著高于半拍（律动骨架成型）', () => {
    const map = generateBeatmap(
      { ...base, odf: songLikeOdf() },
      { targetDensity: 1.5, quantizeDivision: 2, chordRatio: 0 },
    )
    expect(map.meta.beatFillRate).toBeGreaterThan(0.5)
  })

  it('没有超长空档（间奏除外）', () => {
    const map = generateBeatmap({ ...base, odf: songLikeOdf() }, { targetDensity: 2, maxSilence: 2 })
    // 间奏 24~30s 是真静音，允许留白；其余段落不该有大洞
    const times = [...new Set(map.notes.map((n) => n.time))].sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1]
      const inInterlude = times[i - 1] >= 23 && times[i] <= 31
      if (!inInterlude) expect(gap).toBeLessThanOrEqual(2 + 1e-6)
    }
  })

  it('间奏静音段不被硬填音符', () => {
    const map = generateBeatmap({ ...base, odf: songLikeOdf() }, { targetDensity: 2 })
    const inInterlude = map.notes.filter((n) => n.time > 24.5 && n.time < 29.5).length
    expect(inInterlude).toBe(0)
  })

  it('meta 暴露 beatFillRate 与 maxGap 供调参', () => {
    const map = generateBeatmap({ ...base, odf: songLikeOdf() })
    expect(map.meta.beatFillRate).toBeGreaterThanOrEqual(0)
    expect(map.meta.beatFillRate).toBeLessThanOrEqual(1)
    expect(map.meta.maxGap).toBeGreaterThan(0)
  })
})

describe('beatmapDensity / difficultyLabel', () => {
  it('密度 = 音符数 / 时长', () => {
    const odf = makeOdf(
      Array.from({ length: 40 }, (_, i) => ({ time: i * 0.25, strength: 10 })),
      10,
    )
    const map = generateBeatmap(
      { songId: 's', title: 't', bpm: 120, offset: 0, duration: 10, odf, frameDuration: FRAME_DUR },
      { targetDensity: 2, chordRatio: 0 },
    )
    expect(beatmapDensity(map)).toBeCloseTo(map.notes.length / 10, 5)
  })

  it('时长为 0 时不除零', () => {
    const map = generateBeatmap({
      songId: 's',
      title: 't',
      bpm: 120,
      offset: 0,
      duration: 0,
      odf: new Float32Array(10),
      frameDuration: FRAME_DUR,
    })
    expect(beatmapDensity(map)).toBe(0)
  })

  it('难度分档', () => {
    expect(difficultyLabel(1.0)).toBe('Easy')
    expect(difficultyLabel(2.0)).toBe('Normal')
    expect(difficultyLabel(3.0)).toBe('Hard')
    expect(difficultyLabel(5.0)).toBe('Expert')
  })
})

describe('isHold / noteEndTime', () => {
  it('duration 缺省或 0 视为普通音符', () => {
    expect(isHold({ time: 1, lane: 0 })).toBe(false)
    expect(isHold({ time: 1, lane: 0, duration: 0 })).toBe(false)
    expect(isHold({ time: 1, lane: 0, duration: 0.5 })).toBe(true)
  })

  it('普通音符的结束时间等于起始时间', () => {
    expect(noteEndTime({ time: 1.5, lane: 0 })).toBe(1.5)
    expect(noteEndTime({ time: 1.5, lane: 0, duration: 0.8 })).toBeCloseTo(2.3, 5)
  })
})

describe('sampleGridRms / percentileOf', () => {
  it('在网格点上取前后半格的均值', () => {
    // rms 每帧 0.1s，值为 [0,1,2,3,4,...]
    const rms = Array.from({ length: 20 }, (_, i) => i)
    const grid: GridPoint[] = [{ time: 0.5, strength: 1 }]
    // 半格 = 0.1s，窗口 0.4~0.6s → 帧 4~6 → 均值 5
    const out = sampleGridRms(grid, rms, 0.1, 0.2)
    expect(out[0]).toBeCloseTo(5, 5)
  })

  it('窗口越界时不崩（钳到数组范围）', () => {
    const rms = [1, 2, 3]
    const grid: GridPoint[] = [{ time: 0, strength: 1 }, { time: 100, strength: 1 }]
    const out = sampleGridRms(grid, rms, 0.1, 0.2)
    expect(out).toHaveLength(2)
    expect(Number.isFinite(out[0])).toBe(true)
    expect(Number.isFinite(out[1])).toBe(true)
  })

  it('percentileOf 取分位数', () => {
    const v = Array.from({ length: 100 }, (_, i) => i)
    expect(percentileOf(v, 0.5)).toBe(50)
    expect(percentileOf(v, 0)).toBe(0)
    expect(percentileOf(v, 1)).toBe(99)
  })

  it('percentileOf 空数组返回 0', () => {
    expect(percentileOf([], 0.5)).toBe(0)
  })
})

describe('detectHolds', () => {
  /** 等间隔网格，step 0.2s */
  const mkGrid = (n: number, strengthOf: (i: number) => number): GridPoint[] =>
    Array.from({ length: n }, (_, i) => ({ time: i * 0.2, strength: strengthOf(i) }))

  it('活跃点后跟着高 RMS 的非活跃点 → 生成长按', () => {
    const grid = mkGrid(10, () => 10)
    const active = [grid[0]] // 只有第 0 点活跃
    const rms = new Array(10).fill(1) // RMS 全高
    const holds = detectHolds(grid, active, rms, 0.2, 0.5, 2, 8)
    expect(holds.get(0)).toBeCloseTo(0.2 * 8, 5) // 延伸到 maxGrids
  })

  it('撞到下一个活跃点就停（长按不能盖过新音符）', () => {
    const grid = mkGrid(10, () => 10)
    const active = [grid[0], grid[3]] // 第 3 点也活跃
    const rms = new Array(10).fill(1)
    const holds = detectHolds(grid, active, rms, 0.2, 0.5, 2, 8)
    // 只能延伸到第 1、2 格（第 3 格是活跃点）
    expect(holds.get(0)).toBeCloseTo(0.4, 5)
  })

  it('RMS 掉到门槛下就停（声音停了该松手）', () => {
    const grid = mkGrid(10, () => 10)
    const active = [grid[0]]
    const rms = [1, 1, 1, 0.1, 1, 1, 1, 1, 1, 1] // 第 3 帧静音
    const holds = detectHolds(grid, active, rms, 0.2, 0.5, 2, 8)
    expect(holds.get(0)).toBeCloseTo(0.4, 5)
  })

  it('短于 minGrids 的不生成长按（太短像误触）', () => {
    const grid = mkGrid(10, () => 10)
    const active = [grid[0], grid[2]] // 只能延伸 1 格
    const rms = new Array(10).fill(1)
    const holds = detectHolds(grid, active, rms, 0.2, 0.5, 2, 8)
    expect(holds.has(0)).toBe(false)
  })

  it('受 maxGrids 限制（一条长按不能吃掉整个乐句）', () => {
    const grid = mkGrid(50, () => 10)
    const active = [grid[0]]
    const rms = new Array(50).fill(1)
    const holds = detectHolds(grid, active, rms, 0.2, 0.5, 2, 4)
    expect(holds.get(0)).toBeCloseTo(0.8, 5) // 4 格 × 0.2s
  })

  it('minGrids<=0 或参数非法时返回空', () => {
    const grid = mkGrid(10, () => 10)
    const active = [grid[0]]
    const rms = new Array(10).fill(1)
    expect(detectHolds(grid, active, rms, 0.2, 0.5, 0, 8).size).toBe(0)
    expect(detectHolds(grid, active, rms, 0.2, 0.5, 5, 2).size).toBe(0)
    expect(detectHolds([], [], [], 0.2, 0.5, 2, 8).size).toBe(0)
  })
})

describe('generateBeatmap 长按集成', () => {
  const FD = 512 / 48000
  const base = { songId: 's', title: 't', bpm: 120, offset: 0, duration: 20, frameDuration: FD }

  /** 起音稀疏（每 1 秒一个）但 RMS 全程高 → 大量延音空间 */
  function sustainedOdf() {
    const peaks: { time: number; strength: number }[] = []
    for (let t = 1; t < 20; t += 1.0) peaks.push({ time: t, strength: 20 })
    return makeOdf(peaks, 20)
  }
  const highRms = () => new Float32Array(Math.ceil(20 / FD)).fill(1)

  it('不传 rms 时不生成任何长按（长按是可选增强）', () => {
    const map = generateBeatmap({ ...base, odf: sustainedOdf() }, { targetDensity: 1 })
    expect(map.meta.holdNotes).toBe(0)
    expect(map.notes.every((n) => !isHold(n))).toBe(true)
  })

  it('传 rms 且有延音空间时生成长按', () => {
    const map = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 1, rms: highRms(), rmsFrameDuration: FD, holdMinGrids: 2 },
    )
    expect(map.meta.holdNotes).toBeGreaterThan(0)
    expect(map.meta.holdTotalSec).toBeGreaterThan(0)
  })

  it('meta.holdNotes 与实际长按数一致', () => {
    const map = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 1, rms: highRms(), rmsFrameDuration: FD },
    )
    expect(map.notes.filter((n) => isHold(n)).length).toBe(map.meta.holdNotes)
  })

  it('长按期间同轨道不再出现音符（物理上无法完成）', () => {
    const map = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 2, rms: highRms(), rmsFrameDuration: FD },
    )
    // 按轨道分组检查区间重叠
    for (let lane = 0; lane < map.lanes; lane++) {
      const inLane = map.notes.filter((n) => n.lane === lane).sort((a, b) => a.time - b.time)
      for (let i = 1; i < inLane.length; i++) {
        const prevEnd = noteEndTime(inLane[i - 1])
        expect(inLane[i].time).toBeGreaterThanOrEqual(prevEnd - 0.002)
      }
    }
  })

  it('长按不与双押叠加（对休闲玩家太苛刻）', () => {
    const map = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 2, chordRatio: 0.5, rms: highRms(), rmsFrameDuration: FD },
    )
    // 同一时刻若有 2 个音符，两者都不该是长按
    const byTime = new Map<number, typeof map.notes>()
    for (const n of map.notes) {
      const arr = byTime.get(n.time) ?? []
      arr.push(n)
      byTime.set(n.time, arr)
    }
    for (const arr of byTime.values()) {
      if (arr.length >= 2) expect(arr.every((n) => !isHold(n))).toBe(true)
    }
  })

  it('holdRmsPercentile 越高长按越少', () => {
    const mk = (p: number) =>
      generateBeatmap(
        { ...base, odf: sustainedOdf() },
        { targetDensity: 1, rms: highRms(), rmsFrameDuration: FD, holdRmsPercentile: p },
      ).meta.holdNotes
    // RMS 恒定时门槛提高不会减少（所有值相等），换成有变化的 rms
    const varyRms = new Float32Array(Math.ceil(20 / FD))
    for (let i = 0; i < varyRms.length; i++) varyRms[i] = (i % 100) / 100
    const low = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 1, rms: varyRms, rmsFrameDuration: FD, holdRmsPercentile: 0.1 },
    ).meta.holdNotes
    const high = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 1, rms: varyRms, rmsFrameDuration: FD, holdRmsPercentile: 0.9 },
    ).meta.holdNotes
    expect(low).toBeGreaterThanOrEqual(high)
    void mk
  })

  it('长按时长是网格步长的整数倍（仍严格落在拍上）', () => {
    const map = generateBeatmap(
      { ...base, odf: sustainedOdf() },
      { targetDensity: 1, quantizeDivision: 2, rms: highRms(), rmsFrameDuration: FD },
    )
    const step = 60 / base.bpm / 2
    for (const n of map.notes) {
      if (!isHold(n)) continue
      const k = n.duration! / step
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6)
    }
  })

  it('相同种子下长按谱面完全可复现', () => {
    const opts = { targetDensity: 1, rms: highRms(), rmsFrameDuration: FD, seed: 42 }
    const a = generateBeatmap({ ...base, odf: sustainedOdf() }, opts)
    const b = generateBeatmap({ ...base, odf: sustainedOdf() }, opts)
    expect(a.notes).toEqual(b.notes)
  })
})
