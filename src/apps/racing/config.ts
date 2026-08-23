// racing 模块集中配置：赛车、物理、漂移、AI、相机、计分等魔法数字统一在此管理。

export interface RacingCar {
  id: number
  name: string
  color: string
  speed: number
  handling: number
  acceleration: number
  nitroCapacity: number
  nitroDrain: number
  driftGain: number
  perfectStartWindow: number
  perk: string
}

/** 4 辆赛车：速度(speed)/操控(handling) 与颜色。 */
export const RACING_CARS: RacingCar[] = [
  {
    id: 1,
    name: '闪电',
    color: '#ff5b5b',
    speed: 180,
    handling: 74,
    acceleration: 26,
    nitroCapacity: 100,
    nitroDrain: 1,
    driftGain: 1,
    perfectStartWindow: 0.19,
    perk: '均衡稳定，完美起步窗口更宽',
  },
  {
    id: 2,
    name: '风暴',
    color: '#5b7cff',
    speed: 166,
    handling: 92,
    acceleration: 27,
    nitroCapacity: 95,
    nitroDrain: 1,
    driftGain: 1.24,
    perfectStartWindow: 0.15,
    perk: '连续弯漂移蓄力提升 24%',
  },
  {
    id: 3,
    name: '烈焰',
    color: '#ffad32',
    speed: 200,
    handling: 62,
    acceleration: 22,
    nitroCapacity: 100,
    nitroDrain: 1.05,
    driftGain: 0.94,
    perfectStartWindow: 0.15,
    perk: '直线极速最高，起步与急弯更难控制',
  },
  {
    id: 4,
    name: '幻影',
    color: '#52e39b',
    speed: 175,
    handling: 84,
    acceleration: 25,
    nitroCapacity: 125,
    nitroDrain: 0.82,
    driftGain: 1.06,
    perfectStartWindow: 0.15,
    perk: '氮气容量更大，持续时间更长',
  },
]

/**
 * 驾驶物理参数（单位：赛道单位/秒，HUD 显示 km/h = 内部速度 × 5）。
 * 加速采用接近极速衰减的曲线，避免"一脚油门瞬间满速"的平淡手感。
 */
export const RACING_PHYSICS = {
  ACCEL: 26, // 基础加速度
  COAST_DECEL: 10, // 松油门滑行减速
  BRAKE_DECEL: 60, // 刹车减速度
  REVERSE_MAX_RATIO: 0.35, // 倒车极速 = 极速 × 该比例
  STEER_RATE: 3.0, // 基础转向角速度（rad/s）
  STEER_SPEED_LOSS: 0.55, // 高速转向衰减比例（速度越快转向越钝）
  MIN_STEER_SPEED: 1, // 低于该速度无法转向（禁止原地掉头）
  WALL_SLIDE_KEEP: 0.92, // 蹭墙滑行时的速度保持率（每帧 60fps 基准）
  WALL_BLOCK_KEEP: 0.45, // 正面撞死时的速度保持率
  CRASH_SPEED_THRESHOLD: 8, // 触发撞车音效/火花的相对速度
} as const

/** 漂移相关参数。 */
export const RACING_DRIFT = {
  TURN_MULTIPLIER: 1.8, // 漂移时转向增强
  SPEED_RETENTION: 0.997, // 漂移时速度保持率（每帧 60fps 基准，≈每秒保留 84%）
  MIN_DRIFT_SPEED: 8, // 进入漂移的最低速度
  CHARGE_RATE: 55, // 漂移等级蓄力；组合弯可到 GREAT，长弯可到 PERFECT
  NITRO_GAIN_RATE: 22, // 满速漂移每秒直接获得的氮气
  NITRO_DRAIN_RATE: 26, // 常规氮气每秒消耗，车辆 nitroDrain 再做个性修正
  ITEM_BOOST_DURATION: 2.4, // 道具赛“涡轮冲刺”持续时间
  BOOST_MAX_SPEED_MULTIPLIER: 1.35,
  MAX_TIRE_MARKS: 200, // 最大轮胎痕迹数量
  TIRE_MARK_INTERVAL: 0.05, // 痕迹生成间隔（秒）
} as const

/** 赛道几何参数。 */
export const RACING_TRACK = {
  RADIUS: 80, // 赛道基础半径
  SEGMENTS: 60, // 赛道分段数
  WIDTH: 20, // 赛道宽度
  WALL_HEIGHT: 2.5, // 围墙高度
  CHECKPOINTS: 4, // 检查点数量
} as const

/** AI 对手参数（单人模式）。 */
export const RACING_AI = {
  COUNT: 3, // AI 数量
  LOOKAHEAD: 3, // 前瞻分段数（越大走线越平滑）
  CURVE_SLOWDOWN: 0.72, // 非漂移弯道减速系数
  MIN_SPEED_RATIO: 0.52, // 非漂移弯中最低速度比例
  RUBBER_BAND_GAP: 18, // 橡皮筋触发进度差（分段）
  RUBBER_BAND_UP: 1.12, // 落后玩家时的提速
  RUBBER_BAND_DOWN: 0.9, // 领先玩家时的放水
  STUCK_TIMEOUT: 3, // 持续无有效进度达到该秒数后自动复位
  RESET_COOLDOWN: 4, // 复位后的检测宽限期
  RESET_PENALTY: 2.5, // 与玩家手动复位相同的罚时
  MIN_PROGRESS_DELTA: 0.15, // 视为有效前进的最小赛道分段进度
} as const

/** 跟随相机参数。 */
export const RACING_CAMERA = {
  FOV_BASE: 72,
  FOV_BOOST: 16, // 全速时的 FOV 增量（速度感）
  OFFSET_Y: 5.5,
  OFFSET_BACK: 11,
  LOOK_AHEAD: 6,
  LERP_RATE: 6, // 位置平滑速率（每秒）
  SHAKE_DECAY: 3.5, // 碰撞震动衰减（每秒）
  SHAKE_MAX: 0.6,
} as const

/**
 * 计分 / 技能相关常量。
 * - 氮气：临时 +50 速度，最大速度 ×2
 * - 导弹命中：目标速度 ×0.3，命中得分 +500
 * - 双车碰撞：双方速度 ×0.7
 * - 收集物：+100 × 连击(combo，上限 10)
 * - 漂移加速：+5 速度
 */
export const RACING_SCORE = {
  NITRO_SPEED_BONUS: 50,
  NITRO_MAX_SPEED_MULTIPLIER: 2,
  MISSILE_HIT_SPEED_MULTIPLIER: 0.3,
  MISSILE_HIT_SCORE: 500,
  CAR_COLLISION_SPEED_MULTIPLIER: 0.7,
  COLLECTIBLE_BASE: 100,
  MAX_COMBO: 10,
  DRIFT_BOOST_SPEED: 5,
} as const
