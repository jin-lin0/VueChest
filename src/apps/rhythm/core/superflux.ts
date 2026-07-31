// SuperFlux 起音点检测（Böck & Widmer, DAFx-13）。
//
// 相比朴素谱通量的三项关键改进：
//   1. 对数频率滤波器组 —— 按人耳感知均匀分带，低频分辨率高、高频合并，
//      避免高频 bin 数量占优导致齿音/底噪主导通量。
//   2. 最大值滤波（沿频率轴取邻域最大） —— 抑制颤音/滑音造成的假阳性。
//      原论文实测假阳性减少最多 60%，且不漏掉真实起音。
//   3. lag=2 帧差分 —— 与「前 2 帧」比较而非相邻帧，对缓慢起音（弓弦、人声）
//      更敏感，也进一步降噪。
//
// 论文参数：hop=1/200s、24 bands/octave、30Hz-17kHz、max_size=3、lag=2。
// 我们按浏览器算力做了折衷（见 SUPERFLUX_DEFAULTS 注释）。

import { FftAnalyzer } from './spectral'

export interface SuperFluxOptions {
  hopSize?: number
  fftSize?: number
  /** 每八度的频带数。论文用 24，越大越精细也越慢 */
  bandsPerOctave?: number
  minHz?: number
  maxHz?: number
  /** 最大值滤波的频带邻域宽度（奇数）。3 = 当前带 ± 1 */
  maxFilterSize?: number
  /** 差分的帧间隔。论文用 2 */
  lag?: number
}

export const SUPERFLUX_DEFAULTS: Required<SuperFluxOptions> = {
  hopSize: 512,
  fftSize: 2048, // 比朴素版的 1024 大：对数分带需要更好的低频分辨率
  bandsPerOctave: 12, // 论文 24；12 已足够且省一半计算
  minHz: 30,
  maxHz: 11000,
  maxFilterSize: 3,
  lag: 2,
}

/**
 * 构造对数间隔的三角滤波器组。
 * 返回每个频带的 [起始 bin, 结束 bin, 中心 bin]，用于把线性 FFT bin 聚合成感知频带。
 */
export function buildLogFilterbank(
  fftSize: number,
  sampleRate: number,
  bandsPerOctave: number,
  minHz: number,
  maxHz: number,
): { start: number; center: number; end: number }[] {
  const bins = fftSize / 2 + 1
  const nyquist = sampleRate / 2
  const hzToBin = (hz: number) => (hz / nyquist) * (bins - 1)

  const top = Math.min(maxHz, nyquist * 0.999)
  if (top <= minHz) return []

  // 对数间隔的中心频率
  const octaves = Math.log2(top / minHz)
  const count = Math.max(1, Math.floor(octaves * bandsPerOctave))

  const centers: number[] = []
  for (let i = 0; i <= count; i++) {
    centers.push(minHz * Math.pow(2, i / bandsPerOctave))
  }

  const bands: { start: number; center: number; end: number }[] = []
  for (let i = 1; i < centers.length - 1; i++) {
    const start = Math.floor(hzToBin(centers[i - 1]))
    const center = Math.round(hzToBin(centers[i]))
    const end = Math.ceil(hzToBin(centers[i + 1]))
    // 频带太窄（低频处相邻中心落在同一 bin）时跳过，避免重复计算
    if (end <= start || center >= bins) continue
    if (bands.length && bands[bands.length - 1].center === center) continue
    bands.push({ start: Math.max(0, start), center, end: Math.min(bins - 1, end) })
  }
  return bands
}

/**
 * 计算 SuperFlux 起音强度函数。
 * 返回数组下标 i 对应时间 i * hopSize / sampleRate。
 */
