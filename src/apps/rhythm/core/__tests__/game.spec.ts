// 端到端串联测试：用假时钟驱动 Game，验证「时钟 → 判定 → 渲染」链路。
//
// 为什么不在真实浏览器跑机器人：真实播放需要等完整时长，且 evaluate 环境
// 长时间 setInterval 会被打断。这里用 stub 的 AudioContext/Canvas 精确控制时间，
// 既快又可重复。真实音频行为已由 clock.ts 的浏览器实测覆盖（漂移 0.03ms）。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Game, PREP_TIME, OUTRO_TAIL, type GameOptions, type GameCallbacks } from '../game'
import { generateBeatmap, type Beatmap } from '../beatmap'

/** 可手动推进的假 AudioContext */
class FakeAudioContext {
  currentTime = 0
  baseLatency = 0
  outputLatency = 0
  destination = {} as AudioNode

  resume = vi.fn(async () => {})

  createBufferSource() {
    return {
      buffer: null,
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
  }
  createGain() {
    return {
      gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      disconnect: vi.fn(),
    }
  }
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      start: vi.fn(),
      stop: vi.fn(),
    }
  }
}

function fakeCanvas() {
  const ctx2d = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    ellipse: vi.fn(),
    // 音符与特效被裁剪到跑道范围内，走 rect + clip
    rect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    // 渐变对象只需要能收 addColorStop 并被赋给 fillStyle
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '' as unknown,
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
  }
  return {
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ width: 480, height: 640 }),
    clientWidth: 480,
    clientHeight: 640,
    width: 0,
    height: 0,
    _ctx2d: ctx2d,
  }
}

function makeBeatmap(): Beatmap {
  // 每 0.25s 一个等强度峰 → 120 BPM 的 1/8 拍网格上均匀铺满音符。
  // chordRatio 设 0：本套测试验证判定链路，双押会让「每次 tap 对应一个音符」
  // 的假设不成立，干扰断言。
  const FRAME_DUR = 512 / 48000
  const duration = 15
  const odf = new Float32Array(Math.ceil(duration / FRAME_DUR))
  for (let i = 0; i < 40; i++) {
    const t = 1 + i * 0.25
    odf[Math.round(t / FRAME_DUR)] = 10
  }
  return generateBeatmap(
    { songId: 's', title: 't', bpm: 120, offset: 0, duration, odf, frameDuration: FRAME_DUR },
    { lanes: 4, quantizeDivision: 2, targetDensity: 40 / duration, chordRatio: 0 },
  )
}

/**
 * 驱动 Game 走完全程，bot 按指定偏移击打。
 *
 * leadIn 默认 0：判定链路的断言只关心「击打时机 → 判定等级」，
 * 准备期是纯 UI 行为，单独测（见「开局准备时间」一节）。
 */
async function runGame(
  map: Beatmap,
  offsetMs: number | null,
  leadIn = 0,
): Promise<{ perfect: number; great: number; good: number; miss: number; maxCombo: number; score: number; accuracy: number; drawCalls: number }> {
  const audioCtx = new FakeAudioContext()
  const canvas = fakeCanvas()
  const buffer = { duration: map.duration, numberOfChannels: 1, length: 1, sampleRate: 48000 }

  const game = new Game(
    audioCtx as unknown as AudioContext,
    buffer as unknown as AudioBuffer,
    map,
    canvas as unknown as HTMLCanvasElement,
    {},
    { hitSoundVolume: 0, leadIn },
  )

  await game.start()

  const sorted = [...map.notes].sort((a, b) => a.time - b.time)
  let cursor = 0
  const step = 1 / 240 // 模拟 240Hz 轮询，比 60fps 更细以减少采样误差

  // 墙上时间要多跑 leadIn 秒，否则歌曲尾部走不完
  for (let wall = 0; wall <= map.duration + leadIn; wall += step) {
    audioCtx.currentTime = wall
    const songTime = game.currentTime

    if (offsetMs !== null) {
      const target = offsetMs / 1000
      while (cursor < sorted.length && sorted[cursor].time + target <= songTime) {
        game.tapLane(sorted[cursor].lane)
        cursor++
      }
    }
    // 手动触发一次循环体的判定与渲染（不依赖 rAF）
    game.tick(songTime)
  }

  const s = game.stats
  const result = {
    perfect: s.perfect,
    great: s.great,
    good: s.good,
    miss: s.miss,
    maxCombo: s.maxCombo,
    score: s.score,
    accuracy: game.accuracy,
    drawCalls: canvas._ctx2d.clearRect.mock.calls.length,
  }
  game.dispose()
  return result
}

