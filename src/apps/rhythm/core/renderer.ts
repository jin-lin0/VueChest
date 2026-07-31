// Canvas 下落式渲染。
//
// 核心原则：音符 y 坐标由「当前时间」实时计算，绝不逐帧累加位移。
//   y = judgeLineY - (note.time - currentTime) * pixelsPerSecond
// 累加会随掉帧漂移，而这个公式在任何帧率下都给出正确位置——
// 掉帧只会让画面卡顿，不会让音符位置错，判定也不受影响。

import { isHold, noteEndTime, type Beatmap } from './beatmap'
import type { RuntimeNote } from './judge-engine'
import type { Judgement } from './clock'
import {
  LANE_COLORS,
  LANE_COLORS_ALT,
  JUDGE_COLORS,
  JUDGE_TEXT,
  STAGE,
  withAlpha,
} from './theme'

export interface RendererOptions {
  /** 音符从出现到判定线的时间（秒）。越小音符越快、越难 */
  approachTime?: number
  /** 判定线距跑道框底边的距离（像素） */
  judgeLineOffset?: number
  /**
   * 单条轨道的目标宽度（CSS 像素）。
   *
   * 152px 来自设计稿实测：跑道总宽约占视口 53%（1166px 视口下 615px，
   * 4 轨每轨 154px）。之前的 88px 太窄——音符缩成小色块，视线落点
   * 不明确，判定线附近几条轨道糊在一起。窄屏时会按比例收缩。
   */
  laneWidth?: number
}

/** 打击特效 */
interface HitEffect {
  lane: number
  /** 触发时的歌曲时间 */
  startTime: number
  judgement: Judgement
}

const LANE_COLOR_COUNT = LANE_COLORS.length

/**
 * 默认音符下落时间（秒）。
 *
 * 0.7s：音符在屏上停留更短、节奏感更紧（1.0s 实测偏飘）。
 * 这已接近下限——再快到 0.6s 以下留给玩家读谱的反应时间就不够了。
 *
 * 这里是**唯一真相**，settings.ts 的默认值从这里取，避免两处各写一份。
 */
export const DEFAULT_APPROACH_TIME = 0.7

/**
 * 跑道底边到判定线的距离（像素）。
 *
 * 判定线不贴在跑道最底部——下方留一小段，击中特效的扩散环
 * 才有地方铺开，不会被裁掉。
 */
