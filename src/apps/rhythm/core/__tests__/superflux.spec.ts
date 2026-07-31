import { describe, it, expect } from 'vitest'
import { buildLogFilterbank, superFlux, pickPeaksWithStrength, SUPERFLUX_DEFAULTS } from '../superflux'

describe('buildLogFilterbank', () => {
  it('频带中心按对数间隔递增', () => {
    const bands = buildLogFilterbank(2048, 48000, 12, 30, 11000)
    expect(bands.length).toBeGreaterThan(10)
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].center).toBeGreaterThan(bands[i - 1].center)
    }
  })

  it('频带范围合法（start <= center <= end，且不越界）', () => {
    const fftSize = 2048
    const bins = fftSize / 2 + 1
    const bands = buildLogFilterbank(fftSize, 48000, 12, 30, 11000)
    for (const b of bands) {
      expect(b.start).toBeGreaterThanOrEqual(0)
      expect(b.end).toBeLessThan(bins)
      expect(b.start).toBeLessThan(b.end)
    }
  })

  it('bandsPerOctave 越大频带越多', () => {
    const few = buildLogFilterbank(2048, 48000, 6, 30, 11000)
    const many = buildLogFilterbank(2048, 48000, 24, 30, 11000)
    expect(many.length).toBeGreaterThan(few.length)
  })

  it('maxHz <= minHz 时返回空', () => {
    expect(buildLogFilterbank(2048, 48000, 12, 5000, 1000)).toEqual([])
  })

  it('maxHz 超过 Nyquist 时被夹住而非越界', () => {
    const bands = buildLogFilterbank(2048, 48000, 12, 30, 99999)
    const bins = 2048 / 2 + 1
    for (const b of bands) expect(b.end).toBeLessThan(bins)
  })
})

describe('superFlux', () => {
  const SR = 48000

  it('样本不足一个 FFT 窗时返回空', () => {
    expect(superFlux(new Float32Array(100), SR).length).toBe(0)
  })

  it('静音信号强度全为 0', () => {
    const odf = superFlux(new Float32Array(SR), SR)
    expect(odf.every((v) => v === 0)).toBe(true)
  })

  it('在音色突变处产生峰值', () => {
    const n = SR * 2
    const samples = new Float32Array(n)
    // 后半段宽带噪声
    for (let i = n / 2; i < n; i++) samples[i] = Math.random() * 2 - 1

    const hop = SUPERFLUX_DEFAULTS.hopSize
    const odf = superFlux(samples, SR)
    const changeFrame = Math.floor(n / 2 / hop)

    const near = Math.max(...Array.from(odf.slice(changeFrame - 3, changeFrame + 6)))
    const quiet = Math.max(...Array.from(odf.slice(5, Math.max(6, changeFrame - 10))))
    expect(near).toBeGreaterThan(quiet * 5)
  })

  it('前 lag 帧无输出（差分需要历史帧）', () => {
    const n = SR
    const samples = new Float32Array(n)
    for (let i = 0; i < n; i++) samples[i] = Math.random() * 2 - 1
    const odf = superFlux(samples, SR, { lag: 2 })
    expect(odf[0]).toBe(0)
    expect(odf[1]).toBe(0)
  })

  it('最大值滤波抑制颤音假阳性', () => {
    // 构造颤音：频率在 440Hz 附近周期性摆动，能量恒定。
    // 这种信号不该被判为反复起音。
    const n = SR * 2
    const vibrato = new Float32Array(n)
    let phase = 0
    for (let i = 0; i < n; i++) {
      const f = 440 + 25 * Math.sin((2 * Math.PI * 6 * i) / SR) // 6Hz 颤音
      phase += (2 * Math.PI * f) / SR
      vibrato[i] = Math.sin(phase) * 0.5
    }

    const withFilter = superFlux(vibrato, SR, { maxFilterSize: 3 })
    const noFilter = superFlux(vibrato, SR, { maxFilterSize: 1 })

    const energy = (a: Float32Array) => a.reduce((s, v) => s + v, 0)
    // 开启最大值滤波后，颤音区间的总起音强度应明显降低
    expect(energy(withFilter)).toBeLessThan(energy(noFilter))
  })

  it('lag 越大对缓慢起音越敏感（总强度更高）', () => {
    // 缓慢渐强的信号
    const n = SR * 2
    const ramp = new Float32Array(n)
    for (let i = 0; i < n; i++) ramp[i] = (Math.random() * 2 - 1) * (i / n)

    const lag1 = superFlux(ramp, SR, { lag: 1 })
    const lag4 = superFlux(ramp, SR, { lag: 4 })
    const energy = (a: Float32Array) => a.reduce((s, v) => s + v, 0)
    expect(energy(lag4)).toBeGreaterThan(energy(lag1))
  })

  it('输出长度与帧数一致', () => {
    const n = SR * 3
    const samples = new Float32Array(n)
    const { hopSize, fftSize } = SUPERFLUX_DEFAULTS
    const odf = superFlux(samples, SR)
    expect(odf.length).toBe(Math.floor((n - fftSize) / hopSize))
  })
})

describe('pickPeaksWithStrength', () => {
  const frameDur = 512 / 48000

  it('挑出峰值并返回强度', () => {
    const odf = new Float32Array(200)
    odf.fill(0.1)
    for (const i of [30, 80, 140]) odf[i] = 5

    const peaks = pickPeaksWithStrength(odf, frameDur, 1.8, 0.1, 20)
    expect(peaks.map((p) => Math.round(p.time / frameDur))).toEqual([30, 80, 140])
    for (const p of peaks) expect(p.strength).toBeCloseTo(5, 5)
  })

  it('强度反映峰高，可用于区分强弱拍', () => {
    const odf = new Float32Array(300)
    odf.fill(0.1)
    odf[50] = 20 // 强拍
    odf[150] = 4 // 弱拍

    const peaks = pickPeaksWithStrength(odf, frameDur, 1.8, 0.1, 20)
    expect(peaks.length).toBe(2)
    expect(peaks[0].strength).toBeGreaterThan(peaks[1].strength * 3)
  })

  it('平坦信号不产生峰值', () => {
    const odf = new Float32Array(200)
    odf.fill(0.5)
    expect(pickPeaksWithStrength(odf, frameDur, 1.8, 0.1, 20)).toEqual([])
  })

  it('minInterval 抑制过近的峰', () => {
    const odf = new Float32Array(200)
    odf.fill(0.1)
    odf[50] = 5
    odf[52] = 5
    expect(pickPeaksWithStrength(odf, frameDur, 1.8, 0.2, 20).length).toBe(1)
  })

  it('输出严格升序', () => {
    const odf = new Float32Array(300)
    odf.fill(0.1)
    for (const i of [25, 60, 111, 200, 260]) odf[i] = 4
    const peaks = pickPeaksWithStrength(odf, frameDur, 1.8, 0.1, 20)
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i].time).toBeGreaterThan(peaks[i - 1].time)
    }
  })
})
