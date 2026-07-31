import { describe, it, expect } from 'vitest'
import { FftAnalyzer, spectralFlux, pickPeaks } from '../spectral'

describe('FftAnalyzer', () => {
  it('拒绝非 2 的幂的窗长', () => {
    expect(() => new FftAnalyzer(1000)).toThrow(/power of 2/)
  })

  it('正确定位单频正弦的频率 bin', () => {
    const size = 1024
    const sr = 48000
    const freq = 3000
    const fft = new FftAnalyzer(size)

    const samples = new Float32Array(size)
    for (let i = 0; i < size; i++) samples[i] = Math.sin((2 * Math.PI * freq * i) / sr)

    const mag = new Float32Array(fft.bins)
    fft.magnitude(samples, 0, mag)

    // 找幅度最大的 bin，应对应 3000Hz
    let peak = 0
    for (let i = 1; i < fft.bins; i++) if (mag[i] > mag[peak]) peak = i
    const peakHz = (peak / (fft.bins - 1)) * (sr / 2)
    expect(peakHz).toBeCloseTo(freq, -2) // 容差受 bin 分辨率限制（~47Hz）
  })

  it('静音输入的幅度谱全为 0', () => {
    const fft = new FftAnalyzer(256)
    const mag = new Float32Array(fft.bins)
    fft.magnitude(new Float32Array(256), 0, mag)
    expect(mag.every((v) => v === 0)).toBe(true)
  })
})

describe('spectralFlux', () => {
  it('样本不足一个 FFT 窗时返回空', () => {
    expect(spectralFlux(new Float32Array(100), 48000, { fftSize: 1024 }).length).toBe(0)
  })

  it('静音信号通量为 0', () => {
    const flux = spectralFlux(new Float32Array(48000), 48000)
    expect(flux.every((v) => v === 0)).toBe(true)
  })

  it('在音色突变处产生峰值', () => {
    const sr = 48000
    const n = sr * 2
    const samples = new Float32Array(n)
    // 前半段静音，后半段宽带噪声 —— 交界处应出现明显通量峰
    for (let i = n / 2; i < n; i++) samples[i] = Math.random() * 2 - 1

    const hop = 512
    const flux = spectralFlux(samples, sr, { hopSize: hop })
    const changeFrame = Math.floor(n / 2 / hop)

    // 交界附近的通量应远大于纯静音段
    const nearChange = Math.max(...Array.from(flux.slice(changeFrame - 2, changeFrame + 3)))
    const quiet = Math.max(...Array.from(flux.slice(5, changeFrame - 5)))
    expect(nearChange).toBeGreaterThan(quiet * 10)
  })

  it('频段限制生效：只统计指定范围', () => {
    const sr = 48000
    const n = sr
    // 6kHz 正弦突然出现
    const samples = new Float32Array(n)
    for (let i = n / 2; i < n; i++) samples[i] = Math.sin((2 * Math.PI * 6000 * i) / sr)

    const inBand = spectralFlux(samples, sr, { minHz: 20, maxHz: 8000 })
    const outBand = spectralFlux(samples, sr, { minHz: 20, maxHz: 1000 })

    const peak = (a: Float32Array) => Math.max(...Array.from(a))
    // 6kHz 落在 20-8k 内、不在 20-1k 内，故前者峰值应显著更大
    expect(peak(inBand)).toBeGreaterThan(peak(outBand) * 5)
  })
})

describe('pickPeaks', () => {
  const frameDur = 512 / 48000

  it('挑出显著的局部峰值', () => {
    const flux = new Float32Array(200)
    flux.fill(0.1)
    // 三个远高于背景的尖峰
    for (const i of [30, 80, 140]) flux[i] = 5

    const peaks = pickPeaks(flux, frameDur, 1.8, 0.1, 20)
    const frames = peaks.map((t) => Math.round(t / frameDur))
    expect(frames).toEqual([30, 80, 140])
  })

  it('平坦信号不产生峰值', () => {
    const flux = new Float32Array(200)
    flux.fill(0.5)
    expect(pickPeaks(flux, frameDur, 1.8, 0.1, 20)).toEqual([])
  })

  it('minInterval 抑制过近的峰', () => {
    const flux = new Float32Array(200)
    flux.fill(0.1)
    // 相邻仅 2 帧（~21ms）的两个峰
    flux[50] = 5
    flux[52] = 5

    const peaks = pickPeaks(flux, frameDur, 1.8, 0.2, 20)
    expect(peaks.length).toBe(1)
  })

  it('threshold 越高挑出的峰越少', () => {
    const flux = new Float32Array(400)
    for (let i = 0; i < 400; i++) flux[i] = 0.1
    // 强弱不同的峰交替
    for (let i = 20; i < 400; i += 20) flux[i] = i % 40 === 0 ? 5 : 0.4

    const loose = pickPeaks(flux, frameDur, 1.5, 0.05, 20)
    const strict = pickPeaks(flux, frameDur, 3.0, 0.05, 20)
    expect(strict.length).toBeLessThan(loose.length)
  })

  it('输出严格升序', () => {
    const flux = new Float32Array(300)
    flux.fill(0.1)
    for (const i of [25, 60, 111, 200, 260]) flux[i] = 4

    const peaks = pickPeaks(flux, frameDur, 1.8, 0.1, 20)
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]).toBeGreaterThan(peaks[i - 1])
    }
  })
})
