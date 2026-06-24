import { reactive, ref, onUnmounted } from 'vue'
import type { SnakeState, ItemState, GameState } from './snakeTypes'

const BOARD_SIZE = 19
const INITIAL_HEALTH = 100
const TICK_MS = 100
const GRACE_TICKS = 15 // 开局无敌帧数
const SUPPLY_HEAL = 20
const SPIDER_DAMAGE = 20
const WALL_DAMAGE = 50 // 撞墙扣血
const BODY_DAMAGE = 50 // 撞蛇身扣血
const SUPPLY_SPAWN_INTERVAL = 10 // 每 10 tick（3秒）尝试刷一个补给
const SPIDER_SPAWN_INTERVAL = 15 // 每 15 tick（4.5秒）尝试刷一个毒蜘蛛
const MAX_SUPPLY_ON_BOARD = 3 // 场上最多 3 个补给
const MAX_SPIDER_ON_BOARD = 2 // 场上最多 2 个毒蜘蛛
const BIG_SUPPLY_SPAWN_INTERVAL = 20 // 每 20 tick（6秒）尝试刷一个大血包
const MAX_BIG_SUPPLY_ON_BOARD = 1 // 场上最多 1 个大血包
const INVINCIBLE_TICKS = 3 // 受伤后无敌帧数

/** 方向向量 */
const DIR_VEC: Record<string, { x: number; y: number }> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

/** 相反方向 */
function isOpposite(a: string, b: string): boolean {
  return (
    (a === 'UP' && b === 'DOWN') ||
    (a === 'DOWN' && b === 'UP') ||
    (a === 'LEFT' && b === 'RIGHT') ||
    (a === 'RIGHT' && b === 'LEFT')
  )
}

/** 在空格子上随机位置 */
function randomEmptyCell(occupied: Set<string>): { x: number; y: number } | null {
  const empty: { x: number; y: number }[] = []
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) empty.push({ x, y })
    }
  }
  if (empty.length === 0) return null
  return empty[Math.floor(Math.random() * empty.length)]
}

export interface LocalPlayerConfig {
  id: number
  name: string
  color: string
  startPos: { x: number; y: number }
  startDir: string
  keys: string[] // 键盘按键列表
}

