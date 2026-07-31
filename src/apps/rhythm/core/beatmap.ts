// 谱面：以 BPM 网格为骨架，用起音强度决定音符分布与和弦。
//
// 为什么换掉「量化 onset」的思路：
//   旧法先检测 onset 再吸附到网格，只有约 60% 能对上，剩下 40% 被丢弃或错位，
//   听起来就是「有那个意思但不完全跟着节奏」。而且丢弃是不可控的——
//   安静段可能一个音符都不剩，密集段又挤成一团。
//
//   新法反过来：先铺满网格骨架（天然 100% 对齐），再用每个网格点附近的
//   起音强度决定「这里要不要出音符、出几个」。好处：
//     1. 音符永远在拍上，节奏骨架稳定
//     2. 密度由分位数阈值控制，可精确调到目标值
//     3. 强度天然给出「强拍出双押、弱拍出单键」——这正是真实音游的做法
//
// 实测《起风了》网格点强度跨度 33 倍（p10=1.66，max=55.3），
// 区分度足够支撑上述决策。

/** 单个音符 */
export interface Note {
  /** 击打时间（秒，歌曲时间轴） */
  time: number
  /** 轨道号，0-based */
  lane: number
  /**
   * 长按时长（秒）。缺省或 0 表示普通单击。
   *
   * 为什么用时长而非结束时间：判定与渲染都需要「还要按多久」，
   * 存 duration 可以直接用；存 endTime 每次都要减一次，且改 time 时
   * 容易忘记同步（曾经在轨道分配里踩过这类坑）。
   */
  duration?: number
}

/** 是否为长按音符 */
export function isHold(note: Note): boolean {
  return (note.duration ?? 0) > 0
}

/** 音符的结束时间：长按取尾端，单击等于起始时间 */
export function noteEndTime(note: Note): number {
  return note.time + (note.duration ?? 0)
}

export interface Beatmap {
  songId: string
  title: string
  lanes: number
  bpm: number
  offset: number
  duration: number
  notes: Note[]
  meta: {
    quantizeDivision: number
    /** 网格总点数 */
    gridPoints: number
    /** 产出音符的网格点数（不含和弦重复） */
    activePoints: number
    /** 双押（同时 2 键）的点数 */
    chordPoints: number
    /** 长按音符数 */
    holdNotes: number
    /** 长按总时长（秒） */
    holdTotalSec: number
    /** 实际采用的强度阈值 */
    threshold: number
    /** 整拍位置的填充率 0-1，节奏稳定性的核心指标 */
    beatFillRate: number
    /** 最长空档（秒），只统计音符之间，不含首尾静音 */
    maxGap: number
  }
}

/** 网格点及其音乐强度 */
export interface GridPoint {
  time: number
  strength: number
}

