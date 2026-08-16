// racing AI 对手：沿赛道中心线循迹 + 弯道减速 + 橡皮筋难度（落后加速、领先放水）。
import * as THREE from 'three'
import { RACING_AI } from './config'
import type { RacingCar } from './config'
import { queryTrack } from './track'
import type { PlayerData } from './types'

export interface AICarState {
  data: PlayerData
  mesh: THREE.Group
  car: RacingCar
  /** 行进方向上的随机横向偏移，让 AI 不走完全相同的赛车线 */
  laneOffset: number
  /** 0.85~1.0 的个体差异，避免 AI 扎堆 */
  paceFactor: number
}

export interface AIContext {
  points: THREE.Vector3[]
  checkpoints: THREE.Vector3[]
  delta: number
  totalLaps: number
  gameTime: number
  /** 玩家总进度（圈 * 分段数 + 分段内位置），用于橡皮筋 */
  playerProgress: number
}

/** 比赛进度（分段为单位）：圈数 * 分段数 + 当前分段 + 分段内参数。 */
export function raceProgress(points: THREE.Vector3[], data: PlayerData): number {
  const q = queryTrack(points, data.position.x, data.position.z)
  const n = points.length
  let p = q.segIndex + q.segParam
  // 起步线在分段 0，发车格在线后方（分段尾部），第一圈时视为负进度，
  // 否则刚起跑 AI 的"进度"会比玩家大，名次和橡皮筋都会算反
  if (data.currentLap === 1 && p > n / 2) p -= n
  return (data.currentLap - 1) * n + p
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/** 更新单个 AI：转向追踪前瞻点、按弯道缓急调速、检查点/圈数推进。 */
export function updateAI(ai: AICarState, ctx: AIContext): void {
  const d = ai.data
  if (d.finished) {
    // 完赛后缓慢滑行
    d.speed = Math.max(d.speed - 20 * ctx.delta, 0)
    d.position.x += Math.sin(d.rotation) * d.speed * ctx.delta
    d.position.z += Math.cos(d.rotation) * d.speed * ctx.delta
    ai.mesh.position.set(d.position.x, 0, d.position.z)
    ai.mesh.rotation.y = d.rotation
    return
  }

  const n = ctx.points.length
  const q = queryTrack(ctx.points, d.position.x, d.position.z)
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
  const handling = ai.car.handling / 100
  const maxTurn = RACING_AI.TURN_RATE * handling
  d.rotation += THREE.MathUtils.clamp(diff, -maxTurn * ctx.delta, maxTurn * ctx.delta)

  // 目标速度：弯道越急（diff 越大）越慢；橡皮筋按与玩家的进度差微调
  const maxSpeed = ai.car.speed / 5
  const curveRatio = THREE.MathUtils.clamp(1 - Math.abs(diff) * RACING_AI.CURVE_SLOWDOWN, RACING_AI.MIN_SPEED_RATIO, 1)
  let targetSpeed = maxSpeed * curveRatio * ai.paceFactor
  const gap = ctx.playerProgress - ((d.currentLap - 1) * n + q.segIndex + q.segParam)
  if (gap > RACING_AI.RUBBER_BAND_GAP) {
    targetSpeed *= RACING_AI.RUBBER_BAND_UP
  } else if (gap < -RACING_AI.RUBBER_BAND_GAP) {
    targetSpeed *= RACING_AI.RUBBER_BAND_DOWN
  }

  if (d.speed < targetSpeed) {
    d.speed = Math.min(d.speed + 22 * ctx.delta, targetSpeed)
  } else {
    d.speed = Math.max(d.speed - 45 * ctx.delta, targetSpeed)
  }

  d.position.x += Math.sin(d.rotation) * d.speed * ctx.delta
  d.position.z += Math.cos(d.rotation) * d.speed * ctx.delta

  // 偏离赛道过远时（被撞）向目标点回拉，保证 AI 永不卡死
  const newQ = queryTrack(ctx.points, d.position.x, d.position.z)
  if (newQ.dist > RACING_AI.MAX_OFF_TRACK) {
    d.position.x += (aimX - d.position.x) * 0.1
    d.position.z += (aimZ - d.position.z) * 0.1
  }

  ai.mesh.position.set(d.position.x, 0, d.position.z)
  ai.mesh.rotation.y = d.rotation

  // 检查点 & 圈数
  ctx.checkpoints.forEach((checkpoint, index) => {
    if (!d.checkpointsPassed[index]) {
      const dist = Math.hypot(d.position.x - checkpoint.x, d.position.z - checkpoint.z)
      if (dist < 15) d.checkpointsPassed[index] = true
    }
  })
  if (d.checkpointsPassed.every((cp) => cp)) {
    d.checkpointsPassed = new Array(ctx.checkpoints.length).fill(false)
    d.currentLap++
    if (d.currentLap > ctx.totalLaps) {
      d.finished = true
      d.finishTime = ctx.gameTime
    }
  }
}
