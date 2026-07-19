// racing 模块集中配置：赛车、漂移、赛道、计分等魔法数字统一在此管理。

export interface RacingCar {
  id: number
  name: string
  color: string
  speed: number
  handling: number
}

/** 4 辆赛车：速度(speed)/操控(handling) 与颜色。 */
export const RACING_CARS: RacingCar[] = [
  { id: 1, name: '闪电', color: '#ff4444', speed: 180, handling: 70 },
  { id: 2, name: '风暴', color: '#4444ff', speed: 160, handling: 90 },
  { id: 3, name: '烈焰', color: '#ffaa00', speed: 200, handling: 60 },
  { id: 4, name: '幻影', color: '#44ff44', speed: 170, handling: 85 },
]

/** 漂移相关参数。 */
export const RACING_DRIFT = {
  TURN_MULTIPLIER: 1.8, // 漂移时转向增强
  SPEED_RETENTION: 0.95, // 漂移时速度保持率
  EXIT_BOOST: 1.15, // 出弯时速度提升
  MAX_TIRE_MARKS: 200, // 最大轮胎痕迹数量
  TIRE_MARK_INTERVAL: 0.05, // 痕迹生成间隔（秒）
} as const

/** 赛道几何参数。 */
export const RACING_TRACK = {
  RADIUS: 80, // 赛道基础半径
  SEGMENTS: 60, // 赛道分段数
  WIDTH: 20, // 赛道宽度
  WALL_HEIGHT: 3, // 围墙高度
  CHECKPOINTS: 4, // 检查点数量
} as const

/**
 * 计分 / 速度相关常量。
 * - 氮气：临时 +50 速度，最大速度 ×2
 * - 导弹命中：目标速度 ×0.3，命中得分 +500
 * - 撞墙：速度 ×0.3
 * - 双车碰撞：双方速度 ×0.5
 * - 收集物：+100 × 连击(combo，上限 10)
 * - 漂移加速：+5 速度
 */
export const RACING_SCORE = {
  NITRO_SPEED_BONUS: 50,
  NITRO_MAX_SPEED_MULTIPLIER: 2,
  MISSILE_HIT_SPEED_MULTIPLIER: 0.3,
  MISSILE_HIT_SCORE: 500,
  WALL_HIT_SPEED_MULTIPLIER: 0.3,
  CAR_COLLISION_SPEED_MULTIPLIER: 0.5,
  COLLECTIBLE_BASE: 100,
  MAX_COMBO: 10,
  DRIFT_BOOST_SPEED: 5,
} as const