export interface GenerateOptions {
  lanes?: number
  /**
   * 网格精度：每拍切成几格。
   * 2 = 八分音符（慢歌推荐），4 = 十六分音符（快歌/高难度）
   */
  quantizeDivision?: number
  /**
   * 目标密度（音符/秒）。算法会自动挑选强度阈值来逼近它，
   * 而不是让用户猜一个绝对阈值——绝对阈值在不同歌曲间没有可比性。
   */
  targetDensity?: number
  /**
   * 双押比例：强度最高的这个比例的活跃点出 2 键同押。
   * 0 = 从不双押，0.15 = 最强的 15%
   */
  chordRatio?: number
  /**
   * 局部自适应窗口（秒）。阈值在这个滑动窗口内独立计算，
   * 使安静段与高潮段都能得到合理密度。
   *
   * 为什么需要：全局固定阈值下实测各 15 秒段密度在 0~3.47/s 剧烈波动
   * （标准差 0.78），安静段填充率仅 25%——音乐还在响却没东西可打，
   * 节奏感直接断掉。设 0 则退化为全局阈值。
   */
  adaptiveWindow?: number
  /**
   * 律动骨架偏置：整拍位置的强度倍率（参与同一份密度配额的竞争）。
   *
   * 为什么需要：实测整拍填充率只有 56~85%，意味着 15~44% 的整拍是空的。
   * 音游的爽感来自稳定的律动骨架——玩家预期「每拍都该有东西打」，
   * 整拍漏空比多几个弱音符难受得多。
   *
   * 为什么用倍率而非「保底比例」：保底会额外追加音符从而撑爆密度
   * （实测目标 2.0 变成 3.8）。倍率让整拍与半拍抢同一个名额——
   * 弱整拍能赢过弱半拍，但真正的强半拍（切分、过门）仍会胜出。
   * 1 = 不偏向，2 = 整拍强度视作两倍。
   */
  beatBias?: number
  /**
   * 最大空档（秒）。超过这个时长没有音符就强制插入一个（取该区间最强点）。
   *
   * 实测最长空档达 11 秒，这段时间玩家完全脱离节奏。
   */
  maxSilence?: number
  /**
   * RMS 能量包络（与 odf 同帧率），用于检测延音以生成长按条。
   * 不提供则不生成任何长按——长按是可选增强，缺了不影响基础谱面。
   */
  rms?: Float32Array | number[]
  /** rms 的帧时长（秒）。不传则复用 odf 的帧时长 */
  rmsFrameDuration?: number
  /**
   * 长按的 RMS 门槛，表达为网格 RMS 的分位数（0-1）。
   *
   * 用分位数而非绝对值：不同歌曲的混音响度差好几倍，绝对阈值无法跨曲复用。
   * 0.25 是实测选出的值——该门槛下长按占活跃点 7.2%（57 处），
   * 中位时长 0.6s、最长 1.4s，接近商业音游的长按占比（osu!mania 约 5-15%）。
   * 提到 0.5 只剩 3.3%，长按变成稀有事件，玩家感受不到这个机制。
   */
  holdRmsPercentile?: number
  /**
   * 长按最短几个网格。太短的长按手感像误触，也来不及看清。
   * 2 格 = 1 拍（1/8 网格下），是能明确感知「要按住」的下限。
   */
  holdMinGrids?: number
  /**
   * 长按最长几个网格，避免一条长按吃掉整个乐句。
   * 8 格 = 4 拍（1/8 网格下），已经是一个小节。
   */
  holdMaxGrids?: number
  /** 随机种子，保证同一首歌生成的谱面稳定可复现 */
  seed?: number
}

/**
 * 确定性伪随机（mulberry32）。
 * 用固定种子而非 Math.random，保证同一首歌每次生成同样的谱面——
 * 否则玩家重开一次谱面就变了，无法练习。
 */
export function createRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 构建网格骨架：在每个网格点上采样附近的最大起音强度。
 *
 * @param odf 起音强度函数（superFlux 输出）
 * @param frameDuration odf 每帧对应的秒数
 * @param window 采样窗口半宽（秒）。取 ±50ms 是因为真实演奏
 *        相对拍点有几十毫秒的自然摇摆，窗口太窄会漏掉。
 */
export function buildGrid(
  odf: Float32Array | number[],
  frameDuration: number,
  bpm: number,
  offset: number,
  duration: number,
  division: number,
  window = 0.05,
): GridPoint[] {
  if (bpm <= 0 || duration <= 0) return []
  const step = 60 / bpm / division
  if (step <= 0) return []

  const points: GridPoint[] = []
  // 从 offset 所在相位的第一个非负网格点开始
  const firstIndex = Math.ceil(-offset / step)
  for (let n = Math.max(0, firstIndex); ; n++) {
    const t = offset + n * step
    if (t >= duration) break
    if (t < 0) continue

    const lo = Math.max(0, Math.floor((t - window) / frameDuration))
    const hi = Math.min(odf.length - 1, Math.ceil((t + window) / frameDuration))
    let peak = 0
    for (let i = lo; i <= hi; i++) {
      const v = odf[i]
      if (v > peak) peak = v
    }
    points.push({ time: t, strength: peak })
  }
  return points
}

/**
 * 按目标密度挑选强度阈值。
 *
 * 用分位数而非绝对值：不同歌曲的 odf 量级差异巨大
 * （取决于混音响度、频段分布），绝对阈值无法跨曲复用。
 */
export function thresholdForDensity(
  points: GridPoint[],
  duration: number,
  targetDensity: number,
): number {
  if (!points.length || duration <= 0) return 0
  const wanted = Math.round(targetDensity * duration)
  if (wanted >= points.length) return 0

  const sorted = points.map((p) => p.strength).sort((a, b) => a - b)
  // 想保留 wanted 个 → 阈值取第 (len - wanted) 位
  const idx = Math.max(0, Math.min(sorted.length - 1, sorted.length - wanted))
  return sorted[idx]
}

