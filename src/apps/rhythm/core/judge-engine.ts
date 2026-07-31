// 判定引擎：把「玩家在某时刻按了某轨道」变成判定结果与分数。
//
// 刻意做成一个不依赖时间的纯状态机：所有时间都由调用方传入，
// 内部不读 Date.now / audioContext，因此可以在单测里精确驱动。

import { judge, JUDGE_WINDOWS, type Judgement } from './clock'
import { isHold, noteEndTime, type Beatmap, type Note } from './beatmap'

/**
 * 长按的生命周期状态。
 *
 * 为什么长按需要独立状态机：普通音符是「一次按键 → 一次判定」的原子事件，
 * 而长按有三个阶段（按下头部 / 保持中 / 松开尾部），中途松手要能被检测到，
 * 松手后还可能重新按住。用一个 resolved 布尔位表达不了。
 */
export type HoldState =
  /** 还没按下头部 */
  | 'idle'
  /** 头部已命中，正在按住 */
  | 'holding'
  /** 中途松手了（还在长按时间范围内，可以补按回来） */
  | 'broken'
  /** 已完成（撑到尾部或最终结算） */
  | 'done'

/** 音符的运行时状态 */
export interface RuntimeNote extends Note {
  /** 是否已被判定（击中或 miss） */
  resolved: boolean
  /** 判定结果 */
  result?: Judgement
  /** 实际击打误差（毫秒，正 = 偏晚） */
  errorMs?: number
  /** 长按状态；普通音符恒为 undefined */
  holdState?: HoldState
  /** 长按头部的判定结果，用于最终评级时与尾部合并 */
  headJudgement?: Judgement
  /** 长按实际按住的累计时长（秒），用于算完成度 */
  heldTime?: number
  /** 上一次开始按住的时刻（秒），用于累加 heldTime */
  lastPressAt?: number
}

export interface JudgeStats {
  perfect: number
  great: number
  good: number
  miss: number
  /** 当前连击 */
  combo: number
  /** 最大连击 */
  maxCombo: number
  score: number
  /** 已判定的音符数 */
  resolved: number
  /**
   * 因时间异常跳变（切后台等）被跳过、未参与判定的音符数。
   * 单独统计而不混进 miss：那不是玩家的失误。
   */
  skipped: number
  /** 长按中途松手的次数，单独统计便于玩家知道自己的弱点 */
  holdBreaks: number
  /** 命中音符的误差列表（毫秒），用于结算显示偏早/偏晚倾向 */
  errors: number[]
}

/** 各判定等级的分值权重 */
export const JUDGE_WEIGHT: Record<Judgement, number> = {
  perfect: 1,
  great: 0.7,
  good: 0.4,
  miss: 0,
}

/** 满分固定 100 万，与主流音游一致，便于横向比较 */
export const MAX_SCORE = 1_000_000

export interface HitResult {
  judgement: Judgement
  errorMs: number
  /** 被击中的音符下标；未命中任何音符时为 -1 */
  noteIndex: number
}

/**
 * 判定引擎。
 *
 * 生命周期：
 *   new JudgeEngine(map) → 每帧 update(currentTime) 结算漏掉的音符
 *                        → 按键时 hit(lane, currentTime)
 *                        → 结束时读 stats
 */
export class JudgeEngine {
  readonly notes: RuntimeNote[]
  readonly totalNotes: number

