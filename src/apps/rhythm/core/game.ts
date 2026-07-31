// 游戏循环：串联音频时钟、输入、判定、渲染。
//
// 时间来源只有一个：AudioClock.currentTime（由音频硬件驱动）。
// requestAnimationFrame 只用来「触发重绘」，绝不用来推进游戏时间——
// 这是上一轮实测确认过的：音频时钟 3 秒漂移 0.03ms，rAF 不可信。

import { AudioClock } from './clock'
import type { Judgement } from './clock'
import { JudgeEngine, type JudgeStats } from './judge-engine'
import { Renderer, DEFAULT_APPROACH_TIME } from './renderer'
import { noteEndTime, type Beatmap } from './beatmap'

export interface GameCallbacks {
  /** 每次判定（含 miss）时回调，用于 UI 更新与音效 */
  onJudge?: (judgement: Judgement, stats: Readonly<JudgeStats>) => void
  /** 每帧回调，用于同步进度条等 */
  onFrame?: (currentTime: number, stats: Readonly<JudgeStats>) => void
  /** 歌曲结束或全部判定完毕 */
  onFinish?: (stats: Readonly<JudgeStats>) => void
  /** 切后台自动暂停时回调，参数是暂停位置（秒） */
  onPause?: (at: number) => void
  /** 从暂停恢复时回调，参数是恢复起播位置（秒） */
  onResume?: (from: number) => void
}

export interface GameOptions {
  /** 键位映射，下标 = 轨道号 */
  keys?: string[]
  /** 玩家延迟校准（毫秒），正值 = 判定时间往后推 */
  userOffset?: number
  /** 音符下落时间（秒） */
  approachTime?: number
  /**
   * 击打音效音量，0 = 关闭（默认关闭）。
   *
   * 为什么默认关：这是个 1800Hz 方波，音色和音乐完全无关，密谱下
   * 每秒响好几次，盖过音乐本身。音游的听觉焦点应该是**音乐**，
   * 打击反馈交给视觉（光爆 + 轨道高亮 + 判定文字）已经足够。
   */
  hitSoundVolume?: number
  /**
   * 开局准备时间（秒）：音乐延迟这么久才起播，游戏时间从 -leadIn 开始走。
   *
   * 为什么必须有：不给准备时间的话，歌曲 0~approachTime 秒内的音符
   * 在点「开始」的瞬间就已经在屏幕中段甚至越过判定线了，玩家来不及反应。
   *
   * 默认取值见 DEFAULT_LEAD_IN。
   */
  leadIn?: number
}

const DEFAULT_KEYS = ['d', 'f', 'j', 'k']

/**
 * 默认准备时间（秒）。
 *
 * 拆成两部分：
 *   - approachTime：让第一个音符能完整走完整个下落行程，而不是半空冒出来
 *   - 额外 1.2s：人的简单反应时间约 0.2s，加上「看清轨道、手指就位」
 *     的准备动作，1.2s 是主流音游的常见量级（osu! 约 1.5s，maimai 约 1s）
 *
 * 实现上真正的时长是 approachTime + PREP_TIME，见 Game.start()。
 */
export const PREP_TIME = 1.2

/**
 * 打完最后一个音符后再等这么久才跳结算（秒）。
 *
 * 留缓冲的原因：最后一击的打击特效、combo 数字、判定文字都需要时间演完，
 * 立刻切黑屏会让人觉得"最后一下没打中"。主流音游同样有约 1~2 秒的收尾。
 */
export const OUTRO_TAIL = 1.8

/**
 * 从暂停恢复时往回退的秒数。
 *
 * 切回来时玩家的注意力不在游戏上，原地续播等于又一次「没准备好就掉落」。
 * 退回一点再配合完整的准备期，能重新建立节奏感。
 */
export const RESUME_REWIND = 1.5

