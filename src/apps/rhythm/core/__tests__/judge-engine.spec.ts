import { describe, it, expect } from 'vitest'
import { JudgeEngine, rankOf, averageError, comboMultiplier, MAX_SCORE } from '../judge-engine'
import { JUDGE_WINDOWS } from '../clock'
import type { Beatmap, Note } from '../beatmap'

function makeMap(notes: Note[], lanes = 4): Beatmap {
  return {
    songId: 's',
    title: 't',
    lanes,
    bpm: 120,
    offset: 0,
    duration: 60,
    notes,
    meta: {
      quantizeDivision: 2,
      gridPoints: 0,
      activePoints: 0,
      chordPoints: 0,
      holdNotes: 0,
      holdTotalSec: 0,
      threshold: 0,
      beatFillRate: 0,
      maxGap: 0,
    },
  }
}

describe('JudgeEngine.hit', () => {
  it('精准命中给 perfect', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    const r = engine.hit(0, 1.0)
    expect(r?.judgement).toBe('perfect')
    expect(r?.errorMs).toBeCloseTo(0, 5)
  })

  it('按判定窗口分级', () => {
    const cases: [number, string][] = [
      [0.03, 'perfect'],
      [0.06, 'great'],
      [0.11, 'good'],
    ]
    for (const [delta, expected] of cases) {
      const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
      expect(engine.hit(0, 1.0 + delta)?.judgement).toBe(expected)
    }
  })

  it('窗口外按键返回 null 且不消耗音符', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    expect(engine.hit(0, 0.5)).toBeNull()
    expect(engine.getStats().resolved).toBe(0)
    // 音符仍在，之后能正常命中
    expect(engine.hit(0, 1.0)?.judgement).toBe('perfect')
  })

  it('错误轨道不命中', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    expect(engine.hit(1, 1.0)).toBeNull()
    expect(engine.getStats().resolved).toBe(0)
  })

  it('一个音符只能被判定一次', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    expect(engine.hit(0, 1.0)).not.toBeNull()
    expect(engine.hit(0, 1.01)).toBeNull()
    expect(engine.getStats().resolved).toBe(1)
  })

  it('多音符时命中最接近的那个', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 1.1, lane: 0 },
      ]),
    )
    // 1.09 更接近 1.1
    const r = engine.hit(0, 1.09)
    expect(r?.noteIndex).toBe(1)
  })

  it('偏早按键 errorMs 为负', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    const r = engine.hit(0, 0.97)
    expect(r!.errorMs).toBeLessThan(0)
  })
})

describe('JudgeEngine.update (miss 判定)', () => {
  it('超过窗口未击打记为 miss', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    const missed = engine.update(1.0 + JUDGE_WINDOWS.good / 1000 + 0.01)
    expect(missed).toBe(1)
    expect(engine.getStats().miss).toBe(1)
  })

  it('窗口内不提前判 miss', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    expect(engine.update(1.0 + JUDGE_WINDOWS.good / 1000 - 0.01)).toBe(0)
    expect(engine.getStats().miss).toBe(0)
  })

  it('已命中的音符不会再被判 miss', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    engine.hit(0, 1.0)
    expect(engine.update(5.0)).toBe(0)
    expect(engine.getStats().miss).toBe(0)
  })

  it('跨轨道同时结算多个 miss', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 1.0, lane: 1 },
        { time: 1.0, lane: 2 },
      ]),
    )
    expect(engine.update(2.0)).toBe(3)
    expect(engine.getStats().miss).toBe(3)
  })

  it('重复调用不重复计数（幂等）', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    engine.update(2.0)
    engine.update(3.0)
    engine.update(4.0)
    expect(engine.getStats().miss).toBe(1)
  })
})