  private stats: JudgeStats = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    score: 0,
    resolved: 0,
    skipped: 0,
    holdBreaks: 0,
    errors: [],
  }

  /** 每条轨道的扫描起点，避免每次按键都从头遍历全谱 */
  private laneCursor: number[]
  /** 按轨道分组的音符下标，升序 */
  private laneNotes: number[][]
  /** 每条轨道当前正在按住的长按音符下标；-1 = 无 */
  private activeHold: number[]

  constructor(map: Beatmap) {
    this.notes = map.notes.map((n) => ({
      ...n,
      resolved: false,
      // 长按初始化状态机字段；普通音符保持 undefined，零额外开销
      ...(isHold(n) ? { holdState: 'idle' as HoldState, heldTime: 0 } : {}),
    }))
    this.totalNotes = this.notes.length

    this.laneNotes = Array.from({ length: map.lanes }, () => [])
    this.notes.forEach((n, i) => {
      if (n.lane >= 0 && n.lane < map.lanes) this.laneNotes[n.lane].push(i)
    })
    this.laneCursor = new Array(map.lanes).fill(0)
    this.activeHold = new Array(map.lanes).fill(-1)
  }

  getStats(): Readonly<JudgeStats> {
    return this.stats
  }

  /** 达成率 0-100，按判定权重加权 */
  get accuracy(): number {
    // 分母排除 skipped：被跳过的音符玩家没机会打，算进去等于按 miss 处理
    const counted = this.stats.resolved - this.stats.skipped
    if (counted <= 0) return 100
    const weighted =
      this.stats.perfect * JUDGE_WEIGHT.perfect +
      this.stats.great * JUDGE_WEIGHT.great +
      this.stats.good * JUDGE_WEIGHT.good
    return (weighted / counted) * 100
  }

  /** 是否全部判定完毕 */
  get finished(): boolean {
    return this.stats.resolved >= this.totalNotes
  }

  /**
   * 处理一次按键。
   * @param lane 轨道号
   * @param currentTime 当前歌曲时间（秒）
   * @returns 判定结果；若该轨道判定窗口内无音符则返回 null（空击不惩罚）
   */
  hit(lane: number, currentTime: number): HitResult | null {
    const indices = this.laneNotes[lane]
    if (!indices) return null

    const goodWindow = JUDGE_WINDOWS.good / 1000

    // 断掉的长按优先补按回来：玩家在长按范围内重新按下，
    // 意图显然是「续上刚才松掉的那条」，而不是打下一个音符
    const heldIdx = this.activeHold[lane]
    if (heldIdx >= 0) {
      const held = this.notes[heldIdx]
      if (held.holdState === 'broken' && currentTime < noteEndTime(held)) {
        held.holdState = 'holding'
        held.lastPressAt = currentTime
        return { judgement: held.headJudgement ?? 'good', errorMs: 0, noteIndex: heldIdx }
      }
    }

    // 从游标开始找第一个未判定且在窗口内的音符
    let cursor = this.laneCursor[lane]
    while (cursor < indices.length && this.notes[indices[cursor]].resolved) cursor++
    this.laneCursor[lane] = cursor

    let bestIdx = -1
    let bestAbs = Infinity
    for (let k = cursor; k < indices.length; k++) {
      const idx = indices[k]
      const note = this.notes[idx]
      if (note.resolved) continue
      // 正在按住的长按不参与「寻找目标」：它已经被认领了
      if (note.holdState === 'holding') continue

      const delta = currentTime - note.time
      // 音符还太远，后面的只会更远，可以停
      if (delta < -goodWindow) break

      const abs = Math.abs(delta)
      if (abs <= goodWindow && abs < bestAbs) {
        bestAbs = abs
        bestIdx = idx
      }
    }

    if (bestIdx === -1) return null

    const note = this.notes[bestIdx]
    const errorMs = (currentTime - note.time) * 1000
    const judgement = judge(errorMs)

    if (isHold(note)) {
      // 长按头部命中：进入 holding 状态，此时**先不结算**——
      // 最终判定要等尾部，因为「按下但立刻松手」不该算完整命中。
      // 但要立刻给 combo 反馈，否则玩家会以为没打中。
      note.holdState = 'holding'
      note.headJudgement = judgement
      note.errorMs = errorMs
      note.lastPressAt = currentTime
      note.heldTime = 0
      this.activeHold[lane] = bestIdx
      this.stats.combo++
      if (this.stats.combo > this.stats.maxCombo) this.stats.maxCombo = this.stats.combo
    } else {
      this.resolve(note, judgement, errorMs)
    }

    return { judgement, errorMs, noteIndex: bestIdx }
  }

  /**
   * 处理松键。普通音符无需调用，长按必须调用。
   *
   * @returns 若这次松手结算了一个长按则返回结果，否则 null
   */
  release(lane: number, currentTime: number): HitResult | null {
    const idx = this.activeHold[lane]
    if (idx < 0) return null

    const note = this.notes[idx]
    if (note.holdState !== 'holding') return null

    // 累加本段按住时长
    if (note.lastPressAt !== undefined) {
      note.heldTime = (note.heldTime ?? 0) + Math.max(0, currentTime - note.lastPressAt)
      note.lastPressAt = undefined
    }

    const endTime = noteEndTime(note)
    const tailWindow = JUDGE_WINDOWS.good / 1000

    if (currentTime >= endTime - tailWindow) {
      // 撑到尾部了（允许提前 good 窗口内松手，和头部判定同等宽容）
      this.finishHold(note, idx, currentTime)
      return { judgement: note.result!, errorMs: (currentTime - endTime) * 1000, noteIndex: idx }
    }

    // 中途松手：标记 broken 但不立即结算——还在长按范围内可以补按回来。
    // combo 立即断掉，这是即时惩罚；最终评级在 update 里给。
    note.holdState = 'broken'
    this.stats.combo = 0
    this.stats.holdBreaks++
    return null
  }

  /**
   * 结算一个长按。
   *
   * 评级取「头部判定」与「完成度」的较差者：
   * 头部打得再准，只按住一半也不该给 perfect。
   */
  private finishHold(note: RuntimeNote, idx: number, currentTime: number) {
    const total = note.duration ?? 0
    // 结算时若还按着，把最后一段也算上
    if (note.lastPressAt !== undefined) {
      note.heldTime = (note.heldTime ?? 0) + Math.max(0, currentTime - note.lastPressAt)
      note.lastPressAt = undefined
    }
    const ratio = total > 0 ? Math.min(1, (note.heldTime ?? 0) / total) : 1

    // 完成度 → 判定档位。阈值参考主流音游的长按宽容度：
    // 撑住 95% 以上算完美，80% 以上仍算不错，一半以下就是漏了。
    let byRatio: Judgement
    if (ratio >= 0.95) byRatio = 'perfect'
    else if (ratio >= 0.8) byRatio = 'great'
    else if (ratio >= 0.5) byRatio = 'good'
    else byRatio = 'miss'

    const order: Judgement[] = ['perfect', 'great', 'good', 'miss']
    const head = note.headJudgement ?? 'good'
    // 取更差的那个：max 下标 = 更靠后 = 更差
    const final = order[Math.max(order.indexOf(head), order.indexOf(byRatio))]

    note.holdState = 'done'
    this.activeHold[note.lane] = -1

    // resolve 会加 combo，但头部命中时已经加过了，这里先回退一格避免重复
    if (final !== 'miss' && this.stats.combo > 0) this.stats.combo--
    this.resolve(note, final, note.errorMs ?? 0)
    void idx
  }

  /**
   * 每帧调用：把已经过了判定窗口仍未被击中的音符标记为 miss。
   * @returns 本次新增的 miss 数
   */
  update(currentTime: number): number {
    const goodWindow = JUDGE_WINDOWS.good / 1000
    let missed = 0

    // 先处理正在进行中的长按：撑过尾部就自动结算，
    // 玩家一直按到底不松手也算成功（不该强迫他在精确时刻松手）
    for (let lane = 0; lane < this.activeHold.length; lane++) {
      const idx = this.activeHold[lane]
      if (idx < 0) continue
      const note = this.notes[idx]
      const endTime = noteEndTime(note)

      if (note.holdState === 'holding' && currentTime >= endTime) {
        this.finishHold(note, idx, endTime)
      } else if (note.holdState === 'broken' && currentTime >= endTime) {
        // 断掉后没能补按回来，按实际完成度结算
        this.finishHold(note, idx, endTime)
      }
    }

    for (let lane = 0; lane < this.laneNotes.length; lane++) {
      const indices = this.laneNotes[lane]
      let cursor = this.laneCursor[lane]

      while (cursor < indices.length) {
        const note = this.notes[indices[cursor]]
        if (note.resolved) {
          cursor++
          continue
        }
        // 正在按住 / 断线待补的长按不算漏，它有自己的结算路径。
        // 但游标不能停在这里——否则同轨后续音符全被挡住无法判定。
        if (note.holdState === 'holding' || note.holdState === 'broken') {
          cursor++
          continue
        }
        // 尚未超时，后面的音符更晚，停止扫描
        if (currentTime - note.time <= goodWindow) break

        this.resolve(note, 'miss', 0)
        missed++
        cursor++
      }
      this.laneCursor[lane] = cursor
    }

    return missed
  }

  /**
   * 把游标推进到指定时间，但**不产生任何判定**。
   *
   * 用于时间异常跳变后的恢复（切后台、主线程阻塞、系统休眠）：
   * 这期间的音符玩家根本没机会打，判成 miss 是冤枉的。
   * 直接标记为已跳过并计入 resolved，让进度与结束判定仍然自洽。
   *
   * @returns 被跳过的音符数
   */
  /**
   * 作废所有进行中的长按，记为 skipped。
   *
   * 用于切后台 / 时间跳变：这些场景下手指的真实状态不可知，
   * 既不能算成功（可能早松手了）也不能算失败（不是玩家的错）。
   *
   * @returns 被作废的长按数
   */
  abandonHolds(): number {
    let count = 0
    for (let lane = 0; lane < this.activeHold.length; lane++) {
      const idx = this.activeHold[lane]
      if (idx < 0) continue
      const note = this.notes[idx]
      this.activeHold[lane] = -1
      if (note.resolved) continue

      // 头部命中时加过 combo，这里要回退，否则会留下一个虚高的 combo
      if (note.holdState === 'holding' && this.stats.combo > 0) this.stats.combo--
      note.holdState = 'done'
      note.resolved = true
      note.result = undefined
      note.lastPressAt = undefined
      this.stats.resolved++
      this.stats.skipped++
      count++
    }
    return count
  }

  skipTo(currentTime: number): number {
    const goodWindow = JUDGE_WINDOWS.good / 1000
    let skipped = this.abandonHolds()

    for (let lane = 0; lane < this.laneNotes.length; lane++) {
      const indices = this.laneNotes[lane]
      let cursor = this.laneCursor[lane]

      while (cursor < indices.length) {
        const note = this.notes[indices[cursor]]
        if (note.resolved) {
          cursor++
          continue
        }
        if (currentTime - note.time <= goodWindow) break

        // 标记为已解决但不计入任何判定档位：既不给分也不扣 combo
        note.resolved = true
        note.result = undefined
        this.stats.resolved++
        this.stats.skipped++
        skipped++
        cursor++
      }
      this.laneCursor[lane] = cursor
    }

    return skipped
  }

  private resolve(note: RuntimeNote, judgement: Judgement, errorMs: number) {
    note.resolved = true
    note.result = judgement
    if (judgement !== 'miss') note.errorMs = errorMs

    this.stats[judgement]++
    this.stats.resolved++

    if (judgement === 'miss') {
      this.stats.combo = 0
    } else {
      this.stats.combo++
      if (this.stats.combo > this.stats.maxCombo) this.stats.maxCombo = this.stats.combo
      this.stats.errors.push(errorMs)
    }

    // 分数按「已判定音符的加权和 / 总音符数」实时计算，
    // 这样中途退出也能看到有意义的分数
    if (this.totalNotes > 0) {
      const weighted =
        this.stats.perfect * JUDGE_WEIGHT.perfect +
        this.stats.great * JUDGE_WEIGHT.great +
        this.stats.good * JUDGE_WEIGHT.good
      this.stats.score = Math.round((weighted / this.totalNotes) * MAX_SCORE)
    }
  }
}