/**
 * 静音底线：低于这个强度视为「音乐这里没东西」，不该被塞音符。
 *
 * 不能简单用 `strength > 0`——SuperFlux 的 odf 在任何有声段都有底噪。
 * 改用相对判据：p99 的一个小比例。用 p99 而非 max 是为了不被单个
 * 爆音（鼓 fill、削波）把门槛拉高。
 */
export function silenceFloorOf(points: GridPoint[], ratio = 0.05): number {
  if (!points.length) return 0
  const sorted = points.map((p) => p.strength).sort((a, b) => a - b)
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]
  return p99 * ratio
}

/**
 * 局部配额选点：按 windowSeconds 分段，每段内取「加权强度」最高的若干个。
 *
 * 两个设计要点：
 *
 * 1. **局部而非全局阈值**。全局阈值下实测各 15 秒段密度在 0~3.47/s 剧烈
 *    波动（标准差 0.78），安静段填充率仅 25%——音乐还在响却没东西可打。
 *    局部化后判据变成「相对本段而言够强」，主歌与副歌都拿到合理密度。
 *
 * 2. **整拍加权而非整拍追加**。早期版本把「整拍保底」实现为在选完之后
 *    额外补足整拍，结果密度被撑爆（目标 2 实测 3.8），低密度时更是把
 *    真正的强音挤到后面。改成在同一份配额里给整拍乘一个偏置：整拍与
 *    半拍竞争同一个名额，弱整拍会赢过弱半拍，但强半拍仍能胜出。
 *    这样密度可控，律动骨架也能优先成型。
 *
 * @param division 每拍格数，用于识别整拍（下标能被 division 整除）
 * @param beatBias 整拍强度倍率，>1 表示偏向整拍
 */
export function selectByQuota(
  points: GridPoint[],
  windowSeconds: number,
  targetDensity: number,
  division: number,
  beatBias: number,
  floor: number,
): GridPoint[] {
  if (!points.length || targetDensity <= 0) return []

  // 先给每个点算加权分，同时标记是否整拍
  const scored = points.map((p, idx) => ({
    point: p,
    score: p.strength * (division > 0 && idx % division === 0 ? beatBias : 1),
  }))

  const chunks: typeof scored[] = []
  if (windowSeconds <= 0) {
    chunks.push(scored)
  } else {
    const end = points[points.length - 1].time
    let i = 0
    for (let winStart = points[0].time; winStart <= end; winStart += windowSeconds) {
      const winEnd = winStart + windowSeconds
      const chunk: typeof scored = []
      while (i < scored.length && scored[i].point.time < winEnd) chunk.push(scored[i++])
      if (chunk.length) chunks.push(chunk)
    }
  }

  const out: GridPoint[] = []
  const span = windowSeconds > 0 ? windowSeconds : points[points.length - 1].time - points[0].time || 1
  for (const chunk of chunks) {
    const eligible = chunk.filter((s) => s.point.strength > floor)
    if (!eligible.length) continue
    const quota = Math.min(eligible.length, Math.max(1, Math.round(targetDensity * span)))
    const picked = [...eligible].sort((a, b) => b.score - a.score).slice(0, quota)
    for (const s of picked) out.push(s.point)
  }
  return out.sort((a, b) => a.time - b.time)
}

/**
 * 消除过长空档：超过 maxSilence 秒没有音符就插入该区间最强的网格点。
 *
 * 实测最长空档 11 秒（55 个网格点），这段时间玩家完全脱离节奏，
 * 回来时还要重新找拍，体验很差。
 *
 * @param floor 静音底线，低于它的点不作候选（真正的休止不该被填）
 */
