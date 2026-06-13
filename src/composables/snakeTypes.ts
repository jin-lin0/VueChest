/**
 * 贪吃蛇类型定义
 * 仅包含本地双人对战模式使用的接口
 */

export interface SnakeState {
  id: number
  body: { x: number; y: number }[]
  direction: string
  health: number
  alive: boolean
  length: number
}

export interface ItemState {
  type: string
  x: number
  y: number
}

export interface GameState {
  status: 'idle' | 'countdown' | 'playing' | 'finished'
  countdown: number
  tickInterval: number
  snakes: SnakeState[]
  items: ItemState[]
  winnerId: number | null
  winnerName: string | null
  stats: any[]
  tickCount: number
}
