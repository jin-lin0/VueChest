// 音频分析：解码 → BPM 检测 → 起音点(onset)检测。
//
// 这一层刻意只依赖 Web Audio 的标准类型（AudioBuffer），不碰 DOM、不碰 Vue，
// 便于在 Vitest 里用构造好的 AudioBuffer-like 对象直接测。

import { spectralFlux, pickPeaks } from './spectral'
import { superFlux, SUPERFLUX_DEFAULTS } from './superflux'

/** 谱面生成所需的分析结果 */
export interface AnalyzeResult {
  /** 时长（秒） */
  duration: number
  sampleRate: number
  /** 检测出的速度（已做倍频校正） */
  bpm: number
  /** 校正前的原始检测值，用于对比排查 */
  rawBpm: number
  /** 首拍偏移（秒，已用 onset 相位精修） */
  offset: number
  /** 检测器给出的原始 offset，用于对比排查 */
  rawOffset: number
  /** 起音点时间戳（秒，升序）。用于试听校验与相位精修 */
  onsets: number[]
  /**
   * 起音强度函数（SuperFlux），谱面生成的输入。
   * 保留完整曲线而非只给峰值时间点，是因为网格骨架法需要
   * 在任意网格点上采样强度，而不是只看检测出的峰。
   */
  odf: Float32Array
  /** odf 每帧对应的秒数 */
  odfFrameDuration: number
  /**
   * RMS 能量包络，与 odf 同帧率。用于长按检测。
   *
   * 为什么必须单独给：odf 是**起音**强度，延音期本来就低，
   * 光看它无法区分「延音」（声音还在响）和「静音」。
   * 实测两条曲线相关系数仅 -0.038，确实互补。
   */
  rms: Float32Array
}

/**
 * 把多声道混为单声道（求均值）。
 * 分析只关心能量包络，立体声信息无用且翻倍开销。
 */
export function toMono(buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData'>) {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels === 1) return buffer.getChannelData(0)

  const out = new Float32Array(length)
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) out[i] += data[i]
  }
  for (let i = 0; i < length; i++) out[i] /= numberOfChannels
  return out
}

/**
 * 计算能量包络：按 hopSize 分帧，每帧取 RMS。
 * 返回的数组下标 i 对应时间 i * hopSize / sampleRate。
 */
export function energyEnvelope(samples: Float32Array, hopSize: number): Float32Array {
  const frames = Math.floor(samples.length / hopSize)
  const env = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const start = f * hopSize
    let sum = 0
    for (let i = 0; i < hopSize; i++) {
      const s = samples[start + i]
      sum += s * s
    }
    env[f] = Math.sqrt(sum / hopSize)
  }
  return env
}

export interface OnsetOptions {
  /** 分帧步长（样本数），默认 512 ≈ 10.7ms @48kHz */
  hopSize?: number
  /** 局部均值的窗口半径（帧数） */
  windowRadius?: number
  /** 阈值系数：超过局部均值的多少倍才算起音 */
  threshold?: number
  /** 两次起音的最小间隔（秒），去抖 */
  minInterval?: number
  /** FFT 窗长 */
  fftSize?: number
  /** 谱通量统计的频率范围（Hz） */
  minHz?: number
  maxHz?: number
  /**
   * 检测方式。默认 spectral（谱通量），落点质量明显更好；
   * energy（能量差分）快约 40 倍，仅在需要粗略估算时使用。
   */
  method?: 'spectral' | 'energy'
}

/**
 * 默认参数经真实曲目实测标定（《起风了》325.9s / 48kHz）。
 *
 * 判据是「onset 落在 BPM 网格 ±40ms 内的比例」（对齐率）——
 * 只看密度会自欺欺人：能量差分 th=3.5 密度 3.13/s 看着漂亮，
 * 对齐率却只有 33.8%，意味着 2/3 的音符落在音乐没动静的地方。
 *
 * 方式对比（同为 minInterval 0.2）：
 *   能量差分 th=3.5      密度 3.13/s  对齐率 33.8%
 *   低频<150Hz  th=2.5   密度 3.01/s  对齐率 38.3%
 *   中低150-800 th=2.5   密度 2.06/s  对齐率 63.3%
 *   宽频20-8k   th=2.5   密度 1.03/s  对齐率 75.5%  ← 最准但太稀
 *   宽频20-8k   th=1.8   密度 2.15/s  对齐率 61.3%  ← 采用：密度与准度平衡
 */