export function fillLongSilences(
  grid: GridPoint[],
  selected: GridPoint[],
  maxSilence: number,
  floor = 0,
): GridPoint[] {
  if (maxSilence <= 0 || !grid.length) return selected

  const result = [...selected].sort((a, b) => a.time - b.time)
  const chosen = new Set(result.map((p) => p.time))
  const inserted: GridPoint[] = []

  // 逐段检查空档：含开头到第一个音符、音符之间、最后一个音符到结尾
  const marks = [grid[0].time - 0.001, ...result.map((r) => r.time), grid[grid.length - 1].time]
  for (let k = 1; k < marks.length; k++) {
    let from = marks[k - 1]
    const to = marks[k]
    // 空档可能远超 maxSilence，需要连续插入多个
    while (to - from > maxSilence) {
      const windowEnd = from + maxSilence
      const candidates = grid.filter(
        (g) => g.time > from && g.time <= windowEnd && g.strength > floor && !chosen.has(g.time),
      )
      if (!candidates.length) break
      // 取该区间最强点，保证插入的音符落在音乐相对有事的位置
      let best = candidates[0]
      for (const c of candidates) if (c.strength > best.strength) best = c
      chosen.add(best.time)
      inserted.push(best)
      from = best.time
    }
  }

  return inserted.length ? [...result, ...inserted].sort((a, b) => a.time - b.time) : result
}

/**
 * 检测长按时长：从每个活跃点向后延伸，看能覆盖多少个「延音」网格点。
 *
 * 判据是两条曲线的组合：
 *   - RMS 能量仍高 → 声音还在响（延音、长音、pad）
 *   - 该网格点未被选为活跃点 → 没有新的攻击（否则那里该出新音符）
 *
 * 为什么必须用 RMS 而不能只看 odf：odf 是**起音**强度，延音期本来就低，
 * 光看它无法区分「延音」和「静音」。实测两条曲线相关系数仅 -0.038，
 * 确实解耦，组合起来才有判别力。
 *
 * 为什么按网格点而不按帧扫描：帧粒度下 odf 的毛刺会把区段切碎——
 * 实测严格阈值下一个延音段都找不到（count = 0）。而 buildGrid 已在
 * ±50ms 窗口内取过峰值，网格粒度天然抗毛刺。
 *
 * @param gridRms 与 grid 等长的 RMS 采样值
 * @param rmsThreshold RMS 门槛，低于它视为声音已停
 * @param minGrids 最少延伸几格才算长按（太短的长按手感像误触）
 * @param maxGrids 最多延伸几格（避免一个长按吃掉整个乐句）
 * @returns Map<活跃点时间, 长按时长秒>
 */
export function detectHolds(
  grid: GridPoint[],
  active: GridPoint[],
  gridRms: number[],
  gridStep: number,
  rmsThreshold: number,
  minGrids: number,
  maxGrids: number,
): Map<number, number> {
  const holds = new Map<number, number>()
  if (minGrids <= 0 || maxGrids < minGrids || !grid.length) return holds

  const activeTimes = new Set(active.map((a) => a.time))

  for (let i = 0; i < grid.length; i++) {
    if (!activeTimes.has(grid[i].time)) continue

    let len = 0
    for (let k = i + 1; k < grid.length && len < maxGrids; k++) {
      // 撞到下一个活跃点就停：那里要出新音符，长按不能盖过去
      if (activeTimes.has(grid[k].time)) break
      // 声音已经停了，长按该松手
      if ((gridRms[k] ?? 0) < rmsThreshold) break
      len++
    }

    if (len >= minGrids) holds.set(grid[i].time, len * gridStep)
  }

  return holds
}

/**
 * 在网格点上采样 RMS 能量。
 *
 * 取该点前后半格的均值而非瞬时值：单帧 RMS 抖动大，
 * 半格窗口正好覆盖「这个网格点管辖的时间范围」。
 */
export function sampleGridRms(
  grid: GridPoint[],
  rms: Float32Array | number[],
  rmsFrameDuration: number,
  gridStep: number,
): number[] {
  const half = gridStep / 2
  return grid.map((g) => {
    const lo = Math.max(0, Math.floor((g.time - half) / rmsFrameDuration))
    const hi = Math.min(rms.length - 1, Math.ceil((g.time + half) / rmsFrameDuration))
    let sum = 0
    let cnt = 0
    for (let i = lo; i <= hi; i++) {
      sum += rms[i]
      cnt++
    }
    return cnt ? sum / cnt : 0
  })
}

/** 取数组的分位数（用于把 RMS 门槛表达为相对值，跨曲可复用） */
export function percentileOf(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)))]
}

