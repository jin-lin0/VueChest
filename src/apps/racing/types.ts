// racing 模块共享类型（App.vue 与 ai.ts 等子模块共用，避免互相引入组件内部定义）。

/** 单个赛车（玩家或 AI）的比赛状态。 */
export interface PlayerData {
  position: { x: number; z: number }
  rotation: number
  speed: number
  currentLap: number
  checkpointIndex: number
  finishTime: number
  checkpointsPassed: boolean[]
  /** 本圈起跑时刻（gameTime 秒） */
  lapStartTime: number
  /** 上一圈用时（秒，0 = 暂无） */
  lastLapTime: number
  /** 最佳圈速（秒，0 = 暂无） */
  bestLapTime: number
  /** 是否已完赛 */
  finished: boolean
}

export function createPlayerData(): PlayerData {
  return {
    position: { x: 0, z: 0 },
    rotation: 0,
    speed: 0,
    currentLap: 1,
    checkpointIndex: 0,
    finishTime: 0,
    checkpointsPassed: [],
    lapStartTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    finished: false,
  }
}

/** 重置一场比赛所需的玩家状态（保留对象引用以维持响应式）。 */
export function resetPlayerData(data: PlayerData, x: number, z: number, rotation: number, checkpointCount: number): void {
  data.position = { x, z }
  data.rotation = rotation
  data.speed = 0
  data.currentLap = 1
  data.checkpointIndex = 0
  data.finishTime = 0
  data.checkpointsPassed = new Array(checkpointCount).fill(false)
  data.lapStartTime = 0
  data.lastLapTime = 0
  data.bestLapTime = 0
  data.finished = false
}