const DEFAULT_ONSET_OPTIONS: Required<OnsetOptions> = {
  hopSize: 512,
  windowRadius: 20,
  threshold: 1.8,
  minInterval: 0.2,
  fftSize: 1024,
  minHz: 20,
  maxHz: 8000,
  method: 'spectral',
}

/** 能量包络的正向差分：便宜但对打击起音不敏感 */
function energyFlux(samples: Float32Array, hopSize: number): Float32Array {
  const env = energyEnvelope(samples, hopSize)
  const flux = new Float32Array(env.length)
  for (let i = 1; i < env.length; i++) flux[i] = Math.max(0, env[i] - env[i - 1])
  return flux
}

/**
 * 起音点检测：谱通量（或能量差分）+ 局部自适应阈值 + 峰值挑选。
 */
export function detectOnsets(
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData' | 'sampleRate'>,
  options: OnsetOptions = {},
): number[] {
  const opts = { ...DEFAULT_ONSET_OPTIONS, ...options }
  const { hopSize, windowRadius, threshold, minInterval, method } = opts

  const mono = toMono(buffer)
  const flux =
    method === 'energy'
      ? energyFlux(mono, hopSize)
      : spectralFlux(mono, buffer.sampleRate, {
          hopSize,
          fftSize: opts.fftSize,
          minHz: opts.minHz,
          maxHz: opts.maxHz,
        })

  if (flux.length < 3) return []

  const frameDuration = hopSize / buffer.sampleRate
  return pickPeaks(flux, frameDuration, threshold, minInterval, windowRadius)
}

/** 起点强度函数：倍频消歧用能量差分即可（只看周期性，不需要精确落点） */
function fluxOf(
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData' | 'sampleRate'>,
  hopSize: number,
) {
  return energyFlux(toMono(buffer), hopSize)
}

/**
 * 自相关打分：flux 与自身延迟 lag 帧的相关度。
 * 拍周期上会出现峰值，用来判断某个候选 BPM 的可信度。
 */
function autocorrelationScore(flux: Float32Array, bpm: number, frameDur: number): number {
  const lag = Math.round(60 / bpm / frameDur)
  if (lag < 2 || lag >= flux.length / 2) return 0

  // 只取中段，避开前奏/尾奏的安静片段
  const start = Math.min(flux.length - lag - 1, Math.round(30 / frameDur))
  const end = Math.min(flux.length - lag - 1, Math.round(150 / frameDur))
  if (end <= start) return 0

  let sum = 0
  for (let i = start; i < end; i++) sum += flux[i] * flux[i + lag]
  return sum / (end - start)
}

/**
 * 倍频消歧：BPM 检测常把慢歌判成 2 倍速（如 75 判成 150）。
 *
 * 判据不能是「半速得分接近原速」——等间隔脉冲隔一拍取样天然也对齐，
 * 实测合成信号里 60/120 的得分比可达 0.96，用「接近」会把正确的 120 误降到 60。
 *
 * 真正的信号是：若原速里存在「强拍-弱拍」交替（即真实拍是慢的那层），
 * 半速只命中强拍，得分会**超过**原速。所以要求半速得分严格更高才降。
 *
 * 实测《起风了》：检测值 150 得分 4.53e-4，半速 75 得分 4.36e-4 —— 未超过，
 * 因此代码不会自动降；这类模糊情况交给 UI 上的「½ 速」按钮由人耳裁决。
 */
export function resolveOctave(
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData' | 'sampleRate'>,
  bpm: number,
  hopSize = 512,
  /** 半速得分需达到原速的这个倍数才降（>1 表示必须更优） */
  ratio = 1.05,
): number {
  if (bpm <= 0) return bpm

  const flux = fluxOf(buffer, hopSize)
  const frameDur = hopSize / buffer.sampleRate

  let best = bpm
  let bestScore = autocorrelationScore(flux, bpm, frameDur)

  // 逐层往下试半速（150 → 75 → 37.5），不低于 60 BPM
  for (let candidate = bpm / 2; candidate >= 60; candidate /= 2) {
    const score = autocorrelationScore(flux, candidate, frameDur)
    if (bestScore > 0 && score >= bestScore * ratio) {
      best = candidate
      bestScore = score
    } else break
  }
  return Math.round(best * 10) / 10
}

/**
 * 对齐率：onset 落在 BPM 网格 ±tolerance 秒内的比例（0-100）。
 *
 * 这是衡量 onset 落点质量的关键指标，比密度可靠得多。
 * 经验参考：<40% 说明大量起音是噪声（换气/扫弦），>60% 可用于铺谱。
 */
