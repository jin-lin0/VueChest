// 音频时钟：音游的时间基准。
//
// 设计要点（这是音游成立的前提，不能用 Date.now / rAF 计数代替）：
// 1. 唯一真相是 AudioContext.currentTime —— 它由音频硬件驱动，不会因掉帧漂移。
// 2. 播放位置 = ctx.currentTime - startedAt，其中 startedAt 是 start() 时刻的 currentTime。
// 3. 出声比调度晚 (baseLatency + outputLatency)，判定时间必须减掉，否则玩家「听到」时
//    逻辑时间已经跑过头了 —— 蓝牙耳机上这个值可达 150ms+，不补偿手感直接崩。
// 4. userOffset 供玩家手动微调（业界所有音游都有这个设置项）。

export interface AudioClockOptions {
  /** 玩家手动校准偏移（毫秒）。正值 = 判定时间往后推 */
  userOffset?: number
}

export class AudioClock {
  private ctx: AudioContext
  private buffer: AudioBuffer
  private source: AudioBufferSourceNode | null = null

  /** start() 时记录的 ctx.currentTime */
  private startedAt = 0
  /** 暂停时保留的播放位置 */
  private pausedAt = 0
  private playing = false

  /** 玩家手动校准（秒） */
  userOffset: number

  constructor(ctx: AudioContext, buffer: AudioBuffer, options: AudioClockOptions = {}) {
    this.ctx = ctx
    this.buffer = buffer
    this.userOffset = (options.userOffset ?? 0) / 1000
  }

  /** 系统输出延迟（秒）：从调度到真正出声的时间 */
  get outputLatency(): number {
    // outputLatency 在部分浏览器缺失，baseLatency 兜底
    const base = this.ctx.baseLatency || 0
    const output = this.ctx.outputLatency || 0
    return base + output
  }

  /**
   * 用于判定和渲染的当前时间（秒）——即「玩家此刻正听到的音乐位置」。
   * 这才是 note 判定应该对齐的时间轴。
   */
  get currentTime(): number {
    if (!this.playing) return this.pausedAt
    const raw = this.ctx.currentTime - this.startedAt
    return raw - this.outputLatency + this.userOffset
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get duration(): number {
    return this.buffer.duration
  }

  /**
   * 开始播放。
   *
   * @param from 从歌曲的哪个位置起播（秒）
   * @param delay 延迟多久才真正出声（秒），用于开局 lead-in。
   *
   * lead-in 的实现要点：不是「等 delay 秒再调用 start()」，而是
   * 把音源调度到未来的 `when` 时刻，同时把 startedAt 也设到 when。
   * 于是 currentTime 在这段时间内是**负值**，游戏时间轴天然向前延伸出
   * 一段准备期——音符可以照常从屏幕顶端落下，判定逻辑无需任何特判。
   * 用 setTimeout 延迟启动则做不到这点：那会让音符在准备期内静止不动。
   */
  start(from = 0, delay = 0) {
    this.stop()

    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.ctx.destination)

    const when = this.ctx.currentTime + Math.max(0, delay)
    source.start(when, from)
    this.startedAt = when - from
    this.pausedAt = from
    this.playing = true
    this.source = source

    source.onended = () => {
      // 只有自然播完才复位；stop() 里会先摘掉回调避免误触
      if (this.source === source) {
        this.playing = false
        this.pausedAt = this.buffer.duration
      }
    }
  }

  pause() {
    if (!this.playing) return
    const pos = this.ctx.currentTime - this.startedAt
    this.stop()
    // clamp 下界到 0：lead-in 期间 pos 是负的，直接存进去会让
    // 恢复播放时从负位置起播
    this.pausedAt = Math.min(Math.max(0, pos), this.buffer.duration)
  }

  stop() {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        // 已经停止过，忽略
      }
      this.source.disconnect()
      this.source = null
    }
    this.playing = false
  }
}

/** 判定等级 */
export type Judgement = 'perfect' | 'great' | 'good' | 'miss'

/** 判定窗口（毫秒） */
export const JUDGE_WINDOWS = {
  perfect: 40,
  great: 80,
  good: 130,
} as const

/**
 * 纯函数判定：给定时间差（毫秒，可正可负）返回等级。
 * 抽成纯函数是为了能直接单测，不需要真实 AudioContext。
 */
export function judge(deltaMs: number): Judgement {
  const abs = Math.abs(deltaMs)
  if (abs <= JUDGE_WINDOWS.perfect) return 'perfect'
  if (abs <= JUDGE_WINDOWS.great) return 'great'
  if (abs <= JUDGE_WINDOWS.good) return 'good'
  return 'miss'
}