const STAGE_BOTTOM_PAD = 44

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private map: Beatmap

  private approachTime: number
  private judgeLineOffset: number
  private preferredLaneWidth: number

  /** 逻辑尺寸（CSS 像素），与 devicePixelRatio 解耦 */
  private width = 0
  private height = 0

  /** 跑道左边缘的 x 坐标（跑道居中，两侧是背景） */
  private stageX = 0
  /** 跑道总宽度 */
  private stageWidth = 0
  /**
   * 跑道上边缘的 y（音符从这里入场）。
   *
   * 目前恒为 0（跑道占满可用高度）。仍保留成字段而不是内联 0：
   * 所有绘制与裁剪都走这两个字段，要改成"有上下留白的框"时
   * 只需动 resize() 一处。
   */
  private stageTop = 0
  /** 跑道下边缘的 y。目前恒等于画布高度 */
  private stageBottom = 0

  private effects: HitEffect[] = []
  /** 当前按下的轨道，用于高亮 */
  private pressed = new Set<number>()

  /** 最近一次判定，用于中央大字提示 */
  private lastJudgement: { judgement: Judgement; time: number } | null = null

  constructor(canvas: HTMLCanvasElement, map: Beatmap, options: RendererOptions = {}) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.canvas = canvas
    this.ctx = ctx
    this.map = map
    this.approachTime = options.approachTime ?? DEFAULT_APPROACH_TIME
    this.judgeLineOffset = options.judgeLineOffset ?? STAGE_BOTTOM_PAD
    this.preferredLaneWidth = options.laneWidth ?? 152
    this.resize()
  }

  /** 适配 devicePixelRatio，避免高分屏模糊 */
  resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.width = rect.width || this.canvas.clientWidth || 480
    this.height = rect.height || this.canvas.clientHeight || 640
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 跑道居中：宽屏用固定宽度，窄屏（手机）收缩到留少许边距
    const lanes = Math.max(1, this.map.lanes)
    const maxWidth = Math.min(this.width * 0.94, this.preferredLaneWidth * lanes)
    this.stageWidth = maxWidth
    this.stageX = (this.width - this.stageWidth) / 2

    // 跑道占满整个可用高度：音符有更长的下落距离，玩家能提前看到
    // 更多来袭音符，读谱时间更充裕
    this.stageTop = 0
    this.stageBottom = this.height
  }

  setPressed(lane: number, down: boolean) {
    if (down) this.pressed.add(lane)
    else this.pressed.delete(lane)
  }

  /**
   * 添加打击反馈。
   * @param lane 轨道号；传 -1 表示只显示判定文字不画轨道特效（用于 miss）
   */
  addEffect(lane: number, judgement: Judgement, currentTime: number) {
    if (lane >= 0) this.effects.push({ lane, judgement, startTime: currentTime })
    this.lastJudgement = { judgement, time: currentTime }
  }

  private get judgeLineY() {
    return this.stageBottom - this.judgeLineOffset
  }

  private get laneWidth() {
    return this.stageWidth / this.map.lanes
  }

  /** 轨道 i 的左边缘 x（已含跑道居中偏移） */
  private laneX(i: number) {
    return this.stageX + i * this.laneWidth
  }

  /** 轨道 i 的中心 x */
  private laneCenterX(i: number) {
    return this.laneX(i) + this.laneWidth / 2
  }

  /**
   * 跑道几何信息，供 DOM 层（键位胶囊）对齐 Canvas 里的轨道。
   *
   * 必须暴露出去：底部键位胶囊是 DOM 元素，如果它自己算居中位置，
   * 一旦 Canvas 侧的跑道宽度策略变化两者就会错位。
   */
  get stageMetrics() {
    return {
      x: this.stageX,
      width: this.stageWidth,
      laneWidth: this.laneWidth,
      judgeLineY: this.judgeLineY,
      height: this.height,
    }
  }

  /** 时间 → y 坐标。这是整个渲染的核心公式 */
  private yOf(noteTime: number, currentTime: number) {
    const remaining = noteTime - currentTime
    // 下落距离是「框顶 → 判定线」而非「屏幕顶 → 判定线」：
    // approachTime 的语义是"音符入场后多久抵达判定线"，入场点就是框顶
    const travel = this.judgeLineY - this.stageTop
    const pxPerSec = travel / this.approachTime
    return this.judgeLineY - remaining * pxPerSec
  }

  /**
   * 绘制一帧。
   * @param notes 运行时音符（含判定状态）
   * @param currentTime 当前歌曲时间（秒）
   * @param combo 当前连击，用于显示
   */
  draw(notes: RuntimeNote[], currentTime: number, combo: number) {
    const { ctx } = this
    ctx.clearRect(0, 0, this.width, this.height)

    this.drawLanes()
    // combo 画在音符**之前**：巨大的数字必须处于音符下方图层，
    // 否则会挡住落点，玩家看不清要打哪一格
    this.drawCombo(combo)
    this.drawJudgeLine()

    // 音符与特效统一裁剪到跑道框内。
    // 有了上下边界后必须裁剪：否则音符会从框外飘进来、又穿出框底，
    // "框"就形同虚设。裁剪一次比在每个绘制函数里各判一遍边界可靠。
    ctx.save()
    ctx.beginPath()
    ctx.rect(this.stageX, this.stageTop, this.stageWidth, this.stageBottom - this.stageTop)
    ctx.clip()
    this.drawNotes(notes, currentTime)
    this.drawEffects(currentTime)
    ctx.restore()

    this.drawJudgementText(currentTime)
    // 倒计时画在最上层：开局准备期的视觉锚点
    if (currentTime < 0) this.drawCountdown(-currentTime)
  }

  /**
   * 开局倒计时。
   *
   * 画在轨道中上部而非判定线附近：玩家此刻的注意力应该跟着即将落下的
   * 音符走，数字太靠下会和判定线抢视线。
   */
  private drawCountdown(remaining: number) {
    const { ctx } = this
    // 最后 1 秒换成 GO：数字跳到 0 会显得像卡住
    const isGo = remaining <= 1
    const label = isGo ? 'GO' : String(Math.ceil(remaining))
    const frac = remaining % 1
    // 每秒一次缩放脉冲，让倒计时本身也有节拍感
    const scale = isGo ? 1 : 1 + (1 - frac) * 0.25
    const cx = this.stageX + this.stageWidth / 2
    // 按跑道范围算而非画布：两者目前重合，但走 stage 字段才不会在
    // 未来改成"有留白的框"时把倒计时甩到框外
    const cy = this.stageTop + (this.stageBottom - this.stageTop) * 0.4
    const accent = JUDGE_COLORS.great

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // GO 随时间淡出，数字保持稳定不闪
    ctx.globalAlpha = isGo ? Math.max(0.15, frac) : 0.95
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.shadowColor = isGo ? withAlpha(accent, 0.9) : 'rgba(255,255,255,0.55)'
    ctx.shadowBlur = 26
    ctx.fillStyle = isGo ? accent : 'rgba(255,255,255,0.95)'
    ctx.font = `800 ${isGo ? 52 : 78}px "Rajdhani", system-ui, sans-serif`
    ctx.fillText(label, 0, 0)
    ctx.restore()

    if (!isGo) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.globalAlpha = 0.55
      ctx.fillStyle = '#9a8fd0'
      ctx.font = '600 12px "Rajdhani", system-ui, sans-serif'
      ctx.letterSpacing = '5px'
      ctx.fillText('GET READY', cx, cy + 62)
      ctx.restore()
    }
  }

  /**
   * 跑道：内部底色 + 分隔线 + 两侧发光边轨。
   *
   * 边轨是这个界面的视觉锚点——它把"游戏区"从页面背景里切出来，
   * 让玩家的视线自然收束到一条通道上。没有它整个画面会散掉。
   */
  private drawLanes() {
    const { ctx } = this
    const lw = this.laneWidth
    const x0 = this.stageX
    const x1 = this.stageX + this.stageWidth
    const top = this.stageTop
    const bottom = this.stageBottom

    // 跑道内部：比页面背景略亮一点，形成"被照亮的舞台"
    ctx.fillStyle = STAGE.laneFill
    ctx.fillRect(x0, top, this.stageWidth, bottom - top)

    // 判定线附近的地面光：暗示"音符即将抵达的地方"
    const glowH = Math.min(190, this.judgeLineY - top)
    const glow = ctx.createLinearGradient(0, this.judgeLineY - glowH, 0, this.judgeLineY)
    glow.addColorStop(0, 'rgba(255,255,255,0)')
    glow.addColorStop(1, 'rgba(180,150,255,0.07)')
    ctx.fillStyle = glow
    ctx.fillRect(x0, this.judgeLineY - glowH, this.stageWidth, glowH)

    // 按下的轨道整条高亮，给出"这条通道是活的"的反馈。
    // 高亮铺到跑道框底而非判定线：设计稿里按下的那一格连判定线
    // 下方的余量也是亮的，视觉上像"整格被点亮"
    for (let i = 0; i < this.map.lanes; i++) {
      if (!this.pressed.has(i)) continue
      const color = LANE_COLORS[i % LANE_COLOR_COUNT]
      const hlTop = Math.max(top, this.judgeLineY - 280)
      const g = ctx.createLinearGradient(0, hlTop, 0, bottom)
      g.addColorStop(0, withAlpha(color, 0))
      g.addColorStop(0.82, withAlpha(color, 0.14))
      g.addColorStop(1, withAlpha(color, 0.24))
      ctx.fillStyle = g
      ctx.fillRect(this.laneX(i), hlTop, lw, bottom - hlTop)
    }

    // 轨道分隔线（只画内部的，不画最外两条——那是边轨的活）
    ctx.strokeStyle = STAGE.laneDivider
    ctx.lineWidth = 1
    for (let i = 1; i < this.map.lanes; i++) {
      const x = Math.round(this.laneX(i)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
    }

    // 跑道底边：把"游戏区"的下界明确框出来。
    // 只画底边不画顶边——跑道占满高度后顶边会贴在画布最上沿，
    // 画出来像一条无意义的横线；底边则是特效铺开区的边界，有意义。
    // 亮度刻意压得很低，否则会和判定线抢注意力
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, Math.round(bottom) - 0.5)
    ctx.lineTo(x1, Math.round(bottom) - 0.5)
    ctx.stroke()

    // 两侧发光边轨。上端渐隐：暗示跑道"从远处延伸而来"，
    // 顶端硬切会让画面看起来像被截断的矩形
    for (const x of [x0, x1]) {
      const rail = ctx.createLinearGradient(0, top, 0, bottom)
      rail.addColorStop(0, withAlpha(STAGE.railColor, 0.06))
      rail.addColorStop(0.3, withAlpha(STAGE.railColor, 0.45))
      rail.addColorStop(1, withAlpha(STAGE.railColor, 0.95))
      ctx.strokeStyle = rail
      ctx.lineWidth = 2
      ctx.shadowColor = withAlpha(STAGE.railColor, 0.85)
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, top)
      ctx.lineTo(Math.round(x) + 0.5, bottom)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  /**
   * 判定线：一条贯穿跑道的发光白线。
   *
   * 设计上刻意做成"最亮的一条线"——它是整个界面唯一需要玩家
   * 时刻锁定的位置，亮度层级必须高于音符本身。
   */
  private drawJudgeLine() {
    const { ctx } = this
    const y = Math.round(this.judgeLineY) + 0.5
    const x0 = this.stageX
    const w = this.stageWidth

    // 线下方的余晖，让线"浮"在跑道上而非贴着画
    const under = ctx.createLinearGradient(0, y, 0, y + 26)
    under.addColorStop(0, 'rgba(255,255,255,0.16)')
    under.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = under
    ctx.fillRect(x0, y, w, 26)

    ctx.save()
    ctx.shadowColor = 'rgba(255,255,255,0.9)'
    ctx.shadowBlur = 16
    ctx.strokeStyle = STAGE.judgeLine
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + w, y)
    ctx.stroke()
    ctx.restore()
  }

  private drawNotes(notes: RuntimeNote[], currentTime: number) {
    const noteH = 18
    // 只画可见范围内的音符：从判定线往上一屏，往下留一点余量
    const from = currentTime - 0.2
    const to = currentTime + this.approachTime

    for (const note of notes) {
      const endTime = noteEndTime(note)
      // 长按用尾端判断入场、头部判断退场：一条 1.4 秒的长按可能
      // 尾巴还在屏幕外、头已经过了判定线，两端都要考虑
      if (endTime < from || note.time > to) continue

      if (isHold(note)) {
        this.drawHold(note, currentTime, noteH)
        continue
      }

      // 已击中的不再画；miss 的继续下落一小段以示反馈
      if (note.resolved && note.result !== 'miss') continue

      const y = this.yOf(note.time, currentTime)
      if (y < this.stageTop - noteH || y > this.stageBottom + noteH) continue

      this.drawTapNote(note.lane, y, noteH, note.resolved && note.result === 'miss')
    }
  }

  /**
   * 单击音符：带外发光的横向胶囊 + 渐变填充 + 顶部高光。
   *
   * 三层结构不是装饰堆叠——外发光让音符在深色跑道上"跳出来"，
   * 渐变给出体积感（纯色块看起来是贴纸），顶部高光标示朝向。
   * 少任何一层音符都会显得扁平廉价。
   */
  private drawTapNote(lane: number, y: number, noteH: number, dimmed: boolean) {
    const { ctx } = this
    const lw = this.laneWidth
    // 固定边距而非按比例：轨道变宽时按比例留白会让音符两侧空出一大块，
    // 设计稿里音符是几乎铺满整格的，只留一道缝把相邻轨道分开
    const pad = 5
    const x = this.laneX(lane) + pad
    const w = lw - pad * 2
    const color = LANE_COLORS[lane % LANE_COLOR_COUNT]
    const alt = LANE_COLORS_ALT[lane % LANE_COLOR_COUNT]

    ctx.save()
    if (dimmed) ctx.globalAlpha = 0.22

    // 外发光
    ctx.shadowColor = withAlpha(color, dimmed ? 0.2 : 0.9)
    ctx.shadowBlur = dimmed ? 4 : 16

    const grad = ctx.createLinearGradient(x, y - noteH / 2, x + w, y + noteH / 2)
    grad.addColorStop(0, color)
    grad.addColorStop(1, alt)
    ctx.fillStyle = grad
    // 圆角只取 5px 而非做成全胶囊：轨道宽了之后 half-height 圆角
    // 在 150px 宽的条上几乎看不出，而小圆角更接近设计稿的"发光条"
    this.roundRect(x, y - noteH / 2, w, noteH, 5)
    ctx.fill()

    // 高光要画在发光之上，所以先关掉阴影
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    this.roundRect(x + w * 0.05, y - noteH / 2 + 2.5, w * 0.9, 2.5, 1.25)
    ctx.fill()

    ctx.restore()
  }

  /**
   * 绘制长按条：头部方块 + 条身 + 尾部端点。
   *
   * 关键细节：正在按住时**条身要被判定线"吃掉"**——已经过线的部分不再绘制，
   * 剩余长度直观表示"还要按多久"。这是长按最重要的视觉反馈，
   * 没有它玩家不知道什么时候能松手。
   */
  private drawHold(note: RuntimeNote, currentTime: number, noteH: number) {
    const { ctx } = this
    const lw = this.laneWidth
    const pad = 8 // 比单击音符（5px）略宽的留白，视觉上区分开
    const x = this.laneX(note.lane) + pad
    const w = lw - pad * 2
    const color = LANE_COLORS[note.lane % LANE_COLOR_COUNT]

    const endTime = noteEndTime(note)
    const holding = note.holdState === 'holding'
    const broken = note.holdState === 'broken'

    // 头部 y：按住后钉在判定线上（头已经"消耗"掉了，不该继续往下跑）
    const rawHeadY = this.yOf(note.time, currentTime)
    const headY = holding || broken ? Math.min(this.judgeLineY, rawHeadY) : rawHeadY
    const tailY = this.yOf(endTime, currentTime)

    // 条身范围：从尾部到头部。按住时下界钳到判定线
    const bodyTop = tailY
    const bodyBottom = holding || broken ? Math.min(headY, this.judgeLineY) : headY
    if (bodyBottom < this.stageTop - noteH || bodyTop > this.stageBottom + noteH) return

    ctx.save()
    // 状态决定透明度：断线时变暗提示"掉了"，完成后淡出
    if (broken) ctx.globalAlpha = 0.28
    else if (note.resolved && note.result === 'miss') ctx.globalAlpha = 0.22
    else if (note.resolved) ctx.globalAlpha = 0.12

    const top = Math.max(bodyTop, this.stageTop - noteH)
    const bottom = Math.min(bodyBottom, this.stageBottom + noteH)

    if (bottom > top) {
      // 条身：横向渐变模拟"管状"高光，比纵向渐变更像一根发光的柱子。
      // 轨道变宽后填充必须更淡——同样的 alpha 铺在 150px 宽的面上
      // 观感会比 60px 重得多，会盖掉后面的 combo 数字
      const grad = ctx.createLinearGradient(x, 0, x + w, 0)
      grad.addColorStop(0, withAlpha(color, 0.16))
      grad.addColorStop(0.45, withAlpha(color, holding ? 0.3 : 0.2))
      grad.addColorStop(1, withAlpha(color, 0.16))

      // 按住时整根条身发光，是"正在持续得分"最直接的反馈
      if (holding) {
        ctx.shadowColor = withAlpha(color, 0.8)
        ctx.shadowBlur = 20
      }
      ctx.fillStyle = grad
      this.roundRect(x, top, w, bottom - top, 7)
      ctx.fill()
      ctx.shadowBlur = 0

      // 两侧亮边：给条身明确的轮廓，避免在深背景上糊成一团
      ctx.strokeStyle = withAlpha(color, holding ? 1 : 0.8)
      ctx.lineWidth = 1.75
      this.roundRect(x, top, w, bottom - top, 7)
      ctx.stroke()
    }

    // 尾端横杠：明确标出"按到这里就能松手"
    if (tailY > this.stageTop - noteH && tailY < this.stageBottom + noteH) {
      ctx.shadowColor = withAlpha(color, 0.9)
      ctx.shadowBlur = 10
      ctx.fillStyle = withAlpha(color, 0.98)
      this.roundRect(x - 1.5, tailY - 3, w + 3, 6, 3)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    ctx.restore()

    // 头部方块：与单击音符同款，玩家一眼知道"这里要按下"
    if (
      !note.resolved &&
      headY > this.stageTop - noteH &&
      headY < this.stageBottom + noteH
    ) {
      ctx.save()
      if (broken) ctx.globalAlpha = 0.3
      this.drawTapNote(note.lane, headY, noteH, false)
      ctx.restore()
    }
  }

  /**
   * 打击特效：判定线上的横向光爆 + 扩散光环。
   *
   * 用横向而非圆形：轨道是竖的，横向光爆能"填满"轨道宽度，
   * 视觉上更像"这一格被击中了"。圆环单独叠一层做能量扩散感。
   */
  private drawEffects(currentTime: number) {
    const { ctx } = this
    const lw = this.laneWidth
    const duration = 0.3

    this.effects = this.effects.filter((e) => currentTime - e.startTime < duration)

    for (const e of this.effects) {
      const p = (currentTime - e.startTime) / duration
      if (p < 0) continue
      const cx = this.laneCenterX(e.lane)
      const y = this.judgeLineY
      const color = JUDGE_COLORS[e.judgement]
      // 用 ease-out 而非线性：光爆应该"炸开后缓慢消散"
      const ease = 1 - (1 - p) * (1 - p)

      ctx.save()

      // 竖直光柱：从判定线向上冲，模拟能量被击发
      const beamH = 90 * (1 - ease) + 20
      const beam = ctx.createLinearGradient(0, y - beamH, 0, y)
      beam.addColorStop(0, withAlpha(color, 0))
      beam.addColorStop(1, withAlpha(color, 0.42 * (1 - ease)))
      ctx.fillStyle = beam
      ctx.fillRect(this.laneX(e.lane), y - beamH, lw, beamH)

      // 判定线上的横向光爆
      ctx.globalAlpha = 1 - ease
      ctx.shadowColor = withAlpha(color, 0.95)
      ctx.shadowBlur = 24
      ctx.fillStyle = withAlpha(color, 0.9)
      const flashH = 7 * (1 - ease) + 2
      this.roundRect(this.laneX(e.lane) + lw * 0.06, y - flashH / 2, lw * 0.88, flashH, flashH / 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // 扩散光环
      ctx.globalAlpha = (1 - ease) * 0.7
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5 * (1 - ease) + 0.5
      ctx.beginPath()
      ctx.ellipse(cx, y, lw * 0.3 + ease * lw * 0.5, 8 + ease * 22, 0, 0, Math.PI * 2)
      ctx.stroke()

      ctx.restore()
    }
  }

  /**
   * Combo 数字：巨大、半透明、压在跑道中央。
   *
   * 半透明是关键——它必须足够大才有"数字在涨"的爽感，
   * 但绝不能挡住音符。设计稿里也是这个处理：数字在音符之下的图层感。
   */
  private drawCombo(combo: number) {
    if (combo < 2) return
    const { ctx } = this
    const cx = this.stageX + this.stageWidth / 2
    const cy = this.stageTop + (this.stageBottom - this.stageTop) * 0.34

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 字号跟随跑道宽度而非写死：跑道宽度是响应式的，固定字号在窄屏
    // 会溢出跑道、在宽屏又显得小气。0.16 倍宽是实测下四位数刚好不贴边的比例
    const digits = String(combo).length
    const base = this.stageWidth * 0.16
    const size = Math.max(38, base * (digits >= 4 ? 0.8 : digits === 3 ? 0.92 : 1))
    ctx.font = `800 ${size}px "Rajdhani", system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillText(String(combo), cx, cy)

    ctx.font = '600 12px "Rajdhani", system-ui, sans-serif'
    ctx.letterSpacing = '4px'
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillText('COMBO', cx, cy + size * 0.62)
    ctx.restore()
  }

  private drawJudgementText(currentTime: number) {
    if (!this.lastJudgement) return
    const age = currentTime - this.lastJudgement.time
    if (age < 0 || age > 0.45) return

    const { ctx } = this
    const color = JUDGE_COLORS[this.lastJudgement.judgement]
    // 前 80ms 上浮一点再定住：给判定文字一个"弹出"的落点感
    const rise = Math.min(1, age / 0.08)
    const cy = this.judgeLineY - 120 - rise * 8

    ctx.save()
    ctx.globalAlpha = Math.min(1, (1 - age / 0.45) * 1.6)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = withAlpha(color, 0.8)
    ctx.shadowBlur = 14
    ctx.fillStyle = color
    ctx.font = '700 19px "Rajdhani", system-ui, sans-serif'
    ctx.letterSpacing = '3px'
    ctx.fillText(
      JUDGE_TEXT[this.lastJudgement.judgement],
      this.stageX + this.stageWidth / 2,
      cy,
    )
    ctx.restore()
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  /** 供测试/调试：查询某音符当前应处的 y 坐标 */
  debugYOf(noteTime: number, currentTime: number) {
    return this.yOf(noteTime, currentTime)
  }
}
