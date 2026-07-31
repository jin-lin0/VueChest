import { describe, it, expect } from 'vitest'
import {
  toMono,
  energyEnvelope,
  detectOnsets,
  estimateBpmFromOnsets,
  resolveOctave,
  gridAlignment,
  refineOffset,
} from '../analyze'
import { judge, JUDGE_WINDOWS } from '../clock'

/** 构造一个最小的 AudioBuffer-like 对象，避免依赖真实 Web Audio */
function fakeBuffer(channels: Float32Array[], sampleRate = 44100) {
  return {
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate,
    getChannelData: (i: number) => channels[i],
  }
}

/**
 * 合成一段脉冲信号：在指定时间点放一小段高振幅噪声，其余为静音。
 * 用来验证 onset 检测能否找回已知的鼓点位置。
 */
function synthPulses(times: number[], duration: number, sampleRate = 44100) {
  const data = new Float32Array(Math.floor(duration * sampleRate))
  const pulseLen = Math.floor(0.02 * sampleRate) // 20ms
  for (const t of times) {
    const start = Math.floor(t * sampleRate)
    for (let i = 0; i < pulseLen && start + i < data.length; i++) {
      // 衰减包络，更接近真实打击音
      data[start + i] = (Math.random() * 2 - 1) * (1 - i / pulseLen)
    }
  }
  return data
}

describe('toMono', () => {
  it('单声道直接返回原数据', () => {
    const ch = new Float32Array([0.1, 0.2, 0.3])
    expect(toMono(fakeBuffer([ch]))).toBe(ch)
  })

  it('多声道取均值', () => {
    const l = new Float32Array([1, 0, -1])
    const r = new Float32Array([0, 0, 1])
    const mono = toMono(fakeBuffer([l, r]))
    expect(Array.from(mono)).toEqual([0.5, 0, 0])
  })
})

describe('energyEnvelope', () => {
  it('静音段 RMS 为 0，满幅段为 1', () => {
    const samples = new Float32Array(2048)
    samples.fill(1, 1024, 2048) // 后半段满幅
    const env = energyEnvelope(samples, 1024)
    expect(env.length).toBe(2)
    expect(env[0]).toBeCloseTo(0)
    expect(env[1]).toBeCloseTo(1)
  })

  it('帧数不足一个 hop 时返回空', () => {
    expect(energyEnvelope(new Float32Array(100), 512).length).toBe(0)
  })
})

describe('detectOnsets', () => {
  // 默认走谱通量（spectral），另外单独覆盖 energy 方式
  it('能找回合成脉冲的位置', () => {
    const times = [0.5, 1.0, 1.5, 2.0, 2.5]
    const data = synthPulses(times, 3)
    const onsets = detectOnsets(fakeBuffer([data]))

    // 每个已知脉冲附近都应有检出（容差 50ms，受分帧精度限制）
    for (const t of times) {
      const hit = onsets.some((o) => Math.abs(o - t) < 0.05)
      expect(hit, `未检出 ${t}s 处的脉冲，实际检出：${onsets.join(', ')}`).toBe(true)
    }
  })

  it('energy 方式同样能找回脉冲位置', () => {
    const times = [0.5, 1.0, 1.5, 2.0, 2.5]
    const data = synthPulses(times, 3)
    const onsets = detectOnsets(fakeBuffer([data]), { method: 'energy', threshold: 3.5 })
    for (const t of times) {
      expect(onsets.some((o) => Math.abs(o - t) < 0.05)).toBe(true)
    }
  })

  it('纯静音不产生起音点', () => {
    expect(detectOnsets(fakeBuffer([new Float32Array(44100)]))).toEqual([])
    expect(detectOnsets(fakeBuffer([new Float32Array(44100)]), { method: 'energy' })).toEqual([])
  })

  it('minInterval 抑制过密的检出', () => {
    // 间隔 30ms 的密集脉冲，要求最小间隔 200ms
    const times = Array.from({ length: 20 }, (_, i) => 0.5 + i * 0.03)
    const data = synthPulses(times, 2)
    const onsets = detectOnsets(fakeBuffer([data]), { minInterval: 0.2 })
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i] - onsets[i - 1]).toBeGreaterThanOrEqual(0.19)
    }
  })

  it('输出严格升序', () => {
    const data = synthPulses([0.3, 0.8, 1.4, 2.1], 3)
    const onsets = detectOnsets(fakeBuffer([data]))
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i]).toBeGreaterThan(onsets[i - 1])
    }
  })
})