describe('Game 端到端串联', () => {
  let map: Beatmap

  beforeEach(() => {
    map = makeBeatmap()
    // Game.start 内部会用 rAF，测试里用同步 stub 避免真实调度
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('谱面非空且音符数合理', () => {
    expect(map.notes.length).toBeGreaterThan(30)
  })

  it('完美时机击打 → 接近全 perfect、满分、全连', async () => {
    const r = await runGame(map, 0)
    expect(r.miss).toBe(0)
    // 采样步长 1/240s ≈ 4.2ms，远小于 perfect 窗口 40ms
    expect(r.perfect).toBe(map.notes.length)
    expect(r.maxCombo).toBe(map.notes.length)
    expect(r.accuracy).toBeCloseTo(100, 1)
    expect(r.score).toBe(1_000_000)
  })

  it('偏晚 60ms 击打 → 全部落在 great 档', async () => {
    const r = await runGame(map, 60)
    expect(r.miss).toBe(0)
    expect(r.great).toBe(map.notes.length)
    expect(r.perfect).toBe(0)
    // great 权重 0.7
    expect(r.accuracy).toBeCloseTo(70, 0)
  })

  it('偏晚 110ms 击打 → 落在 good 档', async () => {
    const r = await runGame(map, 110)
    expect(r.good).toBe(map.notes.length)
    expect(r.miss).toBe(0)
  })

  it('完全不击打 → 全 miss、0 分', async () => {
    const r = await runGame(map, null)
    expect(r.miss).toBe(map.notes.length)
    expect(r.perfect + r.great + r.good).toBe(0)
    expect(r.score).toBe(0)
    expect(r.accuracy).toBe(0)
  })

  it('偏移过大时会串到下一个音符（音游真实行为）', async () => {
    // 音符间隔 250ms。延后 200ms 击打时，距当前音符 +200ms 已超出 good 窗口(130ms)，
    // 但距下一个音符只有 -50ms，仍在窗口内 —— 因此会「借」到下一个音符。
    // 结果是大量 miss 混杂少量 great，而非全 miss。这是所有音游的共同行为，
    // 判定只看时间距离，不关心玩家「想打哪个」。
    const r = await runGame(map, 200)
    expect(r.miss).toBeGreaterThan(map.notes.length * 0.5)
    expect(r.perfect).toBe(0)
    // 总判定数守恒：每个音符恰好被判定一次
    expect(r.perfect + r.great + r.good + r.miss).toBe(map.notes.length)
  })

  it('渲染被实际调用（每次 tick 都清屏重绘）', async () => {
    const r = await runGame(map, 0)
    expect(r.drawCalls).toBeGreaterThan(100)
  })
})

describe('开局准备时间（lead-in）', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  /** 建一个 Game 并返回它与可推进的假 ctx */
  function setup(options: GameOptions = {}) {
    const map = makeBeatmap()
    const audioCtx = new FakeAudioContext()
    const canvas = fakeCanvas()
    const buffer = { duration: map.duration, numberOfChannels: 1, length: 1, sampleRate: 48000 }
    const game = new Game(
      audioCtx as unknown as AudioContext,
      buffer as unknown as AudioBuffer,
      map,
      canvas as unknown as HTMLCanvasElement,
      {},
      { hitSoundVolume: 0, ...options },
    )
    return { game, audioCtx, canvas, map }
  }

  it('start 后游戏时间为负：这正是「反应时间」', async () => {
    const { game, audioCtx } = setup({ leadIn: 2 })
    await game.start()
    // 墙上时间还没走，游戏时间应是 -2
    expect(game.currentTime).toBeCloseTo(-2, 3)
    audioCtx.currentTime = 0.5
    expect(game.currentTime).toBeCloseTo(-1.5, 3)
    game.dispose()
  })

  it('准备期结束后游戏时间归零并继续前进', async () => {
    const { game, audioCtx } = setup({ leadIn: 2 })
    await game.start()
    audioCtx.currentTime = 2
    expect(game.currentTime).toBeCloseTo(0, 3)
    audioCtx.currentTime = 3.5
    expect(game.currentTime).toBeCloseTo(1.5, 3)
    game.dispose()
  })

  it('音源被调度到未来而非立即播放（保证音画同步）', async () => {
    const { game, audioCtx } = setup({ leadIn: 2 })
    const spy = vi.spyOn(audioCtx, 'createBufferSource')
    await game.start()
    const source = spy.mock.results[0].value
    // start(when, offset)：when 必须是 leadIn 之后
    expect(source.start).toHaveBeenCalledWith(2, 0)
    game.dispose()
  })

  it('countdown 反映剩余准备秒数，进入演奏后为 0', async () => {
    const { game, audioCtx } = setup({ leadIn: 3 })
    await game.start()
    expect(game.countdown).toBeCloseTo(3, 3)
    audioCtx.currentTime = 2
    expect(game.countdown).toBeCloseTo(1, 3)
    audioCtx.currentTime = 3.2
    expect(game.countdown).toBe(0)
    game.dispose()
  })

  it('默认准备时间 = 下落时间 + PREP_TIME（第一个音符能走完整程）', async () => {
    const approachTime = 1.0
    const { game } = setup({ approachTime })
    await game.start()
    expect(game.countdown).toBeCloseTo(approachTime + PREP_TIME, 3)
    game.dispose()
  })

  it('下落速度越慢准备时间越长（自动适配）', async () => {
    const fast = setup({ approachTime: 0.5 })
    const slow = setup({ approachTime: 2.0 })
    await fast.game.start()
    await slow.game.start()
    expect(slow.game.countdown).toBeGreaterThan(fast.game.countdown)
    expect(slow.game.countdown - fast.game.countdown).toBeCloseTo(1.5, 3)
    fast.game.dispose()
    slow.game.dispose()
  })

  it('准备期内不产生 miss（关键：音符还没到判定线）', async () => {
    const { game, audioCtx, map } = setup({ leadIn: 3 })
    await game.start()
    for (let wall = 0; wall < 3; wall += 1 / 60) {
      audioCtx.currentTime = wall
      game.tick(game.currentTime)
    }
    expect(game.stats.miss).toBe(0)
    expect(game.stats.resolved).toBe(0)
    expect(map.notes.length).toBeGreaterThan(0)
    game.dispose()
  })

  it('准备期内也照常渲染（音符可见地下落，不是黑屏等待）', async () => {
    const { game, audioCtx, canvas } = setup({ leadIn: 2 })
    await game.start()
    for (let wall = 0; wall < 2; wall += 1 / 60) {
      audioCtx.currentTime = wall
      game.tick(game.currentTime)
    }
    expect(canvas._ctx2d.clearRect.mock.calls.length).toBeGreaterThan(100)
    // 倒计时数字被画出来
    expect(canvas._ctx2d.fillText.mock.calls.some((c) => c[0] === '2' || c[0] === 'GO')).toBe(true)
    game.dispose()
  })

  it('准备期内不会误判结束', async () => {
    const onFinish = vi.fn()
    const map = makeBeatmap()
    const audioCtx = new FakeAudioContext()
    const canvas = fakeCanvas()
    const buffer = { duration: map.duration, numberOfChannels: 1, length: 1, sampleRate: 48000 }
    const game = new Game(
      audioCtx as unknown as AudioContext,
      buffer as unknown as AudioBuffer,
      map,
      canvas as unknown as HTMLCanvasElement,
      { onFinish },
      { hitSoundVolume: 0, leadIn: 2 },
    )
    await game.start()
    for (let wall = 0; wall < 2; wall += 1 / 60) {
      audioCtx.currentTime = wall
      game.tick(game.currentTime)
    }
    expect(onFinish).not.toHaveBeenCalled()
    game.dispose()
  })

  it('带 lead-in 时完美击打仍是满分（准备期不影响判定精度）', async () => {
    const r = await runGame(makeBeatmap(), 0, 2)
    expect(r.miss).toBe(0)
    expect(r.accuracy).toBeCloseTo(100, 1)
    expect(r.score).toBe(1_000_000)
  })
})

describe('结束时机（不能打完最后音符就硬切结算）', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  const FRAME_DUR = 512 / 48000

  /** 谱面只覆盖到 upto 秒，歌曲总长 duration 秒 */
  function partialMap(duration: number, upto: number): Beatmap {
    const odf = new Float32Array(Math.ceil(duration / FRAME_DUR))
    for (let t = 1; t <= upto; t += 0.5) odf[Math.round(t / FRAME_DUR)] = 10
    return generateBeatmap(
      { songId: 's', title: 't', bpm: 120, offset: 0, duration, odf, frameDuration: FRAME_DUR },
      { quantizeDivision: 2, targetDensity: 1, chordRatio: 0, maxSilence: 0 },
    )
  }

  function build(map: Beatmap, onFinish: () => void) {
    const audioCtx = new FakeAudioContext()
    const canvas = fakeCanvas()
    const game = new Game(
      audioCtx as unknown as AudioContext,
      { duration: map.duration } as unknown as AudioBuffer,
      map,
      canvas as unknown as HTMLCanvasElement,
      { onFinish },
      { hitSoundVolume: 0, leadIn: 0 },
    )
    return { game, audioCtx }
  }

  it('打完最后音符后要留 OUTRO_TAIL 缓冲才结算（让特效演完）', async () => {
    // 谱面到 5s，歌 30s
    const map = partialMap(30, 5)
    let finishAt = -1
    const { game, audioCtx } = build(map, () => {
      finishAt = audioCtx.currentTime
    })
    await game.start()

    const sorted = [...map.notes].sort((a, b) => a.time - b.time)
    const lastNote = sorted[sorted.length - 1].time
    let cur = 0
    for (let t = 0; t <= 12; t += 1 / 120) {
      audioCtx.currentTime = t
      while (cur < sorted.length && sorted[cur].time <= t) {
        game.tapLane(sorted[cur].lane)
        cur++
      }
      game.tick(t)
    }

    // 关键：不能在 lastNote 那一刻就结束
    expect(finishAt).toBeGreaterThanOrEqual(lastNote + OUTRO_TAIL - 0.05)
    expect(finishAt).toBeLessThan(lastNote + OUTRO_TAIL + 0.5)
    game.dispose()
  })

  it('谱面覆盖到歌尾时，按歌曲结束收尾', async () => {
    const map = makeBeatmap() // 15s，音符到 ~10.75s
    let finishAt = -1
    const { game, audioCtx } = build(map, () => {
      finishAt = audioCtx.currentTime
    })
    await game.start()
    const sorted = [...map.notes].sort((a, b) => a.time - b.time)
    let cur = 0
    for (let t = 0; t <= 15; t += 1 / 120) {
      audioCtx.currentTime = t
      while (cur < sorted.length && sorted[cur].time <= t) {
        game.tapLane(sorted[cur].lane)
        cur++
      }
      game.tick(t)
    }
    expect(finishAt).toBeGreaterThan(0)
    // 要么等到歌尾，要么最后音符 + 缓冲，两者取先到的
    const lastNote = sorted[sorted.length - 1].time
    expect(finishAt).toBeLessThanOrEqual(Math.min(15, lastNote + OUTRO_TAIL) + 0.2)
    game.dispose()
  })

  it('准备期内（时间为负）绝不触发结算', async () => {
    const map = partialMap(30, 5)
    const onFinish = vi.fn()
    const audioCtx = new FakeAudioContext()
    const canvas = fakeCanvas()
    const game = new Game(
      audioCtx as unknown as AudioContext,
      { duration: 30 } as unknown as AudioBuffer,
      map,
      canvas as unknown as HTMLCanvasElement,
      { onFinish },
      { hitSoundVolume: 0, leadIn: 2 },
    )
    await game.start()
    for (let wall = 0; wall < 2; wall += 1 / 60) {
      audioCtx.currentTime = wall
      game.tick(game.currentTime)
    }
    expect(onFinish).not.toHaveBeenCalled()
    game.dispose()
  })
})