/** 结算评级 */
export type Rank = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D'

export function rankOf(accuracy: number, missCount: number, totalNotes: number): Rank {
  // 全连（无 miss）且达成率极高才给最高评级
  if (missCount === 0 && accuracy >= 99) return 'SSS'
  if (accuracy >= 95) return 'SS'
  if (accuracy >= 90) return 'S'
  if (accuracy >= 80) return 'A'
  if (accuracy >= 70) return 'B'
  if (accuracy >= 60) return 'C'
  void totalNotes
  return 'D'
}

/** 平均误差（毫秒）。正值说明玩家习惯偏晚按，可用于建议校准值 */
export function averageError(errors: number[]): number {
  if (!errors.length) return 0
  return errors.reduce((a, b) => a + b, 0) / errors.length
}

/**
 * 连击倍率（展示用，1.0 ~ 4.0）。
 *
 * 注意：**这只是一个展示指标，不参与实际计分**。分数是「已判定音符的
 * 加权和 / 总音符数」，与连击顺序无关——这样中途退出的分数也有意义，
 * 且不会因为一次 miss 就把后面全部贬值。
 *
 * 但玩家需要一个"连击正在变值钱"的即时反馈，所以给出这个倍率：
 * 每 50 连提升一档，200 连打满 x4。50 这个步长实测下大约每 20 秒
 * 升一档（2.5 notes/s 的谱面），升级节奏既能感知到又不会太频繁。
 */
export function comboMultiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(combo / 50))
}