/**
 * 单帧时间跳变的容忍上限（秒）。
 *
 * 超过这个值说明发生了异常（rAF 被冻结、主线程长阻塞、断点调试），
 * 不能按正常帧处理——否则 JudgeEngine.update 会把跳过的整段音符
 * 全部判成 miss。实测切后台 5 秒会一次性凭空丢 10 个 combo。
 * 取 0.5s：正常掉帧（哪怕跌到 5fps 也才 0.2s）不会误触。
 */
export const MAX_TIME_STEP = 0.5

export class Game {
  private ctxAudio: AudioContext
  private clock: AudioClock
  private engine: JudgeEngine
  private renderer: Renderer
  private callbacks: GameCallbacks

  private keys: string[]
  private hitSoundGain: GainNode | null = null
  /** 本局实际使用的准备时间（秒） */
  private leadIn: number
  /** 谱面最后一个音符的时间（秒），用于判断收尾时机 */
  private lastNoteTime: number

  private rafId = 0
  private running = false
  private finished = false

  /** 记录物理按键是否已按下，用于屏蔽操作系统的自动重复 */
  private keyDown = new Set<string>()

  private keyHandler: (e: KeyboardEvent) => void
  private keyUpHandler: (e: KeyboardEvent) => void
  private resizeHandler: () => void
  private visibilityHandler: () => void

  /** 上一帧的游戏时间，用于检测时间跳变（切后台） */
  private lastTickTime = -Infinity
  /** 是否因切后台而自动暂停 */
  private autoPaused = false

  constructor(
    audioCtx: AudioContext,
    audioBuffer: AudioBuffer,
    map: Beatmap,
    canvas: HTMLCanvasElement,
    callbacks: GameCallbacks = {},
    options: GameOptions = {},
  ) {
    this.ctxAudio = audioCtx
    this.callbacks = callbacks
    this.keys = options.keys ?? DEFAULT_KEYS

    this.clock = new AudioClock(audioCtx, audioBuffer, { userOffset: options.userOffset ?? 0 })
    this.engine = new JudgeEngine(map)
    this.renderer = new Renderer(canvas, map, { approachTime: options.approachTime })

    // 准备时间要包含完整的下落行程，否则第一个音符会在半空中冒出来。
    // 这里的默认值必须和 Renderer 用的同一个常量，否则倒计时长度
    // 会和音符实际下落时间对不上
    const approach = options.approachTime ?? DEFAULT_APPROACH_TIME
    this.leadIn = options.leadIn ?? approach + PREP_TIME
    // 用尾端而非起始时间：长按的最后一条可能还要按 1.4 秒，
    // 按起始时间算收尾会在玩家还按着的时候就跳结算
    this.lastNoteTime = map.notes.length ? Math.max(...map.notes.map((n) => noteEndTime(n))) : 0

    // 默认 0：不发出击打音，别干扰听音乐（见 GameOptions.hitSoundVolume）
    const vol = options.hitSoundVolume ?? 0
    if (vol > 0) {
      this.hitSoundGain = audioCtx.createGain()
      this.hitSoundGain.gain.value = vol
      this.hitSoundGain.connect(audioCtx.destination)
    }

    this.keyHandler = (e) => this.onKeyDown(e)
    this.keyUpHandler = (e) => this.onKeyUp(e)
    this.resizeHandler = () => this.renderer.resize()
    this.visibilityHandler = () => {
      if (typeof document !== 'undefined' && document.hidden) this.autoPause()
    }
  }

  get stats() {
    return this.engine.getStats()
  }

  get accuracy() {
    return this.engine.accuracy
  }

  get duration() {
    return this.clock.duration
  }

  get currentTime() {
    return this.clock.currentTime
  }

  /**
   * 开局倒计时剩余秒数；已进入正式演奏则为 0。
   * UI 可以据此显示「3 / 2 / 1 / GO」。
   */
  get countdown() {
    const t = this.clock.currentTime
    return t < 0 ? -t : 0
  }

  /** 是否处于（自动）暂停状态 */
  get paused() {
    return this.autoPaused
  }

  /**
   * 跑道几何信息，供 DOM 层（底部键位胶囊、触屏热区）对齐 Canvas 轨道。
   * 转发 Renderer 的计算结果，让 Canvas 成为布局的唯一真相。
   */
  get stageMetrics() {
    return this.renderer.stageMetrics
  }

