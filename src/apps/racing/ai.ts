// racing AI 对手：沿赛道中心线循迹 + 弯道减速 + 橡皮筋难度（落后加速、领先放水）。
import * as THREE from 'three'
import { RACING_AI, RACING_DRIFT, RACING_PHYSICS } from './config'
import type { RacingCar } from './config'
import { isOutsideTrack, queryTrack, queryTrackRange, trackFrameAt, type TrackQuery } from './track'
import { isRacerActive, type PlayerData } from './types'
import type { Difficulty } from './game'
import { AI_DIFFICULTY, driftBoostMultiplier, driftLevel } from './rules'

export type AIPersonality = 'aggressive' | 'steady' | 'drifter' | 'sprinter'

export interface AICarState {
  data: PlayerData
  mesh: THREE.Group
  nitroFlame: THREE.Mesh
  car: RacingCar
  /** 行进方向上的随机横向偏移，让 AI 不走完全相同的赛车线 */
  laneOffset: number
  /** 0.85~1.0 的个体差异，避免 AI 扎堆 */
  paceFactor: number
  personality: AIPersonality
  isDrifting: boolean
  mistakeTimer: number
  itemCooldown: number
  stuckTimer: number
  lastProgress: number
  resetCooldown: number
}

export interface AIContext {
  points: THREE.Vector3[]
  checkpoints: THREE.Vector3[]
  delta: number
  totalLaps: number
  gameTime: number
  trackWidth: number
  allowTankNitro: boolean
  /** 玩家总进度（圈 * 分段数 + 分段内位置），用于橡皮筋 */
  playerProgress: number
  difficulty: Difficulty
  random?: () => number
}

/** 按当前检查点区间约束最近线段，避免相邻组合弯造成进度跳段。 */
function queryRaceSection(points: THREE.Vector3[], data: PlayerData) {
  const n = points.length
  const checkpointCount = Math.max(1, data.checkpointsPassed.length)
  const checkpointIndex = Math.min(data.checkpointIndex, checkpointCount - 1)
  const startIndex = Math.floor((checkpointIndex / checkpointCount) * n)
  const endIndex = Math.max(
    startIndex + 1,
    Math.floor(((checkpointIndex + 1) / checkpointCount) * n),
  )
  const sectionQuery = queryTrackRange(
    points,
    data.position.x,
    data.position.z,
    startIndex,
    endIndex,
  )

  // 发车格在起点后方：第一圈尚未通过首个检查点时允许落在末段，以负进度起跑。
  if (data.currentLap === 1 && checkpointIndex === 0) {
    const globalQuery = queryTrack(points, data.position.x, data.position.z)
    if (globalQuery.segIndex >= n - Math.ceil(n / checkpointCount)) return globalQuery
  }
  return sectionQuery
}

