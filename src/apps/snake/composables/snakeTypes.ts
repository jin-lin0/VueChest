/**
 * 贪吃蛇类型与共享常量定义
 * 本地双人对战 / 人机对战共用。
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

/** 单局结算时的玩家统计项（替换原来的 any[]） */
export interface StatItem {
  playerId: number
  name: string
  length: number
  health: number
  alive: boolean
}

export interface GameState {
  status: 'idle' | 'countdown' | 'playing' | 'finished'
  countdown: number
  tickInterval: number
  snakes: SnakeState[]
  items: ItemState[]
  winnerId: number | null
  winnerName: string | null
  stats: StatItem[]
  tickCount: number
}

/** 棋盘边长（格子数） */
export const BOARD_SIZE = 19

/** 方向向量 */
export const DIR_VEC: Record<string, { x: number; y: number }> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

/** 方向列表（AI 寻路 / 安全方向枚举用） */
export const DIRS: string[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']

/** 键盘按键 → 方向映射 */
export const DIR_MAP_WASD: Record<string, string> = {
  w: 'UP',
  a: 'LEFT',
  s: 'DOWN',
  d: 'RIGHT',
}
export const DIR_MAP_ARROWS: Record<string, string> = {
  arrowup: 'UP',
  arrowleft: 'LEFT',
  arrowdown: 'DOWN',
  arrowright: 'RIGHT',
}

/** 玩家配色（含头/身/描边），消除多处重复的颜色魔法值 */
export interface PlayerColorSet {
  head: string
  body: string
  outline: string
}
export const PLAYER_COLORS: Record<number, PlayerColorSet> = {
  1: { head: '#4CAF50', body: '#66BB6A', outline: '#2E7D32' },
  2: { head: '#f44336', body: '#ef5350', outline: '#c62828' },
  3: { head: '#2196F3', body: '#42A5F5', outline: '#1565C0' },
  4: { head: '#FF9800', body: '#FFB74D', outline: '#E65100' },
}

/** 对战难度（仅人机模式使用） */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** 玩家配置（仅本地双人模式使用） */
export interface LocalPlayerConfig {
  id: number
  name: string
  color: string
  startPos: { x: number; y: number }
  startDir: string
  keys: string[]
}
