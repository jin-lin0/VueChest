// Onset 试听器：按检测出的**真实起音点**打点，用于校验谱面落点是否踩在音乐上。
//
// 与 Metronome 的本质区别：
//   Metronome  → 固定间隔（BPM 网格），是「尺子」，用来校准 BPM/offset
//   OnsetClicker → 间隔随音乐疏密变化，是「谱面预览」，游戏音符就按这个走
//
// 沿用同样的 lookahead 预调度机制：起音点也必须交给音频线程精确触发，
// 在 rAF 里播会引入 ~16ms 抖动，听起来就像检测不准。

export interface OnsetClickerOptions {
  lookahead?: number
  interval?: number
  volume?: number
}

export class OnsetClicker {
  private ctx: AudioContext
  private lookahead: number
  private interval: number
  private gain: GainNode

  private timer: ReturnType<typeof setInterval> | null = null

  /** 待打点的时间戳（秒，升序） */
  private times: number[] = []
  /** 下一个待调度的下标 */
  private cursor = 0
  private songTimeToCtxTime = 0

  constructor(ctx: AudioContext, options: OnsetClickerOptions = {}) {
    this.ctx = ctx
    this.lookahead = options.lookahead ?? 0.2
    this.interval = options.interval ?? 100

    this.gain = ctx.createGain()
    this.gain.gain.value = options.volume ?? 0.3
    this.gain.connect(ctx.destination)
  }

  set volume(v: number) {
    this.gain.gain.value = v
  }

  /**
   * @param times 起音点时间戳（秒，需升序）
   * @param songTimeAtStart 调用此刻对应的歌曲位置
   * @param outputLatency 输出延迟补偿（秒）
   */
  start(times: number[], songTimeAtStart: number, outputLatency: number) {
    this.stop()
    this.times = times
    this.songTimeToCtxTime = this.ctx.currentTime - songTimeAtStart + outputLatency

    // 二分定位第一个未播放的起音点，避免从头线性扫描
    let lo = 0
    let hi = times.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] < songTimeAtStart) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo

    this.schedule()
    this.timer = setInterval(() => this.schedule(), this.interval)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private schedule() {
    const until = this.ctx.currentTime + this.lookahead
    while (this.cursor < this.times.length) {
      const ctxTime = this.times[this.cursor] + this.songTimeToCtxTime
      if (ctxTime > until) break
      if (ctxTime >= this.ctx.currentTime) this.click(ctxTime)
      this.cursor++
    }
  }

  /**
   * 起音点用短促的高频"嗒"，音色刻意区别于节拍器的正弦"哒"，
   * 这样两者同时开启时能分辨出谁在响。
   */
  private click(when: number) {
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.value = 2600
    osc.connect(env).connect(this.gain)

    const dur = 0.035
    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(1, when + 0.001)
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur)

    osc.start(when)
    osc.stop(when + dur)
  }

  dispose() {
    this.stop()
    this.gain.disconnect()
  }
}