describe('gridAlignment', () => {
  it('完美贴合网格时为 100%', () => {
    const bpm = 120
    const beat = 60 / bpm
    const onsets = Array.from({ length: 20 }, (_, i) => i * beat)
    expect(gridAlignment(onsets, bpm)).toBeCloseTo(100, 1)
  })

  it('全部落在网格中间时为 0%', () => {
    const bpm = 120
    const beat = 60 / bpm // 0.5s，半拍 0.25s 远超 40ms 容差
    const onsets = Array.from({ length: 20 }, (_, i) => i * beat + beat / 2)
    expect(gridAlignment(onsets, bpm)).toBe(0)
  })

  it('考虑 offset 平移', () => {
    const bpm = 120
    const beat = 60 / bpm
    const offset = 0.137
    const onsets = Array.from({ length: 20 }, (_, i) => offset + i * beat)
    expect(gridAlignment(onsets, bpm, offset)).toBeCloseTo(100, 1)
    // 不传 offset 则对不上
    expect(gridAlignment(onsets, bpm)).toBe(0)
  })

  it('空输入或非法 bpm 返回 0', () => {
    expect(gridAlignment([], 120)).toBe(0)
    expect(gridAlignment([1, 2, 3], 0)).toBe(0)
  })
})

describe('estimateBpmFromOnsets', () => {
  it('等间隔 0.5s → 120 BPM', () => {
    const onsets = Array.from({ length: 20 }, (_, i) => i * 0.5)
    expect(estimateBpmFromOnsets(onsets)).toBeCloseTo(120, 1)
  })

  it('结果折叠到 90-180 区间', () => {
    // 间隔 1s = 60 BPM，应翻倍到 120
    const slow = Array.from({ length: 10 }, (_, i) => i * 1.0)
    expect(estimateBpmFromOnsets(slow)).toBeCloseTo(120, 1)

    // 间隔 0.2s = 300 BPM，应折半到 150
    const fast = Array.from({ length: 10 }, (_, i) => i * 0.2)
    expect(estimateBpmFromOnsets(fast)).toBeCloseTo(150, 1)
  })

  it('样本太少返回 0', () => {
    expect(estimateBpmFromOnsets([0, 0.5])).toBe(0)
    expect(estimateBpmFromOnsets([])).toBe(0)
  })
})

describe('resolveOctave', () => {
  /** 等强度节拍：每拍一个同样强的脉冲 */
  function evenBeats(bpm: number, duration = 180, sampleRate = 44100) {
    const beatDur = 60 / bpm
    const times: number[] = []
    for (let t = 0; t < duration; t += beatDur) times.push(t)
    return fakeBuffer([synthPulses(times, duration, sampleRate)], sampleRate)
  }

  /**
   * 强弱交替节拍：真实律动是 bpm/2，每两拍才有一个重音。
   * 这类信号被检测成 bpm 时，半速自相关明显更优，应触发降频。
   */
  function accentedBeats(bpm: number, duration = 180, sampleRate = 44100) {
    const beatDur = 60 / bpm
    const data = new Float32Array(Math.floor(duration * sampleRate))
    const pulseLen = Math.floor(0.02 * sampleRate)
    let n = 0
    for (let t = 0; t < duration; t += beatDur, n++) {
      const amp = n % 2 === 0 ? 1 : 0.15 // 弱拍能量远低于强拍
      const start = Math.floor(t * sampleRate)
      for (let i = 0; i < pulseLen && start + i < data.length; i++) {
        data[start + i] = (Math.random() * 2 - 1) * amp * (1 - i / pulseLen)
      }
    }
    return fakeBuffer([data], sampleRate)
  }

  it('强弱交替信号被误判为倍速时纠正回真实拍速', () => {
    // 真实律动 75（每两个 150 的拍里只有一个重音），检测器报 150
    expect(resolveOctave(accentedBeats(150), 150)).toBeCloseTo(75, 0)
  })

  it('等强度节拍不误降（关键回归：曾把 120 误降到 60）', () => {
    expect(resolveOctave(evenBeats(120), 120)).toBeCloseTo(120, 0)
  })

  it('不会降到 60 BPM 以下', () => {
    expect(resolveOctave(accentedBeats(140), 140)).toBeGreaterThanOrEqual(60)
  })

  it('bpm 为 0 时原样返回', () => {
    expect(resolveOctave(evenBeats(100), 0)).toBe(0)
  })
})