describe('连击与分数', () => {
  it('连续命中累积 combo，miss 清零', () => {
    const notes = [0, 1, 2, 3, 4].map((i) => ({ time: 1 + i, lane: 0 }))
    const engine = new JudgeEngine(makeMap(notes))

    engine.hit(0, 1)
    engine.hit(0, 2)
    engine.hit(0, 3)
    expect(engine.getStats().combo).toBe(3)
    expect(engine.getStats().maxCombo).toBe(3)

    // 漏掉第 4 个
    engine.update(4 + 0.2)
    expect(engine.getStats().combo).toBe(0)
    expect(engine.getStats().maxCombo).toBe(3)

    engine.hit(0, 5)
    expect(engine.getStats().combo).toBe(1)
    expect(engine.getStats().maxCombo).toBe(3)
  })

  it('全 perfect 得满分', () => {
    const notes = [0, 1, 2, 3].map((i) => ({ time: 1 + i, lane: 0 }))
    const engine = new JudgeEngine(makeMap(notes))
    for (let i = 0; i < 4; i++) engine.hit(0, 1 + i)
    expect(engine.getStats().score).toBe(MAX_SCORE)
    expect(engine.accuracy).toBeCloseTo(100, 5)
  })

  it('全 miss 得 0 分', () => {
    const notes = [0, 1, 2].map((i) => ({ time: 1 + i, lane: 0 }))
    const engine = new JudgeEngine(makeMap(notes))
    engine.update(10)
    expect(engine.getStats().score).toBe(0)
    expect(engine.accuracy).toBe(0)
  })

  it('分数随判定质量下降', () => {
    const mk = () => new JudgeEngine(makeMap([{ time: 1, lane: 0 }]))
    const p = mk()
    p.hit(0, 1.0)
    const g = mk()
    g.hit(0, 1.06) // great
    const gd = mk()
    gd.hit(0, 1.11) // good

    expect(p.getStats().score).toBeGreaterThan(g.getStats().score)
    expect(g.getStats().score).toBeGreaterThan(gd.getStats().score)
  })

  it('空谱面不崩且达成率为 100', () => {
    const engine = new JudgeEngine(makeMap([]))
    expect(engine.accuracy).toBe(100)
    expect(engine.finished).toBe(true)
    expect(engine.update(10)).toBe(0)
  })

  it('finished 在全部判定后为 true', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1, lane: 0 },
        { time: 2, lane: 1 },
      ]),
    )
    expect(engine.finished).toBe(false)
    engine.hit(0, 1)
    expect(engine.finished).toBe(false)
    engine.hit(1, 2)
    expect(engine.finished).toBe(true)
  })
})

describe('rankOf', () => {
  it('全连且高达成率给 SSS', () => {
    expect(rankOf(99.5, 0, 100)).toBe('SSS')
  })

  it('有 miss 时即使达成率高也不给 SSS', () => {
    expect(rankOf(99.5, 1, 100)).not.toBe('SSS')
  })

  it('按达成率分档', () => {
    expect(rankOf(96, 2, 100)).toBe('SS')
    expect(rankOf(92, 2, 100)).toBe('S')
    expect(rankOf(85, 2, 100)).toBe('A')
    expect(rankOf(75, 2, 100)).toBe('B')
    expect(rankOf(65, 2, 100)).toBe('C')
    expect(rankOf(30, 2, 100)).toBe('D')
  })
})

describe('averageError', () => {
  it('求平均', () => {
    expect(averageError([10, 20, 30])).toBeCloseTo(20, 5)
  })

  it('正负抵消体现整体倾向', () => {
    expect(averageError([-20, 20])).toBeCloseTo(0, 5)
    expect(averageError([30, 40, 50])).toBeGreaterThan(0)
  })

  it('空数组返回 0', () => {
    expect(averageError([])).toBe(0)
  })
})

describe('comboMultiplier（展示用连击倍率）', () => {
  it('0 连是 x1，不是 x0', () => {
    expect(comboMultiplier(0)).toBe(1)
  })

  it('每 50 连升一档', () => {
    expect(comboMultiplier(49)).toBe(1)
    expect(comboMultiplier(50)).toBe(2)
    expect(comboMultiplier(99)).toBe(2)
    expect(comboMultiplier(100)).toBe(3)
    expect(comboMultiplier(150)).toBe(4)
  })

  it('封顶 x4，不会无限涨', () => {
    expect(comboMultiplier(200)).toBe(4)
    expect(comboMultiplier(9999)).toBe(4)
  })

  it('单调不减', () => {
    let prev = 0
    for (let c = 0; c <= 300; c += 7) {
      const m = comboMultiplier(c)
      expect(m).toBeGreaterThanOrEqual(prev)
      prev = m
    }
  })
})