  async start() {
    if (this.running) return
    await this.ctxAudio.resume()

    window.addEventListener('keydown', this.keyHandler)
    window.addEventListener('keyup', this.keyUpHandler)
    window.addEventListener('resize', this.resizeHandler)
    // 切后台必须暂停：rAF 被浏览器冻结但音频时钟照走，
    // 回来时一次 tick 会把这期间所有音符批量判成 miss（实测切 5 秒丢 10+ combo）。
    // typeof 守卫：非浏览器环境（单测、SSR）没有 document
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }

    this.renderer.resize()
    this.running = true
    this.finished = false
    this.autoPaused = false
    this.lastTickTime = -Infinity
    // 延迟起播：游戏时间从 -leadIn 开始，音符在准备期内正常下落
    this.clock.start(0, this.leadIn)
    this.loop()
  }

  /**
   * 切后台时自动暂停。
   *
   * 只暂停音乐并停掉循环，不重置进度——回来后 resume() 会带一段
   * 重新进入的准备时间，让玩家重新找到节奏。
   */
  private autoPause() {
    if (!this.running || this.autoPaused || this.finished) return
    this.autoPaused = true
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.clock.pause()
    // 松开所有按键状态，否则回来时轨道还亮着。
    // 进行中的长按也要一并作废：切后台期间手指状态不可知，
    // 既不能算成功也不该算失败，交给 skipTo 记为 skipped。
    this.keyDown.clear()
    for (let i = 0; i < this.keys.length; i++) this.renderer.setPressed(i, false)
    this.engine.abandonHolds()
    this.callbacks.onPause?.(this.clock.currentTime)
  }

  /**
   * 从暂停恢复。
   *
   * 会往回退一点并重新给一段准备时间：切回来时玩家的注意力不在游戏上，
   * 直接原地续播等于又一次「没准备好就掉落」。
   */
  resume() {
    if (!this.autoPaused) return
    const resumeFrom = Math.max(0, this.clock.currentTime - RESUME_REWIND)
    this.autoPaused = false
    this.running = true
    this.lastTickTime = -Infinity
    // 从退回的位置重新起播，并再给一次准备期
    this.clock.start(resumeFrom, this.leadIn)
    this.callbacks.onResume?.(resumeFrom)
    this.loop()
  }

  stop() {
    this.running = false
    this.autoPaused = false
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.clock.stop()
    window.removeEventListener('keydown', this.keyHandler)
    window.removeEventListener('keyup', this.keyUpHandler)
    window.removeEventListener('resize', this.resizeHandler)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
  }

  dispose() {
    this.stop()
    this.hitSoundGain?.disconnect()
    this.hitSoundGain = null
  }

  /** 供触屏/鼠标调用的击打入口 */
  tapLane(lane: number) {
    if (!this.running) return
    this.handleHit(lane)
  }

  /**
   * 供触屏/鼠标调用的松手入口。
   * 长按必须成对调用 tapLane/releaseLane，否则长按永远结算不了。
   */
  releaseLane(lane: number) {
    if (!this.running) return
    this.handleRelease(lane)
  }

  setLanePressed(lane: number, down: boolean) {
    this.renderer.setPressed(lane, down)
  }

  private onKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase()
    const lane = this.keys.indexOf(key)
    if (lane === -1) return
    e.preventDefault()

    // 长按时操作系统会重复发 keydown，必须忽略，否则一次按键判定多次
    if (this.keyDown.has(key)) return
    this.keyDown.add(key)

    this.renderer.setPressed(lane, true)
    this.handleHit(lane)
  }

  private onKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase()
    const lane = this.keys.indexOf(key)
    if (lane === -1) return
    this.keyDown.delete(key)
    this.renderer.setPressed(lane, false)
    this.handleRelease(lane)
  }

  private handleHit(lane: number) {
    const now = this.clock.currentTime
    const result = this.engine.hit(lane, now)
    if (!result) return // 空击不惩罚，也不出特效

    this.renderer.addEffect(lane, result.judgement, now)
    if (result.judgement !== 'miss') this.playHitSound()
    this.callbacks.onJudge?.(result.judgement, this.engine.getStats())
  }

  /**
   * 处理松键。
   *
   * 返回 null 有两种情况：这条轨道没有进行中的长按（普通音符松手，
   * 什么都不该发生），或长按中途松手（已标记 broken，但要等最终结算
   * 才知道判定档位）。两种都不出特效——尤其是后者，此刻弹个判定文字
   * 会让玩家误以为已经结束了。
   */
  private handleRelease(lane: number) {
    const now = this.clock.currentTime
    const result = this.engine.release(lane, now)
    if (!result) {
      // 松手导致长按断线时也要更新 UI（combo 已被清零）
      this.callbacks.onFrame?.(now, this.engine.getStats())
      return
    }

    this.renderer.addEffect(lane, result.judgement, now)
    this.callbacks.onJudge?.(result.judgement, this.engine.getStats())
  }

  /** 短促的击打反馈音，让玩家听到自己的操作 */
  private playHitSound() {
    if (!this.hitSoundGain) return
    const t = this.ctxAudio.currentTime
    const osc = this.ctxAudio.createOscillator()
    const env = this.ctxAudio.createGain()
    osc.type = 'square'
    osc.frequency.value = 1800
    osc.connect(env).connect(this.hitSoundGain)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(1, t + 0.001)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    osc.start(t)
    osc.stop(t + 0.03)
  }

  /**
   * 单帧逻辑：结算 miss → 渲染 → 回调 → 判断结束。
   * 与 rAF 解耦，因此可以在测试里用假时钟精确驱动。
   */
  tick(now: number) {
    // 时间跳变防护（第二道防线）。
    //
    // visibilitychange 覆盖不了所有卡顿场景：主线程长阻塞、断点调试、
    // 系统休眠唤醒都不会触发它，但同样会让 rAF 停摆而音频时钟照走。
    // 检测到跳变就跳过本帧的 miss 结算，只把游标推到当前位置——
    // 宁可漏判几个音符，也不能凭空扣玩家 combo。
    const jumped = this.lastTickTime > -Infinity && now - this.lastTickTime > MAX_TIME_STEP
    this.lastTickTime = now

    if (jumped) {
      this.engine.skipTo(now)
      this.renderer.draw(this.engine.notes, now, this.engine.getStats().combo)
      this.callbacks.onFrame?.(now, this.engine.getStats())
      return
    }

    // 结算超时未击打的音符
    const missed = this.engine.update(now)
    if (missed > 0) {
      this.renderer.addEffect(-1, 'miss', now) // lane -1 只出文字，不画轨道圈
      this.callbacks.onJudge?.('miss', this.engine.getStats())
    }

    this.renderer.draw(this.engine.notes, now, this.engine.getStats().combo)
    this.callbacks.onFrame?.(now, this.engine.getStats())

    // 结束条件：音乐播完，或最后一个音符判定完 + OUTRO_TAIL 缓冲。
    //
    // 不能只用 engine.finished：谱面尾部往往离歌曲结束还有一大段
    // （实测《起风了》最后一个音符在 315.6s，歌长 325.9s，差 10.3 秒），
    // 那会在歌曲还在放的时候硬切到结算，非常突兀。
    // 也不能只等音乐播完：如果谱面在中途就结束（间奏很长的曲子），
    // 玩家要干等好几十秒。取两者的折中。
    const songEnded = now >= this.clock.duration - 0.05
    const chartEnded = this.engine.finished && now >= this.lastNoteTime + OUTRO_TAIL

    if (!this.finished && now >= 0 && (songEnded || chartEnded)) {
      this.finished = true
      this.callbacks.onFinish?.(this.engine.getStats())
    }
  }

  private loop() {
    if (!this.running) return
    this.tick(this.clock.currentTime)
    this.rafId = requestAnimationFrame(() => this.loop())
  }
}