describe('时间跳变防护（切后台不该凭空扣 combo）', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  function build(map: Beatmap) {
    const audioCtx = new FakeAudioContext()
    const canvas = fakeCanvas()
    const game = new Game(
      audioCtx as unknown as AudioContext,
      { duration: map.duration } as unknown as AudioBuffer,
      map,
      canvas as unknown as HTMLCanvasElement,
      {},
      { hitSoundVolume: 0, leadIn: 0 },
    )
    return { game, audioCtx }
  }

  /** 正常玩到 untilT 秒，全部完美击打 */
  function playTo(game: Game, audioCtx: FakeAudioContext, map: Beatmap, untilT: number) {
    const sorted = [...map.notes].sort((a, b) => a.time - b.time)
    let cur = 0
    for (let t = 0; t <= untilT; t += 1 / 120) {
      audioCtx.currentTime = t
      while (cur < sorted.length && sorted[cur].time <= t) {
        game.tapLane(sorted[cur].lane)
        cur++
      }
      game.tick(t)
    }
  }

  it('时间跳变 5 秒不产生任何 miss（修复前会凭空丢 10+ combo）', async () => {
    const map = makeBeatmap()
    const { game, audioCtx } = build(map)
    await game.start()
    playTo(game, audioCtx, map, 5)

    const missBefore = game.stats.miss
    const comboBefore = game.stats.combo
    // 模拟 rAF 被冻结：不调 tick，音频时钟直接跳 5 秒
    audioCtx.currentTime = 10
    game.tick(10)

    expect(game.stats.miss).toBe(missBefore)
    // combo 也不该被打断
    expect(game.stats.combo).toBe(comboBefore)
    game.dispose()
  })

  it('跳过的音符计入 skipped 而非 miss', async () => {
    const map = makeBeatmap()
    const { game, audioCtx } = build(map)
    await game.start()
    playTo(game, audioCtx, map, 5)
    audioCtx.currentTime = 10
    game.tick(10)

    expect(game.stats.skipped).toBeGreaterThan(0)
    expect(game.stats.miss).toBe(0)
    game.dispose()
  })

  it('skipped 不拉低达成率（玩家没机会打，不算失误）', async () => {
    const map = makeBeatmap()
    const { game, audioCtx } = build(map)
    await game.start()
    playTo(game, audioCtx, map, 5)
    const accBefore = game.accuracy
    audioCtx.currentTime = 10
    game.tick(10)

    expect(game.accuracy).toBeCloseTo(accBefore, 5)
    expect(game.accuracy).toBeCloseTo(100, 1)
    game.dispose()
  })

  it('正常掉帧（低于 MAX_TIME_STEP）仍照常判定 miss', async () => {
    const map = makeBeatmap()
    const { game, audioCtx } = build(map)
    await game.start()
    // 以 0.4s 步长推进（低于 0.5s 阈值），不击打 → 应该正常 miss
    for (let t = 0; t <= 6; t += 0.4) {
      audioCtx.currentTime = t
      game.tick(t)
    }
    expect(game.stats.miss).toBeGreaterThan(5)
    expect(game.stats.skipped).toBe(0)
    game.dispose()
  })

  it('跳变后仍能正常继续判定（游标没被搞乱）', async () => {
    const map = makeBeatmap()
    const { game, audioCtx } = build(map)
    await game.start()
    playTo(game, audioCtx, map, 3)
    // 跳变
    audioCtx.currentTime = 6
    game.tick(6)
    // 恢复正常击打
    const perfectBefore = game.stats.perfect
    const sorted = [...map.notes].sort((a, b) => a.time - b.time)
    let cur = sorted.findIndex((n) => n.time > 6.2)
    for (let t = 6.2; t <= 11; t += 1 / 120) {
      audioCtx.currentTime = t
      while (cur >= 0 && cur < sorted.length && sorted[cur].time <= t) {
        game.tapLane(sorted[cur].lane)
        cur++
      }
      game.tick(t)
    }
    expect(game.stats.perfect).toBeGreaterThan(perfectBefore)
    game.dispose()
  })

  it('每个音符最终恰好被解决一次（跳变不破坏守恒）', async () => {
    const map = makeBeatmap()
    const { game, audioCtx } = build(map)
    await game.start()
    playTo(game, audioCtx, map, 3)
    audioCtx.currentTime = 8
    game.tick(8)
    for (let t = 8.1; t <= 15; t += 1 / 120) {
      audioCtx.currentTime = t
      game.tick(t)
    }
    const s = game.stats
    expect(s.perfect + s.great + s.good + s.miss + s.skipped).toBe(map.notes.length)
    expect(s.resolved).toBe(map.notes.length)
    game.dispose()
  })
})