/** 比赛进度（分段为单位）：圈数 * 分段数 + 当前分段 + 分段内参数。 */
export function raceProgress(points: THREE.Vector3[], data: PlayerData): number {
  const q = queryRaceSection(points, data)
  const n = points.length
  let p = q.segIndex + q.segParam
  // 起步线在分段 0，发车格在线后方（分段尾部），第一圈时视为负进度，
  // 否则刚起跑 AI 的"进度"会比玩家大，名次和橡皮筋都会算反
  if (data.currentLap === 1 && data.checkpointIndex === 0 && p > n / 2) p -= n
  return (data.currentLap - 1) * n + p
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/** 放回当前检查点区间稍后方；不跨检查点，并追加与玩家相同的罚时。 */
function resetStuckAI(ai: AICarState, ctx: AIContext, query: TrackQuery): void {
  const d = ai.data
  const n = ctx.points.length
  const checkpointCount = Math.max(1, d.checkpointsPassed.length)
  const checkpointIndex = Math.min(d.checkpointIndex, checkpointCount - 1)
  const sectionStart = Math.floor((checkpointIndex / checkpointCount) * n)
  const isBehindStart = d.currentLap === 1 && checkpointIndex === 0 && query.segIndex > n / 2
  const safeIndex = isBehindStart
    ? (query.segIndex - 2 + n) % n
    : Math.max(sectionStart, query.segIndex - 2)
  const point = ctx.points[safeIndex]
  const frame = trackFrameAt(ctx.points, safeIndex)
  d.position = { x: point.x, z: point.z }
  d.rotation = Math.atan2(frame.dir.x, frame.dir.z)
  d.speed = 0
  d.driftCharge = 0
  d.boostUntil = 0
  d.penaltyTime += RACING_AI.RESET_PENALTY
  ai.isDrifting = false
  ai.stuckTimer = 0
  ai.lastProgress = (d.currentLap - 1) * n + safeIndex
  ai.resetCooldown = RACING_AI.RESET_COOLDOWN
  ai.mesh.position.set(point.x, 0, point.z)
  ai.mesh.rotation.y = d.rotation
  ai.nitroFlame.visible = false
}

/** 更新单个 AI：转向追踪前瞻点、按弯道缓急调速、检查点/圈数推进。 */
export function updateAI(ai: AICarState, ctx: AIContext): void {
  const d = ai.data
  if (d.shieldHits > 0 && d.shieldUntil > 0 && ctx.gameTime >= d.shieldUntil) {
    d.shieldHits = 0
    d.shieldUntil = 0
  }
  if (d.eliminated) {
    d.speed = 0
    ai.mesh.visible = false
    ai.nitroFlame.visible = false
    return
  }
  if (d.finished) {
    // 完赛后缓慢滑行
    d.speed = Math.max(d.speed - 20 * ctx.delta, 0)
    d.position.x += Math.sin(d.rotation) * d.speed * ctx.delta
    d.position.z += Math.cos(d.rotation) * d.speed * ctx.delta
    ai.mesh.position.set(d.position.x, 0, d.position.z)
    ai.mesh.rotation.y = d.rotation
    ai.nitroFlame.visible = false
    return
  }
  if (!isRacerActive(d)) return

  const n = ctx.points.length
  const q = queryRaceSection(ctx.points, d)
  const targetIndex = (q.segIndex + RACING_AI.LOOKAHEAD) % n
  const target = ctx.points[targetIndex]
  const next = ctx.points[(targetIndex + 1) % n]
  const dirX = next.x - target.x
  const dirZ = next.z - target.z
  const len = Math.hypot(dirX, dirZ) || 1
  // 前瞻点加上横向偏移（法向 (-dz, dx)）
  const aimX = target.x + (-dirZ / len) * ai.laneOffset
  const aimZ = target.z + (dirX / len) * ai.laneOffset

  // 转向：朝目标点修正 heading
  const desired = Math.atan2(aimX - d.position.x, aimZ - d.position.z)
  const diff = wrapAngle(desired - d.rotation)
  const profile = AI_DIFFICULTY[ctx.difficulty]
  const personalityHandling =
    ai.personality === 'drifter' ? 1.12 : ai.personality === 'sprinter' ? 0.94 : 1
  const handling = (ai.car.handling / 100) * personalityHandling
  const baseMaxSpeed = ai.car.speed / 5

  const current = ctx.points[q.segIndex]
  const currentNext = ctx.points[(q.segIndex + 1) % n]
  const currentHeading = Math.atan2(currentNext.x - current.x, currentNext.z - current.z)
  const futureHeading = Math.atan2(next.x - target.x, next.z - target.z)
  const cornerAngle = Math.abs(wrapAngle(futureHeading - currentHeading))
  const baseDriftThreshold =
    ctx.difficulty === 'expert' ? 0.22 : ctx.difficulty === 'standard' ? 0.3 : 0.42
  const driftThreshold = baseDriftThreshold - (ai.personality === 'drifter' ? 0.06 : 0)
  const wasDrifting = ai.isDrifting
  ai.isDrifting =
    cornerAngle >= driftThreshold && d.speed > RACING_DRIFT.MIN_DRIFT_SPEED && ai.mistakeTimer <= 0

  if (wasDrifting && !ai.isDrifting) {
    const level = driftLevel(d.driftCharge)
    d.speed = Math.min(d.speed * driftBoostMultiplier(level), baseMaxSpeed * 1.2)
    d.driftCharge = 0
  }

  const itemBoosting = d.boostUntil > ctx.gameTime
  const tankBoosting =
    ctx.allowTankNitro &&
    !ai.isDrifting &&
    cornerAngle < 0.14 &&
    d.speed > baseMaxSpeed * 0.65 &&
    d.nitro > 0
  if (tankBoosting) {
    d.nitro = Math.max(0, d.nitro - RACING_DRIFT.NITRO_DRAIN_RATE * ai.car.nitroDrain * ctx.delta)
  }
  const boosting = itemBoosting || tankBoosting
  const allowedMaxSpeed = baseMaxSpeed * (boosting ? RACING_DRIFT.BOOST_MAX_SPEED_MULTIPLIER : 1)
  const speedRatio = THREE.MathUtils.clamp(Math.abs(d.speed) / allowedMaxSpeed, 0, 1)
  if (ai.isDrifting) {
    const driftIntensity = ai.car.driftGain * Math.max(0.35, speedRatio)
    d.driftCharge = Math.min(
      100,
      d.driftCharge + RACING_DRIFT.CHARGE_RATE * driftIntensity * ctx.delta,
    )
    if (ctx.allowTankNitro) {
      d.nitro = Math.min(
        ai.car.nitroCapacity,
        d.nitro + RACING_DRIFT.NITRO_GAIN_RATE * driftIntensity * ctx.delta,
      )
    }
  }

  // 与玩家相同：高速时转向能力衰减；急弯漂移时才获得漂移转向倍率。
  const maxTurn =
    RACING_PHYSICS.STEER_RATE *
    handling *
    (1 - RACING_PHYSICS.STEER_SPEED_LOSS * speedRatio) *
    (ai.isDrifting ? RACING_DRIFT.TURN_MULTIPLIER : 1)
  d.rotation += THREE.MathUtils.clamp(diff, -maxTurn * ctx.delta, maxTurn * ctx.delta)

  // 跟踪误差只做较小修正，避免 AI 因前瞻走线而在普通弯道过度刹车。
  const curvePressure = Math.max(cornerAngle, Math.abs(diff) * 0.35)
  const curveRatio = THREE.MathUtils.clamp(
    1 - curvePressure * (ai.isDrifting ? 0.28 : RACING_AI.CURVE_SLOWDOWN),
    ai.isDrifting ? 0.72 : RACING_AI.MIN_SPEED_RATIO,
    1,
  )
  const personalityPace =
    ai.personality === 'sprinter' ? 1.04 : ai.personality === 'steady' ? 0.99 : 1
  let targetSpeed = allowedMaxSpeed * curveRatio * ai.paceFactor * profile.pace * personalityPace
  const gap = ctx.playerProgress - ((d.currentLap - 1) * n + q.segIndex + q.segParam)
  const inFinalSegment = d.currentLap >= ctx.totalLaps && q.segIndex >= n - RACING_AI.LOOKAHEAD * 2
  if (!inFinalSegment && gap > profile.rubberGap) {
    targetSpeed *= profile.catchUp
  } else if (!inFinalSegment && gap < -profile.rubberGap) {
    targetSpeed *= profile.leadSlowdown
  }
  // 难度与橡皮筋只影响 AI 愿意跑多接近车辆极限，不再突破车辆极速。
  targetSpeed = Math.min(targetSpeed, allowedMaxSpeed)

  ai.mistakeTimer = Math.max(0, ai.mistakeTimer - ctx.delta)
  if (
    ai.mistakeTimer <= 0 &&
    Math.abs(diff) > 0.35 &&
    (ctx.random?.() ?? Math.random()) < profile.mistakeChance * ctx.delta
  ) {
    ai.mistakeTimer = 0.45
  }
  if (ai.mistakeTimer > 0) targetSpeed *= 0.72

  if (ai.isDrifting) {
    d.speed *= Math.pow(RACING_DRIFT.SPEED_RETENTION, ctx.delta * 60)
  }
  if (d.speed < targetSpeed) {
    const accelFactor = 1 - 0.7 * THREE.MathUtils.clamp(d.speed / allowedMaxSpeed, 0, 1)
    d.speed = Math.min(d.speed + ai.car.acceleration * accelFactor * ctx.delta, targetSpeed)
  } else if (!ai.isDrifting) {
    d.speed = Math.max(d.speed - RACING_PHYSICS.BRAKE_DECEL * ctx.delta, targetSpeed)
  }

  // 与玩家共用同一条赛道边界和同一套“全量移动→单轴滑动→正面阻挡”规则。
  const moveX = Math.sin(d.rotation) * d.speed * ctx.delta
  const moveZ = Math.cos(d.rotation) * d.speed * ctx.delta
  const oldX = d.position.x
  const oldZ = d.position.z
  if (!isOutsideTrack(ctx.points, oldX + moveX, oldZ + moveZ, ctx.trackWidth)) {
    d.position.x = oldX + moveX
    d.position.z = oldZ + moveZ
  } else if (!isOutsideTrack(ctx.points, oldX + moveX, oldZ, ctx.trackWidth)) {
    d.position.x = oldX + moveX
    d.speed *= Math.pow(RACING_PHYSICS.WALL_SLIDE_KEEP, ctx.delta * 60)
  } else if (!isOutsideTrack(ctx.points, oldX, oldZ + moveZ, ctx.trackWidth)) {
    d.position.z = oldZ + moveZ
    d.speed *= Math.pow(RACING_PHYSICS.WALL_SLIDE_KEEP, ctx.delta * 60)
  } else {
    d.speed *= RACING_PHYSICS.WALL_BLOCK_KEEP
  }

  // 以检查点约束后的赛道进度判断卡死，避免原地转圈或沿错误墙面缓慢蠕动逃过检测。
  const progressQuery = queryRaceSection(ctx.points, d)
  let progress = (d.currentLap - 1) * n + progressQuery.segIndex + progressQuery.segParam
  if (d.currentLap === 1 && d.checkpointIndex === 0 && progressQuery.segIndex > n / 2) {
    progress -= n
  }
  ai.resetCooldown = Math.max(0, ai.resetCooldown - ctx.delta)
  if (!Number.isFinite(ai.lastProgress)) {
    ai.lastProgress = progress
  } else if (ai.resetCooldown > 0) {
    ai.lastProgress = progress
    ai.stuckTimer = 0
  } else if (progress >= ai.lastProgress + RACING_AI.MIN_PROGRESS_DELTA) {
    ai.lastProgress = progress
    ai.stuckTimer = 0
  } else if (targetSpeed > RACING_DRIFT.MIN_DRIFT_SPEED) {
    ai.stuckTimer += ctx.delta
  } else {
    ai.stuckTimer = Math.max(0, ai.stuckTimer - ctx.delta)
  }
  if (ai.stuckTimer >= RACING_AI.STUCK_TIMEOUT) {
    resetStuckAI(ai, ctx, progressQuery)
    return
  }

  ai.mesh.position.set(d.position.x, 0, d.position.z)
  const driftVisual = ai.isDrifting ? THREE.MathUtils.clamp(diff, -0.32, 0.32) : 0
  ai.mesh.rotation.y = d.rotation - driftVisual
  ai.nitroFlame.visible = boosting

  // 检查点 & 圈数
  const checkpoint = ctx.checkpoints[d.checkpointIndex]
  if (checkpoint) {
    const dist = Math.hypot(d.position.x - checkpoint.x, d.position.z - checkpoint.z)
    if (dist < 15) {
      d.checkpointsPassed[d.checkpointIndex] = true
      d.checkpointIndex++
    }
  }
  if (d.checkpointIndex >= ctx.checkpoints.length) {
    d.checkpointsPassed = new Array(ctx.checkpoints.length).fill(false)
    d.checkpointIndex = 0
    d.currentLap++
    if (d.currentLap > ctx.totalLaps) {
      d.finished = true
      d.finishTime = ctx.gameTime + d.penaltyTime
    }
  }
}
