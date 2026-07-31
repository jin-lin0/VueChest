// 谱通量（spectral flux）起音点检测函数。
//
// 为什么不用能量差分：能量差分把人声、吉他扫弦、鼓点混成一个数，
// 实测《起风了》onset 落在 BPM 网格上的比例只有 33.8%——
// 大量"起音"其实是换气声和扫弦杂音。谱通量按频率 bin 分别看变化，
// 只累加"变强"的部分，对打击类起音敏感得多，实测对齐率提升到 61.3%。
//
// 代价：需要做 FFT，实测比能量差分慢约 40 倍（1319ms vs 33ms / 325s 音频）。
// 对一次性离线分析可以接受（解码本身就要 2.5s）。

/** 迭代 Cooley-Tukey FFT，预计算旋转因子与位反转表以便复用 */
export class FftAnalyzer {
  readonly size: number
  readonly bins: number

  private rev: Uint32Array
  private cosT: Float32Array
  private sinT: Float32Array
  private window: Float32Array
  private re: Float32Array
  private im: Float32Array

  constructor(size = 1024) {
    if ((size & (size - 1)) !== 0) throw new Error('FFT size must be a power of 2')
    this.size = size
    this.bins = size / 2 + 1

    // 位反转置换表
    this.rev = new Uint32Array(size)
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      this.rev[i] = j
    }

    // 旋转因子
    this.cosT = new Float32Array(size / 2)
    this.sinT = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cosT[i] = Math.cos((-2 * Math.PI * i) / size)
      this.sinT[i] = Math.sin((-2 * Math.PI * i) / size)
    }

    // Hann 窗：减少分帧造成的频谱泄漏
    this.window = new Float32Array(size)
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
    }

    this.re = new Float32Array(size)
    this.im = new Float32Array(size)
  }

  /** 计算 samples[offset .. offset+size) 的幅度谱，写入 out（长度需 >= bins） */
  magnitude(samples: Float32Array, offset: number, out: Float32Array) {
    const { size, rev, cosT, sinT, window, re, im } = this

    for (let i = 0; i < size; i++) {
      re[rev[i]] = samples[offset + i] * window[i]
      im[rev[i]] = 0
    }

    for (let len = 2; len <= size; len <<= 1) {
      const step = size / len
      const half = len >> 1
      for (let i = 0; i < size; i += len) {
        for (let k = 0; k < half; k++) {
          const tw = k * step
          const c = cosT[tw]
          const s = sinT[tw]
          const a = i + k
          const b = a + half
          const tr = re[b] * c - im[b] * s
          const ti = re[b] * s + im[b] * c
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }

    for (let i = 0; i < this.bins; i++) out[i] = Math.hypot(re[i], im[i])
  }
}

export interface SpectralFluxOptions {
  hopSize?: number
  fftSize?: number
  /** 统计的频率下限（Hz） */
  minHz?: number
  /** 统计的频率上限（Hz）。8kHz 以上多是齿音/底噪，无助于找拍 */
  maxHz?: number
}

/**
 * 计算谱通量序列：逐帧比较频谱，只累加变强的 bin。
 * 返回数组下标 i 对应时间 i * hopSize / sampleRate。
 *
 * 频段默认 20Hz-8kHz，实测该宽频段优于只取低频（kick）：
 * 低频<150Hz 对齐率仅 27-38%，宽频 20-8kHz 达 61-75%。
 * 原因是慢歌的鼓点能量分散，且吉他/钢琴的击弦瞬态也是有效节奏信息。
 */
export function spectralFlux(
  samples: Float32Array,
  sampleRate: number,
  options: SpectralFluxOptions = {},
): Float32Array {
  const { hopSize = 512, fftSize = 1024, minHz = 20, maxHz = 8000 } = options

  const frames = Math.max(0, Math.floor((samples.length - fftSize) / hopSize))
  const flux = new Float32Array(frames)
  if (frames === 0) return flux

  const fft = new FftAnalyzer(fftSize)
  const { bins } = fft
  const nyquist = sampleRate / 2
  const loBin = Math.max(0, Math.round((minHz / nyquist) * (bins - 1)))
  const hiBin = Math.min(bins - 1, Math.round((maxHz / nyquist) * (bins - 1)))

  // 只保留前一帧频谱并轮换缓冲，避免缓存整首歌的频谱（325s 音频约 30548 帧）
  let prev = new Float32Array(bins)
  let cur = new Float32Array(bins)

  for (let f = 0; f < frames; f++) {
    fft.magnitude(samples, f * hopSize, cur)
    if (f > 0) {
      let sum = 0
      for (let b = loBin; b <= hiBin; b++) {
        const d = cur[b] - prev[b]
        if (d > 0) sum += d
      }
      flux[f] = sum
    }
    const swap = prev
    prev = cur
    cur = swap
  }

  return flux
}

/**
 * 自适应峰值挑选：局部极大 + 超过局部均值的 threshold 倍 + 最小间隔去抖。
 *
 * 用局部均值而非全局阈值，是为了适应有强弱段落的曲子
 * （安静段的鼓点绝对能量低，但相对周围仍是峰值）。
 */
export function pickPeaks(
  flux: Float32Array,
  frameDuration: number,
  threshold: number,
  minInterval: number,
  windowRadius: number,
): number[] {
  const minGap = Math.max(1, Math.round(minInterval / frameDuration))
  const out: number[] = []
  let lastPeak = -Infinity

  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue

    const from = Math.max(0, i - windowRadius)
    const to = Math.min(flux.length, i + windowRadius + 1)
    let sum = 0
    for (let j = from; j < to; j++) sum += flux[j]
    const localMean = sum / (to - from)

    if (localMean <= 0 || flux[i] < localMean * threshold) continue
    if (i - lastPeak < minGap) continue

    lastPeak = i
    out.push(i * frameDuration)
  }

  return out
}
