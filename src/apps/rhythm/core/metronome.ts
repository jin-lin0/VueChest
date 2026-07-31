// 可听节拍器：在音乐上叠加"哒"声，用于校验 BPM/offset 是否正确。
//
// 核心设计：节拍音必须用 Web Audio 的 source.start(when) **提前调度**，
// 由音频线程精确触发。绝不能在 requestAnimationFrame 里"到点了就播"——
// rAF 精度只有 ~16ms 且会掉帧，那样打出来的点自己就是歪的，
// 反而让人误以为 BPM 检测错了。
//
// 调度采用「lookahead 窗口 + 定时补充」的经典模式：
// 每 100ms 检查一次，把未来 200ms 内的拍子提前排进音频线程。

export interface MetronomeOptions {
  /** 提前调度多久的拍子（秒） */
  lookahead?: number
  /** 补充调度的检查间隔（毫秒） */
  interval?: number
  /** 音量 0-1 */
  volume?: number
}

export class Metronome {
  private ctx: AudioContext
  private lookahead: number
  private interval: number
  private gain: GainNode

  private timer: ReturnType<typeof setInterval> | null = null

  /** 拍长（秒） */
  private beatDur = 0.5
  /** 首拍在歌曲时间轴上的位置（秒） */
  private offset = 0
  /** 每小节拍数，用于给重音 */
  private beatsPerBar = 4

  /** 下一个待调度的拍序号 */
  private nextBeat = 0
  /** 歌曲时间 → ctx.currentTime 的换算基准 */
  private songTimeToCtxTime = 0

  constructor(ctx: AudioContext, options: MetronomeOptions = {}) {
    this.ctx = ctx
    this.lookahead = options.lookahead ?? 0.2
    this.interval = options.interval ?? 100

    this.gain = ctx.createGain()
    this.gain.gain.value = options.volume ?? 0.35
    this.gain.connect(ctx.destination)
  }

  set volume(v: number) {
    this.gain.gain.value = v
  }

  /**
   * 启动节拍器。
   * @param bpm 速度
   * @param offset 首拍在歌曲时间轴上的秒数
   * @param songTimeAtStart 调用此刻对应的歌曲位置（秒）
   * @param outputLatency 输出延迟补偿（秒）
   */
  start(bpm: number, offset: number, songTimeAtStart: number, outputLatency: number) {
    this.stop()
    if (bpm <= 0) return

    this.beatDur = 60 / bpm
    this.offset = offset

    // 建立歌曲时间与音频上下文时间的对应关系。
    // 加回 outputLatency：节拍音也要经过同样的输出延迟才出声，
    // 这样它和音乐才会同时到达耳朵。
    this.songTimeToCtxTime = this.ctx.currentTime - songTimeAtStart + outputLatency

    // 从当前位置的下一拍开始，别把已经过去的拍子补播出来
    const elapsed = songTimeAtStart - this.offset
    this.nextBeat = elapsed < 0 ? 0 : Math.ceil(elapsed / this.beatDur)

    this.schedule()
    this.timer = setInterval(() => this.schedule(), this.interval)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 把 lookahead 窗口内的拍子排入音频线程 */
  private schedule() {
    const until = this.ctx.currentTime + this.lookahead
    // 上限防护：BPM 异常小时避免死循环
    let guard = 0
    while (guard++ < 64) {
      const songTime = this.offset + this.nextBeat * this.beatDur
      const ctxTime = songTime + this.songTimeToCtxTime
      if (ctxTime > until) break

      // 已经错过的拍子直接跳过，不补播
      if (ctxTime >= this.ctx.currentTime) {
        this.click(ctxTime, this.nextBeat % this.beatsPerBar === 0)
      }
      this.nextBeat++
    }
  }

  /**
   * 合成一声"哒"。用短促的正弦 + 快速衰减包络，
   * 比方波/噪声更容易在音乐里分辨出位置。
   */
  private click(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()

    osc.frequency.value = accent ? 1600 : 1000
    osc.connect(env).connect(this.gain)

    const dur = 0.05
    // 用指数衰减模拟打击音，起音要陡（0.001s）否则听起来发闷
    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(accent ? 1 : 0.6, when + 0.001)
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur)

    osc.start(when)
    osc.stop(when + dur)
  }

  dispose() {
    this.stop()
    this.gain.disconnect()
  }
}