export function superFlux(
  samples: Float32Array,
  sampleRate: number,
  options: SuperFluxOptions = {},
): Float32Array {
  const opts = { ...SUPERFLUX_DEFAULTS, ...options }
  const { hopSize, fftSize, bandsPerOctave, minHz, maxHz, maxFilterSize, lag } = opts

  const frames = Math.max(0, Math.floor((samples.length - fftSize) / hopSize))
  const odf = new Float32Array(frames)
  if (frames === 0) return odf

  const bands = buildLogFilterbank(fftSize, sampleRate, bandsPerOctave, minHz, maxHz)
  if (!bands.length) return odf

  const fft = new FftAnalyzer(fftSize)
  const mag = new Float32Array(fft.bins)
  const nBands = bands.length

  // 环形缓冲保存最近 lag+1 帧的「最大值滤波后」频带能量，
  // 避免缓存整首歌（长音频会吃掉几百 MB）
  const ring: Float32Array[] = Array.from({ length: lag + 1 }, () => new Float32Array(nBands))
  const bandEnergy = new Float32Array(nBands)
  const maxFiltered = new Float32Array(nBands)
  const half = Math.floor(maxFilterSize / 2)

  for (let f = 0; f < frames; f++) {
    fft.magnitude(samples, f * hopSize, mag)

    // 三角加权聚合到对数频带，再取对数压缩动态范围
    for (let b = 0; b < nBands; b++) {
      const { start, center, end } = bands[b]
      let sum = 0
      for (let k = start; k <= end; k++) {
        // 三角窗：中心权重 1，两端衰减到 0
        const w = k <= center ? (center > start ? (k - start) / (center - start) : 1) : end > center ? (end - k) / (end - center) : 1
        sum += mag[k] * w
      }
      // log 压缩：让弱起音也能被局部阈值捕捉，同时压制强拍的绝对优势
      bandEnergy[b] = Math.log10(1 + sum)
    }

    // 沿频率轴最大值滤波 —— SuperFlux 的核心。
    // 颤音会让能量在相邻频带间来回移动，取邻域最大后这种移动不再产生正差分。
    for (let b = 0; b < nBands; b++) {
      let m = bandEnergy[b]
      const lo = Math.max(0, b - half)
      const hi = Math.min(nBands - 1, b + half)
      for (let k = lo; k <= hi; k++) if (bandEnergy[k] > m) m = bandEnergy[k]
      maxFiltered[b] = m
    }

    // 与 lag 帧之前比较：当前帧原始能量 vs 历史帧最大值滤波后的能量
    if (f >= lag) {
      const past = ring[(f - lag) % (lag + 1)]
      let sum = 0
      for (let b = 0; b < nBands; b++) {
        const d = bandEnergy[b] - past[b]
        if (d > 0) sum += d
      }
      odf[f] = sum
    }

    ring[f % (lag + 1)].set(maxFiltered)
  }

  return odf
}

/**
 * SuperFlux 论文的三条件峰值挑选 + 强度输出。
 *
 * 与朴素版的关键差异：返回强度值。谱面生成需要它来决定
 * 「哪些位置该出双押（同时按两键）」——强拍出和弦，弱拍出单键。
 */
export interface OnsetWithStrength {
  time: number
  /** 该峰的起音强度（odf 值） */
  strength: number
}

export function pickPeaksWithStrength(
  odf: Float32Array,
  frameDuration: number,
  threshold: number,
  minInterval: number,
  windowRadius: number,
): OnsetWithStrength[] {
  const minGap = Math.max(1, Math.round(minInterval / frameDuration))
  const out: OnsetWithStrength[] = []
  let lastPeak = -Infinity

  for (let i = 1; i < odf.length - 1; i++) {
    if (odf[i] <= odf[i - 1] || odf[i] < odf[i + 1]) continue

    const from = Math.max(0, i - windowRadius)
    const to = Math.min(odf.length, i + windowRadius + 1)
    let sum = 0
    for (let j = from; j < to; j++) sum += odf[j]
    const localMean = sum / (to - from)

    if (localMean <= 0 || odf[i] < localMean * threshold) continue
    if (i - lastPeak < minGap) continue

    lastPeak = i
    out.push({ time: i * frameDuration, strength: odf[i] })
  }

  return out
}