describe('手动暂停（与切后台自动暂停共用一条路径）', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  function build(map: Beatmap, callbacks: GameCallbacks = {}) {
    const audioCtx = new FakeAudioContext()
    const canvas = fakeCanvas()
    const game = new Game(
      audioCtx as unknown as AudioContext,
      { duration: map.duration } as unknown as AudioBuffer,
      map,
      canvas as unknown as HTMLCanvasElement,
      callbacks,
      { hitSoundVolume: 0, leadIn: 0 },
    )
    return { game, audioCtx }
  }

  /** 手工构造谱面：手动暂停的测试需要精确控制音符（尤其是长按） */
  function holdMap(): Beatmap {
    return {
      songId: 's',
      title: 't',
      lanes: 4,
      bpm: 120,
      offset: 0,
      duration: 8,
      notes: [{ time: 1, lane: 0, duration: 2 }],
      meta: {
        quantizeDivision: 2,
        gridPoints: 0,
        activePoints: 0,
        chordPoints: 0,
        holdNotes: 1,
        holdTotalSec: 2,
        threshold: 0,
        beatFillRate: 0,
        maxGap: 0,
      },
    }
  }

  it('pause() 置 paused、回调 onPause', async () => {
    const map = makeBeatmap()
    const onPause = vi.fn()
    const { game, audioCtx } = build(map, { onPause })
    await game.start()
    audioCtx.currentTime = 2
    game.tick(2)

    game.pause()
    expect(game.paused).toBe(true)
    expect(onPause).toHaveBeenCalledTimes(1)
    game.dispose()
  })

  it('未开始 / 已暂停时 pause() 是空操作，不重复回调', async () => {
    const map = makeBeatmap()
    const onPause = vi.fn()
    const { game } = build(map, { onPause })

    game.pause() // 未 start
    expect(onPause).not.toHaveBeenCalled()

    await game.start()
    game.pause()
    game.pause() // 已暂停再按一次
    expect(onPause).toHaveBeenCalledTimes(1)
    game.dispose()
  })

  it('resume() 后回退重新起播并回调 onResume', async () => {
    const map = makeBeatmap()
    const onResume = vi.fn()
    const { game, audioCtx } = build(map, { onResume })
    await game.start()
    audioCtx.currentTime = 3
    game.tick(3)

    game.pause()
    game.resume()
    expect(game.paused).toBe(false)
    expect(onResume).toHaveBeenCalledTimes(1)
    // 回退量 = RESUME_REWIND，从 3s 退到 1.5s
    expect(onResume.mock.calls[0][0]).toBeCloseTo(3 - 1.5, 1)
    game.dispose()
  })

  it('暂停期间进行中的长按被作废（不算成功也不算失败）', async () => {
    const map = holdMap()
    const { game, audioCtx } = build(map)
    await game.start()
    // 按住长按头部
    audioCtx.currentTime = 1
    game.tick(1)
    game.tapLane(0)

    game.pause()
    // 暂停后松手不该被结算成 broken——长按已被 abandonHolds 作废
    audioCtx.currentTime = 1.5
    game.releaseLane(0)

    // 播完整局
    game.resume()
    for (let t = 0; t <= map.duration + 3; t += 1 / 60) {
      audioCtx.currentTime = t
      game.tick(t)
    }
    expect(game.stats.holdBreaks).toBe(0)
    game.dispose()
  })
})