/**
 * 轨道分配。
 *
 * 手感规则（不能纯随机）：
 * 1. 避免与上一个音符同轨——同指连点难受，也容易被当成长按
 * 2. 双押的两个键必须分开，且优先选左右手各一个（0/1 与 2/3 分组），
 *    因为 4 键音游玩家通常左手 D/F、右手 J/K，跨手双押比同手舒服
 * 3. **长按期间该轨道被占用**：长按还没松手时，同一轨道不能再出音符——
 *    那在物理上无法完成（一根手指按着不动，同时又要在同一键上点击）。
 *    这是加长按后新增的硬约束，比前两条「手感偏好」严格得多。
 */
function assignLanes(
  actives: { time: number; chord: boolean; hold: number }[],
  lanes: number,
  rng: () => number,
): Note[] {
  const notes: Note[] = []
  let lastLanes: number[] = []
  let lastTime = -Infinity
  /** 每条轨道被长按占用到什么时候（秒）；-Infinity = 空闲 */
  const busyUntil = new Array<number>(lanes).fill(-Infinity)

  /**
   * 该轨道此刻可用吗？
   * 留 1ms 容差避免浮点误差把「刚好接上」误判为冲突。
   */
  const free = (lane: number, time: number) => busyUntil[lane] <= time + 0.001

  for (const { time, chord, hold } of actives) {
    const near = time - lastTime < 0.15
    // 长按不做双押：两根手指同时长按再各自松手，对休闲玩家太苛刻
    const wantChord = chord && hold <= 0
    const size = wantChord ? Math.min(2, lanes) : 1

    // 先排除被长按占用的轨道——这是硬约束，优先于所有手感偏好
    const available = Array.from({ length: lanes }, (_, l) => l).filter((l) => free(l, time))
    if (!available.length) {
      // 所有轨道都在长按中（极端情况）。丢弃这个音符而不是硬塞：
      // 塞进去会产出玩不了的谱面，漏一个音符只是可惜。
      lastTime = time
      continue
    }

    if (size === 2 && lanes >= 4) {
      // 跨手双押：左半区取一个，右半区取一个
      const mid = Math.floor(lanes / 2)
      let left = available.filter((l) => l < mid)
      let right = available.filter((l) => l >= mid)
      if (near) {
        const lf = left.filter((l) => !lastLanes.includes(l))
        const rf = right.filter((l) => !lastLanes.includes(l))
        if (lf.length) left = lf
        if (rf.length) right = rf
      }
      // 某一侧被长按占满时降级为单键，而不是在同侧硬凑两个
      if (left.length && right.length) {
        const a = left[Math.floor(rng() * left.length)]
        const b = right[Math.floor(rng() * right.length)]
        notes.push({ time, lane: a }, { time, lane: b })
        lastLanes = [a, b]
        lastTime = time
        continue
      }
    }

    // 单键（含双押降级的情况）
    let candidates = available
    if (near) {
      const filtered = candidates.filter((l) => !lastLanes.includes(l))
      if (filtered.length) candidates = filtered
    }
    const lane = candidates[Math.floor(rng() * candidates.length)]
    if (hold > 0) {
      notes.push({ time, lane, duration: hold })
      busyUntil[lane] = time + hold
    } else {
      notes.push({ time, lane })
    }
    lastLanes = [lane]
    lastTime = time
  }

  return notes
}

/**
 * 生成谱面。
 */