describe('JudgeEngine.skipTo（时间跳变恢复）', () => {
  it('跳过的音符标记为 resolved 但不计入任何判定档位', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 1 },
        { time: 5.0, lane: 2 },
      ]),
    )
    const skipped = engine.skipTo(3.0)
    expect(skipped).toBe(2)
    expect(engine.getStats().skipped).toBe(2)
    // 关键：不能变成 miss
    expect(engine.getStats().miss).toBe(0)
    expect(engine.getStats().perfect).toBe(0)
    expect(engine.getStats().resolved).toBe(2)
  })

  it('不打断 combo（玩家没机会打，不是失误）', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 1 },
        { time: 5.0, lane: 2 },
      ]),
    )
    engine.hit(0, 1.0)
    expect(engine.getStats().combo).toBe(1)
    engine.skipTo(3.0)
    expect(engine.getStats().combo).toBe(1)
  })

  it('不影响达成率', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 1 },
        { time: 5.0, lane: 2 },
      ]),
    )
    engine.hit(0, 1.0) // perfect
    expect(engine.accuracy).toBeCloseTo(100, 5)
    engine.skipTo(3.0)
    expect(engine.accuracy).toBeCloseTo(100, 5)
  })

  it('窗口内的音符不被跳过（还有机会打）', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    // good 窗口 130ms，1.05s 时音符还在窗口内
    expect(engine.skipTo(1.05)).toBe(0)
    expect(engine.getStats().resolved).toBe(0)
  })

  it('已判定的音符不会被重复计入 skipped', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 0 },
      ]),
    )
    engine.hit(0, 1.0)
    engine.skipTo(5.0)
    expect(engine.getStats().skipped).toBe(1)
    expect(engine.getStats().resolved).toBe(2)
  })

  it('skipTo 之后 update 不会重复结算', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 1 },
      ]),
    )
    engine.skipTo(5.0)
    expect(engine.update(5.0)).toBe(0)
    expect(engine.getStats().miss).toBe(0)
    expect(engine.getStats().resolved).toBe(2)
  })

  it('skipTo 之后仍能正常判定后续音符', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 5.0, lane: 0 },
      ]),
    )
    engine.skipTo(3.0)
    const r = engine.hit(0, 5.0)
    expect(r?.judgement).toBe('perfect')
  })

  it('finished 仍然自洽（skipped 计入 resolved）', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 1 },
      ]),
    )
    expect(engine.finished).toBe(false)
    engine.skipTo(5.0)
    expect(engine.finished).toBe(true)
  })
})

describe('长按判定：基础流程', () => {
  /** 造一个 lane 0 上 time=1.0、时长 1.0 秒的长按 */
  const holdMap = () => makeMap([{ time: 1.0, lane: 0, duration: 1.0 }])

  it('头部命中后进入 holding，尚未 resolved', () => {
    const engine = new JudgeEngine(holdMap())
    const r = engine.hit(0, 1.0)
    expect(r?.judgement).toBe('perfect')
    expect(engine.notes[0].holdState).toBe('holding')
    // 关键：头部命中不等于完成，此时不该计入 resolved
    expect(engine.getStats().resolved).toBe(0)
  })

  it('头部命中立即给 combo（否则玩家以为没打中）', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    expect(engine.getStats().combo).toBe(1)
  })

  it('撑到尾部松手 → perfect 且只算一次', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    const r = engine.release(0, 2.0)
    expect(r?.judgement).toBe('perfect')
    expect(engine.getStats().perfect).toBe(1)
    expect(engine.getStats().resolved).toBe(1)
    expect(engine.getStats().combo).toBe(1)
  })

  it('一直按着不松手，update 到尾部自动结算', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    engine.update(2.1)
    expect(engine.notes[0].holdState).toBe('done')
    expect(engine.getStats().perfect).toBe(1)
    expect(engine.getStats().resolved).toBe(1)
  })

  it('头部完全没按 → miss', () => {
    const engine = new JudgeEngine(holdMap())
    engine.update(1.0 + JUDGE_WINDOWS.good / 1000 + 0.01)
    expect(engine.getStats().miss).toBe(1)
    expect(engine.getStats().resolved).toBe(1)
  })

  it('头部判定档位影响最终评级（头部 good 则最终不超过 good）', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.11) // good 档
    engine.release(0, 2.0)
    expect(engine.getStats().good).toBe(1)
    expect(engine.getStats().perfect).toBe(0)
  })

  it('release 对普通音符无副作用', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0 }]))
    engine.hit(0, 1.0)
    expect(engine.release(0, 1.2)).toBeNull()
    expect(engine.getStats().perfect).toBe(1)
    expect(engine.getStats().resolved).toBe(1)
  })

  it('没有进行中的长按时 release 返回 null', () => {
    const engine = new JudgeEngine(holdMap())
    expect(engine.release(0, 1.5)).toBeNull()
  })
})