export function useSnakeLocalGame() {
  const state = reactive<GameState>({
    status: 'idle',
    countdown: 0,
    tickInterval: TICK_MS,
    snakes: [],
    items: [],
    winnerId: null,
    winnerName: null,
    stats: [],
    tickCount: 0,
  })

  let gameTimer: ReturnType<typeof setInterval> | null = null
  let graceTimer: number = 0
  let supplySpawnTimer: number = 0 // 补给刷新计时器（tick 数）
  let spiderSpawnTimer: number = 0 // 毒蜘蛛刷新计时器（tick 数）
  let bigSupplySpawnTimer: number = 0 // 大血包刷新计时器（tick 数）
  const playerConfigs: LocalPlayerConfig[] = []
  const p1Wins = ref(0)
  const p2Wins = ref(0)
  const invincibleTimers: Map<number, number> = new Map() // 受伤无敌计时器（剩余帧数）

  /** 所有被占据的格子（两条蛇的身体） */
  function getOccupied(): Set<string> {
    const set = new Set<string>()
    for (const s of state.snakes) {
      for (const b of s.body) set.add(`${b.x},${b.y}`)
    }
    return set
  }

  /** 初始化两条蛇 */
  function initSnakes() {
    // 初始化无敌计时器
    invincibleTimers.set(1, 0)
    invincibleTimers.set(2, 0)

    state.snakes = [
      {
        id: 1,
        body: [
          { x: 2, y: 2 },
          { x: 1, y: 2 },
          { x: 0, y: 2 },
        ],
        direction: 'RIGHT',
        health: INITIAL_HEALTH,
        alive: true,
        length: 3,
      },
      {
        id: 2,
        body: [
          { x: 16, y: 16 },
          { x: 17, y: 16 },
          { x: 18, y: 16 },
        ],
        direction: 'LEFT',
        health: INITIAL_HEALTH,
        alive: true,
        length: 3,
      },
    ]
  }

  /**
   * 固定间隔刷新物品
   * - 补给：每 SUPPLY_SPAWN_INTERVAL tick 尝试刷 1 个，场上最多 MAX_SUPPLY_ON_BOARD 个
   * - 毒蜘蛛：每 SPIDER_SPAWN_INTERVAL tick 尝试刷 1 个，场上最多 MAX_SPIDER_ON_BOARD 个
   */
  function spawnItems() {
    const occupied = getOccupied()
    const supplyCount = state.items.filter((i) => i.type === 'supply').length
    const spiderCount = state.items.filter((i) => i.type === 'spider').length

    // 补给计时
    supplySpawnTimer++
    if (supplySpawnTimer >= SUPPLY_SPAWN_INTERVAL && supplyCount < MAX_SUPPLY_ON_BOARD) {
      const pos = randomEmptyCell(occupied)
      if (pos) {
        state.items.push({ type: 'supply', x: pos.x, y: pos.y })
        occupied.add(`${pos.x},${pos.y}`)
        supplySpawnTimer = 0 // 刷出一个后重置计时
      }
    }

    // 毒蜘蛛计时
    spiderSpawnTimer++
    if (spiderSpawnTimer >= SPIDER_SPAWN_INTERVAL && spiderCount < MAX_SPIDER_ON_BOARD) {
      const pos = randomEmptyCell(occupied)
      if (pos) {
        state.items.push({ type: 'spider', x: pos.x, y: pos.y })
        spiderSpawnTimer = 0
      }
    }

    // 大血包计时（稀有物品，回满血）
    const bigSupplyCount = state.items.filter((i) => i.type === 'big_supply').length
    bigSupplySpawnTimer++
    if (
      bigSupplySpawnTimer >= BIG_SUPPLY_SPAWN_INTERVAL &&
      bigSupplyCount < MAX_BIG_SUPPLY_ON_BOARD
    ) {
      const pos = randomEmptyCell(occupied)
      if (pos) {
        state.items.push({ type: 'big_supply', x: pos.x, y: pos.y })
        bigSupplySpawnTimer = 0
      }
    }
  }

  /** 移动蛇，返回碰撞结果 */
  function moveSnake(
    snake: SnakeState,
    allSnakes: SnakeState[],
  ): { died: boolean; tookDamage: boolean } {
    const vec = DIR_VEC[snake.direction]
    if (!vec) return { died: false, tookDamage: false }

    const head = snake.body[0]
    const newHead = { x: head.x + vec.x, y: head.y + vec.y }

    // 检查是否处于受伤无敌状态
    const invincible = (invincibleTimers.get(snake.id) || 0) > 0

    // 撞墙检测
    const wallHit =
      newHead.x < 0 || newHead.x >= BOARD_SIZE || newHead.y < 0 || newHead.y >= BOARD_SIZE
    // 撞自己身体检测
    const bodyWithoutTail = snake.body.slice(0, snake.body.length - 1)
    let selfHit = false
    for (const b of bodyWithoutTail) {
      if (b.x === newHead.x && b.y === newHead.y) {
        selfHit = true
        break
      }
    }
    // 撞对方身体检测
    let otherHit = false
    for (const other of allSnakes) {
      if (other.id === snake.id || !other.alive) continue
      for (const b of other.body) {
        if (b.x === newHead.x && b.y === newHead.y) {
          otherHit = true
          break
        }
      }
      if (otherHit) break
    }

    const hasCollision = wallHit || selfHit || otherHit

    if (hasCollision) {
      if (invincible) {
        // 无敌状态：可以穿越障碍物，正常移动
        // 穿墙时从另一侧出现
        const wrappedHead = { ...newHead }
        if (wrappedHead.x < 0) wrappedHead.x = BOARD_SIZE - 1
        if (wrappedHead.x >= BOARD_SIZE) wrappedHead.x = 0
        if (wrappedHead.y < 0) wrappedHead.y = BOARD_SIZE - 1
        if (wrappedHead.y >= BOARD_SIZE) wrappedHead.y = 0
        snake.body.unshift(wrappedHead)
        if (snake.body.length > snake.length) snake.body.pop()
        return { died: false, tookDamage: false }
      }
      // 非无敌状态：扣血
      const damage = wallHit ? WALL_DAMAGE : BODY_DAMAGE
      snake.health -= damage
      // 设置无敌帧
      invincibleTimers.set(snake.id, INVINCIBLE_TICKS)
      if (snake.health <= 0) {
        snake.alive = false
        return { died: true, tookDamage: true }
      }
      // 未死亡，停在原地（不移动）
      return { died: false, tookDamage: true }
    }

    // 正常移动（无碰撞）
    snake.body.unshift(newHead)
    if (snake.body.length > snake.length) {
      snake.body.pop()
    }

    return { died: false, tookDamage: false }
  }

  /** 检查头碰头 */
  function checkHeadToHead() {
    const alive = state.snakes.filter((s) => s.alive)
    if (alive.length < 2) return

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i]
        const b = alive[j]
        const ah = a.body[0]
        const bh = b.body[0]
        if (ah.x === bh.x && ah.y === bh.y) {
          // 头碰头：长度短的死，一样长都死
          if (a.length > b.length) {
            b.alive = false
          } else if (b.length > a.length) {
            a.alive = false
          } else {
            a.alive = false
            b.alive = false
          }
        }
      }
    }
  }

  /** 检查吃物品 */
  function checkItems(snake: SnakeState) {
    const head = snake.body[0]
    const idx = state.items.findIndex((it) => it.x === head.x && it.y === head.y)
    if (idx === -1) return

    const item = state.items[idx]
    state.items.splice(idx, 1)

    if (item.type === 'supply') {
      snake.health = Math.min(INITIAL_HEALTH, snake.health + SUPPLY_HEAL)
      snake.length += 1
    } else if (item.type === 'spider') {
      snake.health -= SPIDER_DAMAGE
      snake.length += 1
    } else if (item.type === 'big_supply') {
      snake.health = INITIAL_HEALTH // 回满血
      snake.length += 2
    }
  }

  /** 游戏 tick */
  function tick() {
    if (state.status !== 'playing') return
    state.tickCount++

    //  grace period: 前 N 帧不扣血、不检测碰撞
    if (graceTimer < GRACE_TICKS) {
      graceTimer++
    }

    // 移动每条蛇
    const deadIds: number[] = []
    for (const s of state.snakes) {
      if (!s.alive) continue
      if (graceTimer >= GRACE_TICKS) {
        const result = moveSnake(s, state.snakes)
        if (result.died) {
          deadIds.push(s.id)
        }
        // 如果 result.tookDamage 为 true 但 result.died 为 false
        // 说明扣血了但未死亡，蛇停在原地（moveSnake 里没有执行移动逻辑）
      } else {
        // grace 期间只移动不检测碰撞
        const vec = DIR_VEC[s.direction]
        if (vec) {
          const head = s.body[0]
          const newHead = { x: head.x + vec.x, y: head.y + vec.y }
          if (
            newHead.x >= 0 &&
            newHead.x < BOARD_SIZE &&
            newHead.y >= 0 &&
            newHead.y < BOARD_SIZE
          ) {
            s.body.unshift(newHead)
            if (s.body.length > s.length) s.body.pop()
          }
        }
      }

      if (s.alive) {
        // 扣血
        s.health--
        // 吃物品
        checkItems(s)
        // 血量为 0 死亡
        if (s.health <= 0) {
          s.alive = false
          deadIds.push(s.id)
        }
      }
    }

    // 头碰头检测
    if (graceTimer >= GRACE_TICKS) {
      checkHeadToHead()
    }

    // 递减受伤无敌计时器
    for (const s of state.snakes) {
      const t = invincibleTimers.get(s.id) || 0
      if (t > 0) invincibleTimers.set(s.id, t - 1)
    }

    // 生成物品
    spawnItems()

    // 判断游戏结束
    const alive = state.snakes.filter((s) => s.alive)
    if (alive.length <= 1) {
      endGame()
    }
  }

  /** 游戏结束 */
  function endGame() {
    state.status = 'finished'
    clearInterval(gameTimer!)
    gameTimer = null

    const alive = state.snakes.filter((s) => s.alive)
    if (alive.length === 1) {
      state.winnerId = alive[0].id
      state.winnerName =
        playerConfigs.find((p) => p.id === alive[0].id)?.name || `玩家${alive[0].id}`
      // 记录胜场
      if (state.winnerId === 1) p1Wins.value++
      else if (state.winnerId === 2) p2Wins.value++
    } else {
      state.winnerId = null
      state.winnerName = null
    }

    state.stats = state.snakes.map((s) => ({
      playerId: s.id,
      name: playerConfigs.find((p) => p.id === s.id)?.name || `玩家${s.id}`,
      length: s.length,
      health: s.health,
      alive: s.alive,
    }))
  }

  /** 开始游戏 */
  function startGame(p1Name: string, p2Name: string) {
    playerConfigs.length = 0
    playerConfigs.push(
      {
        id: 1,
        name: p1Name || '玩家1',
        color: '#4CAF50',
        startPos: { x: 2, y: 2 },
        startDir: 'RIGHT',
        keys: ['w', 'a', 's', 'd'],
      },
      {
        id: 2,
        name: p2Name || '玩家2',
        color: '#f44336',
        startPos: { x: 16, y: 16 },
        startDir: 'LEFT',
        keys: ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'],
      },
    )

    state.status = 'countdown'
    state.countdown = 3
    state.winnerId = null
    state.winnerName = null
    state.stats = []
    state.tickCount = 0
    graceTimer = 0
    supplySpawnTimer = 0
    spiderSpawnTimer = 0
    bigSupplySpawnTimer = 0

    initSnakes()
    state.items = []
    spawnItems()

    // 倒计时
    const cdTimer = setInterval(() => {
      state.countdown--
      if (state.countdown <= 0) {
        clearInterval(cdTimer)
        state.status = 'playing'
        state.countdown = 0
        gameTimer = setInterval(tick, TICK_MS)
      }
    }, 1000)
  }

  /** 改变方向（防止 180 度 + 防止快速换向自撞） */
  function changeDirection(playerId: number, dir: string) {
    const snake = state.snakes.find((s) => s.id === playerId)
    if (!snake || !snake.alive) return
    if (isOpposite(snake.direction, dir)) return

    // 预判：新方向下一步是否撞到自己身体（防止快速多次换向导致自撞）
    const head = snake.body[0]
    const vec = DIR_VEC[dir]
    const nextHead = { x: head.x + vec.x, y: head.y + vec.y }

    const bodyWithoutTail = snake.body.slice(0, snake.body.length - 1)
    for (const seg of bodyWithoutTail) {
      if (seg.x === nextHead.x && seg.y === nextHead.y) return
    }
    // 检查是否撞到对手
    for (const other of state.snakes) {
      if (other.id === playerId || !other.alive) continue
      for (const seg of other.body) {
        if (seg.x === nextHead.x && seg.y === nextHead.y) return
      }
    }

    snake.direction = dir
  }

  /** 重置（保留胜场记录，用于再来一局） */
  function reset() {
    if (gameTimer) clearInterval(gameTimer)
    state.status = 'idle'
    state.snakes = []
    state.items = []
    state.winnerId = null
    state.winnerName = null
    state.stats = []
    state.tickCount = 0
    graceTimer = 0
    supplySpawnTimer = 0
    spiderSpawnTimer = 0
    bigSupplySpawnTimer = 0
    invincibleTimers.clear()
  }

  /** 重置整局会话（返回大厅时调用，清除胜场记录） */
  function resetSession() {
    p1Wins.value = 0
    p2Wins.value = 0
  }

  onUnmounted(() => {
    if (gameTimer) clearInterval(gameTimer)
  })

  return {
    state,
    playerConfigs,
    p1Wins,
    p2Wins,
    invincibleTimers,
    startGame,
    changeDirection,
    reset,
    resetSession,
    boardSize: BOARD_SIZE,
  }
}