describe('refineOffset', () => {
  it('从贴合网格的 onset 反推出正确相位', () => {
    const bpm = 150
    const beat = 60 / bpm
    const truePhase = 0.137
    const onsets = Array.from({ length: 40 }, (_, i) => truePhase + i * beat)
    expect(refineOffset(onsets, bpm)).toBeCloseTo(truePhase, 2)
  })

  it('相位接近 0 时不被环形边界坑到（圆均值的意义）', () => {
    const bpm = 150
    const beat = 60 / bpm
    // 一半 onset 在 0.005s，一半在 beat-0.005s —— 二者实际都贴近相位 0。
    // 若用算术均值会得出 beat/2 这种完全错误的结果。
    const onsets: number[] = []
    for (let i = 0; i < 20; i++) {
      onsets.push(i * beat + 0.005)
      onsets.push(i * beat + beat - 0.005)
    }
    const refined = refineOffset(onsets, bpm)
    // 结果应接近 0 或接近 beat（等价相位），而不是 beat/2
    const distToZero = Math.min(refined, beat - refined)
    expect(distToZero).toBeLessThan(0.02)
  })

  it('相位分散时保留 fallback 不乱改', () => {
    const bpm = 150
    const beat = 60 / bpm
    // 均匀铺满整个拍周期 → 无明确相位
    const onsets = Array.from({ length: 200 }, (_, i) => (i / 200) * beat * 50)
    expect(refineOffset(onsets, bpm, 0.99)).toBe(0.99)
  })

  it('样本太少或 bpm 非法时返回 fallback', () => {
    expect(refineOffset([0.1, 0.5], 150, 0.42)).toBe(0.42)
    expect(refineOffset(Array.from({ length: 20 }, (_, i) => i * 0.4), 0, 0.42)).toBe(0.42)
  })

  it('精修后对齐率应不低于使用原始 offset', () => {
    const bpm = 150
    const beat = 60 / bpm
    const truePhase = 0.01
    // 真实 onset 贴在 truePhase 上，但检测器误报 offset 为 0.0347
    const onsets = Array.from({ length: 60 }, (_, i) => truePhase + i * beat)
    const detectorOffset = 0.0347

    const refined = refineOffset(onsets, bpm, detectorOffset)
    expect(gridAlignment(onsets, bpm, refined)).toBeGreaterThanOrEqual(
      gridAlignment(onsets, bpm, detectorOffset),
    )
    expect(gridAlignment(onsets, bpm, refined)).toBeCloseTo(100, 0)
  })
})

describe('judge', () => {
  it('按窗口分级', () => {
    expect(judge(0)).toBe('perfect')
    expect(judge(JUDGE_WINDOWS.perfect)).toBe('perfect')
    expect(judge(JUDGE_WINDOWS.perfect + 1)).toBe('great')
    expect(judge(JUDGE_WINDOWS.great + 1)).toBe('good')
    expect(judge(JUDGE_WINDOWS.good + 1)).toBe('miss')
  })

  it('提前和延后对称判定', () => {
    expect(judge(-30)).toBe(judge(30))
    expect(judge(-100)).toBe(judge(100))
    expect(judge(-999)).toBe('miss')
  })
})
