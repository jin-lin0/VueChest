import { reactive, computed } from 'vue'

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

export function useSnakeGameClient() {
  const state = reactive<GameState>({
    status: 'idle',
    countdown: 0,
    tickInterval: 200,
    snakes: [],
    items: [],
    winnerId: null,
    winnerName: null,
    stats: [],
    tickCount: 0,
  })

  /** 按玩家 ID 查找蛇 */
  const getSnake = (id: number) => state.snakes.find((s) => s.id === id)

  /** 当前玩家是否是胜者 */
  const isWinner = (playerId: number) =>
    state.winnerId !== null && state.winnerId === playerId

  /** 游戏是否进行中 */
  const isPlaying = computed(() => state.status === 'playing')

  /** 重置状态 */
  function reset() {
    state.status = 'idle'
    state.countdown = 0
    state.snakes = []
    state.items = []
    state.winnerId = null
    state.winnerName = null
    state.stats = []
    state.tickCount = 0
  }

  /** 处理服务端消息 */
  function handleMessage(msg: any) {
    switch (msg.type) {
      case 'countdown':
        state.status = 'countdown'
        state.countdown = msg.count
        break

      case 'game_start':
        state.status = 'playing'
        state.tickInterval = msg.tickInterval
        state.countdown = 0
        break

      case 'game_state':
        state.snakes = msg.snakes
        state.items = msg.items
        state.tickCount = msg.tick
        break

      case 'game_over':
        state.status = 'finished'
        state.winnerId = msg.winnerId
        state.winnerName = msg.winnerName
        state.stats = msg.stats
        state.tickCount = msg.tickCount
        break

      case 'game_stopped':
        state.status = 'finished'
        break
    }
  }

  /** 棋盘尺寸信息 */
  const boardSize = 19
  const cellPx = (canvasWidth: number) =>
    Math.floor(canvasWidth / boardSize)

  return {
    state,
    getSnake,
    isWinner,
    isPlaying,
    reset,
    handleMessage,
    boardSize,
    cellPx,
  }
}