export function generateBeatmap(
  params: {
    songId: string
    title: string
    bpm: number
    offset: number
    duration: number
    /** 起音强度函数 */
    odf: Float32Array | number[]
    /** odf 的帧时长（秒） */
    frameDuration: number
  },
  options: GenerateOptions = {},
): Beatmap {
  const {
    lanes = 4,
    quantizeDivision = 2,
    targetDensity = 2.5,
    chordRatio = 0.15,
    // 12 秒 ≈ 4~6 个小节，比乐句略长：足够统计出局部强度分布，
    // 又不至于跨越「主歌→副歌」边界把两者混算成同一阈值。
    adaptiveWindow = 12,
    // 2.5：实测的取舍拐点。整拍填充率从 68.8%(bias=1) 升到 85.7%，
    // 代价只是所选点平均起音强度掉 3.8%（11.89→11.44，仍是网格中位数的 2 倍）。
    // 再往上到 4 只多 5 个点填充率，弱音符占比却从 14.4% 涨到 19.6%——
    // 那时候就开始「为了凑拍而打没声音的地方」了。
    beatBias = 2.5,
    // 2 秒 ≈ BPM 75 下的 2.5 拍。超过这个时长玩家就开始「掉出」节奏。
    maxSilence = 2,
    rms,
    rmsFrameDuration,
    holdRmsPercentile = 0.25,
    holdMinGrids = 2,
    holdMaxGrids = 8,
    seed = 20260730,
  } = options

  const { bpm, offset, duration, odf, frameDuration } = params

  const grid = buildGrid(odf, frameDuration, bpm, offset, duration, quantizeDivision)
  // 全局阈值仅作 meta 参考（实际选点是局部配额制）
  const threshold = thresholdForDensity(grid, duration, targetDensity)
  const floor = silenceFloorOf(grid)

  // 两段式：局部配额（含整拍偏置）→ 兜底长空档。
  // 顺序有讲究：先让密度均匀分布，剩下的空档才是真的没东西可打。
  let active = selectByQuota(grid, adaptiveWindow, targetDensity, quantizeDivision, beatBias, floor)
  active = fillLongSilences(grid, active, maxSilence, floor)

  // 双押：活跃点中强度最高的 chordRatio 比例
  let chordThreshold = Infinity
  if (chordRatio > 0 && active.length) {
    const sorted = active.map((a) => a.strength).sort((a, b) => b - a)
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * chordRatio)))
    chordThreshold = sorted[idx]
  }

  const actives = active.map((a) => ({ time: a.time, chord: a.strength >= chordThreshold }))
  const chordPoints = actives.filter((a) => a.chord).length

  // 长按检测（可选）：需要 RMS 才能区分「延音」与「静音」
  const gridStep = bpm > 0 ? 60 / bpm / quantizeDivision : 0
  let holds = new Map<number, number>()
  if (rms && rms.length && gridStep > 0) {
    const frameDur = rmsFrameDuration ?? frameDuration
    const gridRms = sampleGridRms(grid, rms, frameDur, gridStep)
    const rmsThreshold = percentileOf(gridRms, holdRmsPercentile)
    holds = detectHolds(grid, active, gridRms, gridStep, rmsThreshold, holdMinGrids, holdMaxGrids)
  }

  const rng = createRng(seed)
  const notes = assignLanes(
    actives.map((a) => ({ ...a, hold: holds.get(a.time) ?? 0 })),
    lanes,
    rng,
  )

  const holdNotes = notes.filter((n) => isHold(n)).length
  const holdTotalSec = notes.reduce((sum, n) => sum + (n.duration ?? 0), 0)

  // 诊断指标：直接暴露给 UI/测试，避免每次都要外挂脚本重算
  const chosenTimes = new Set(active.map((a) => a.time))
  const downbeats = grid.filter((_, i) => i % quantizeDivision === 0)
  const beatFillRate = downbeats.length
    ? downbeats.filter((d) => chosenTimes.has(d.time)).length / downbeats.length
    : 0
  let maxGap = 0
  // 只统计音符之间的空档，不含首尾。歌曲 intro/outro 的静音是正常留白，
  // 算进来会让指标失去意义（实测某曲首尾静音让 maxGap 报 10.29s，
  // 而真实的音符间最大空档只有 2s）。
  for (let i = 1; i < active.length; i++) {
    const gap = active[i].time - active[i - 1].time
    if (gap > maxGap) maxGap = gap
  }

  return {
    songId: params.songId,
    title: params.title,
    lanes,
    bpm,
    offset,
    duration,
    notes,
    meta: {
      quantizeDivision,
      gridPoints: grid.length,
      activePoints: active.length,
      chordPoints,
      holdNotes,
      holdTotalSec,
      threshold,
      beatFillRate,
      maxGap,
    },
  }
}

/** 谱面密度（音符/秒），用于难度提示 */
export function beatmapDensity(map: Beatmap): number {
  return map.duration > 0 ? map.notes.length / map.duration : 0
}

/** 按密度给出难度标签 */
export function difficultyLabel(density: number): string {
  if (density < 1.5) return 'Easy'
  if (density < 2.5) return 'Normal'
  if (density < 4) return 'Hard'
  return 'Expert'
}