export function gridAlignment(
  onsets: number[],
  bpm: number,
  offset = 0,
  tolerance = 0.04,
): number {
  if (!onsets.length || bpm <= 0) return 0
  const beat = 60 / bpm
  let hit = 0
  for (const o of onsets) {
    const rel = o - offset
    const phase = ((rel % beat) + beat) % beat
    if (Math.min(phase, beat - phase) <= tolerance) hit++
  }
  return (hit / onsets.length) * 100
}

/**
 * 用 onset 自身反推首拍相位。
 *
 * 为什么需要：web-audio-beat-detector 给出的 offset 常有小误差，
 * 实测《起风了》它给 0.0347s，但 onset 的真实相位接近 0——
 * 这 35ms 的偏差正好卡在 40ms 判定容差边缘，导致对齐率从 61.3% 崩到 21.5%。
 * 谱面全体偏移 35ms 玩家是能感觉到的（Perfect 窗口才 ±40ms）。
 *
 * 做法：把每个 onset 折叠到一个拍周期内，用圆均值求主相位。
 * 用圆均值而非算术均值，是因为相位是环形量——0.01s 和 0.39s
 * （拍长 0.4s）实际上很接近，算术平均会得出错误的 0.2s。
 */
export function refineOffset(onsets: number[], bpm: number, fallback = 0): number {
  if (onsets.length < 8 || bpm <= 0) return fallback
  const beat = 60 / bpm

  let sinSum = 0
  let cosSum = 0
  for (const o of onsets) {
    const angle = (2 * Math.PI * (((o % beat) + beat) % beat)) / beat
    sinSum += Math.sin(angle)
    cosSum += Math.cos(angle)
  }
  // 向量长度过短说明相位分散、无明确拍点，此时不覆盖原值
  const strength = Math.hypot(sinSum, cosSum) / onsets.length
  if (strength < 0.1) return fallback

  let mean = Math.atan2(sinSum, cosSum)
  if (mean < 0) mean += 2 * Math.PI
  return (mean / (2 * Math.PI)) * beat
}

/**
 * 完整分析。BPM 检测委托给 web-audio-beat-detector（动态 import，
 * 避免它进入首屏 chunk），再用自相关做倍频校正、用 onset 反推首拍相位。
 */
export async function analyze(
  buffer: AudioBuffer,
  options: OnsetOptions = {},
): Promise<AnalyzeResult> {
  const onsets = detectOnsets(buffer, options)

  let bpm = 0
  let offset = 0
  try {
    const { guess } = await import('web-audio-beat-detector')
    const result = await guess(buffer)
    bpm = result.bpm
    offset = result.offset
  } catch {
    // 检测失败（曲子太短 / 无明显节拍）时用 onset 中位间隔粗估
    bpm = estimateBpmFromOnsets(onsets)
    offset = onsets[0] ?? 0
  }

  const rawBpm = bpm
  bpm = resolveOctave(buffer, bpm, options.hopSize ?? DEFAULT_ONSET_OPTIONS.hopSize)

  // 用 onset 反推首拍相位，覆盖检测器的 offset（后者常有几十毫秒误差）
  const rawOffset = offset
  offset = refineOffset(onsets, bpm, offset)

  // 计算 SuperFlux 强度曲线供谱面生成使用。
  // 实测其峰值对齐率与朴素谱通量相当（61.1% vs 60.6%），
  // 但对数分带 + 最大值滤波让强度值更能反映「音乐上有多重的一击」，
  // 而谱面生成正是靠强度决定音符分布与双押，因此仍采用它。
  const hopSize = options.hopSize ?? SUPERFLUX_DEFAULTS.hopSize
  const mono = toMono(buffer)
  const odf = superFlux(mono, buffer.sampleRate, { hopSize })
  // 同帧率的 RMS 包络，供长按检测区分「延音」与「静音」
  const rms = energyEnvelope(mono, hopSize)

  return {
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    bpm,
    rawBpm,
    offset,
    rawOffset,
    onsets,
    odf,
    odfFrameDuration: hopSize / buffer.sampleRate,
    rms,
  }
}

/** 用 onset 间隔的中位数粗估 BPM，并折叠到 90-180 区间 */
export function estimateBpmFromOnsets(onsets: number[]): number {
  if (onsets.length < 4) return 0
  const gaps: number[] = []
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i] - onsets[i - 1])
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  if (median <= 0) return 0

  let bpm = 60 / median
  while (bpm < 90) bpm *= 2
  while (bpm > 180) bpm /= 2
  return Math.round(bpm * 10) / 10
}