describe('长按判定：中途松手', () => {
  const holdMap = () => makeMap([{ time: 1.0, lane: 0, duration: 1.0 }])

  it('中途松手立即断 combo 并记 holdBreaks', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    expect(engine.getStats().combo).toBe(1)
    engine.release(0, 1.3)
    expect(engine.getStats().combo).toBe(0)
    expect(engine.getStats().holdBreaks).toBe(1)
    expect(engine.notes[0].holdState).toBe('broken')
    // 还没结算：可以补按回来
    expect(engine.getStats().resolved).toBe(0)
  })

  it('松手后补按回来可以续上', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    engine.release(0, 1.3)
    const r = engine.hit(0, 1.4)
    expect(r).not.toBeNull()
    expect(engine.notes[0].holdState).toBe('holding')
  })

  it('按住 30% 就松手不补 → 完成度不足判 miss', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    engine.release(0, 1.3) // 只按了 0.3 / 1.0
    engine.update(2.1)
    expect(engine.getStats().miss).toBe(1)
    expect(engine.getStats().resolved).toBe(1)
  })

  it('按住 85% → great（完成度降级但不算漏）', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    engine.release(0, 1.85)
    engine.update(2.1)
    expect(engine.getStats().great).toBe(1)
    expect(engine.getStats().miss).toBe(0)
  })

  it('断续补按的时长会累加', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    engine.release(0, 1.4) // 按了 0.4
    engine.hit(0, 1.5)
    engine.release(0, 2.0) // 又按了 0.5，累计 0.9 / 1.0 = 90%
    expect(engine.getStats().great).toBe(1)
    expect(engine.getStats().resolved).toBe(1)
  })

  it('每个长按最终恰好被 resolve 一次', () => {
    const engine = new JudgeEngine(holdMap())
    engine.hit(0, 1.0)
    engine.release(0, 1.3)
    engine.hit(0, 1.5)
    engine.update(2.1)
    engine.update(3.0)
    engine.update(4.0)
    const s = engine.getStats()
    expect(s.perfect + s.great + s.good + s.miss + s.skipped).toBe(1)
    expect(s.resolved).toBe(1)
  })
})

describe('长按判定：与其他音符的交互', () => {
  it('长按进行中不阻塞同轨后续音符的判定', () => {
    // 长按 1.0-1.5，之后 2.0 还有个普通音符（生成器不会这样排，但要防御）
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0, duration: 0.5 },
        { time: 2.0, lane: 0 },
      ]),
    )
    engine.hit(0, 1.0)
    engine.update(1.6) // 长按自动结算
    const r = engine.hit(0, 2.0)
    expect(r?.judgement).toBe('perfect')
    expect(engine.getStats().resolved).toBe(2)
  })

  it('长按 holding 时不会被 update 误判为 miss', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0, duration: 2.0 }]))
    engine.hit(0, 1.0)
    // 远超 good 窗口，但长按还没到尾部
    engine.update(1.5)
    engine.update(2.5)
    expect(engine.getStats().miss).toBe(0)
    expect(engine.notes[0].holdState).toBe('holding')
  })

  it('长按不阻塞其他轨道', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0, duration: 2.0 },
        { time: 1.5, lane: 1 },
      ]),
    )
    engine.hit(0, 1.0)
    const r = engine.hit(1, 1.5)
    expect(r?.judgement).toBe('perfect')
  })

  it('abandonHolds 把进行中的长按记为 skipped 而非 miss', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0, duration: 2.0 }]))
    engine.hit(0, 1.0)
    const n = engine.abandonHolds()
    expect(n).toBe(1)
    expect(engine.getStats().skipped).toBe(1)
    expect(engine.getStats().miss).toBe(0)
    // 头部加的 combo 要回退，不能留虚高值
    expect(engine.getStats().combo).toBe(0)
  })

  it('abandonHolds 不影响达成率', () => {
    const engine = new JudgeEngine(
      makeMap([
        { time: 1.0, lane: 0 },
        { time: 2.0, lane: 1, duration: 2.0 },
      ]),
    )
    engine.hit(0, 1.0) // perfect
    engine.hit(1, 2.0) // 长按头部
    expect(engine.accuracy).toBeCloseTo(100, 5)
    engine.abandonHolds()
    expect(engine.accuracy).toBeCloseTo(100, 5)
  })

  it('skipTo 也会清理进行中的长按', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0, duration: 2.0 }]))
    engine.hit(0, 1.0)
    engine.skipTo(5.0)
    expect(engine.getStats().skipped).toBe(1)
    expect(engine.finished).toBe(true)
  })

  it('长按提前 good 窗口内松手也算撑到（与头部同等宽容）', () => {
    const engine = new JudgeEngine(makeMap([{ time: 1.0, lane: 0, duration: 1.0 }]))
    engine.hit(0, 1.0)
    // 尾部在 2.0，提前 0.1s 松手（good 窗口 0.13s 内）
    const r = engine.release(0, 1.9)
    expect(r).not.toBeNull()
    expect(engine.getStats().miss).toBe(0)
    expect(engine.notes[0].holdState).toBe('done')
  })
})
