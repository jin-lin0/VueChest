import { reactive, ref, onUnmounted } from 'vue'
import type { SnakeState, GameState } from './snakeTypes'

export type Difficulty = 'easy' | 'medium' | 'hard'

const BOARD_SIZE = 19
const INITIAL_HEALTH = 100
const TICK_MS = 200
const GRACE_TICKS = 15
const SUPPLY_HEAL = 20
const SPIDER_DAMAGE = 20
const WALL_DAMAGE = 50
const BODY_DAMAGE = 50
const SUPPLY_SPAWN_INTERVAL = 10
const SPIDER_SPAWN_INTERVAL = 15
const MAX_SUPPLY_ON_BOARD = 3
const MAX_SPIDER_ON_BOARD = 2
const BIG_SUPPLY_SPAWN_INTERVAL = 20
const MAX_BIG_SUPPLY_ON_BOARD = 1
const INVINCIBLE_TICKS = 3

const DIR_VEC: Record<string, { x: number; y: number }> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

/** 方向列表 */
const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT']

function isOpposite(a: string, b: string): boolean {
  return (
    (a === 'UP' && b === 'DOWN') ||
    (a === 'DOWN' && b === 'UP') ||
    (a === 'LEFT' && b === 'RIGHT') ||
    (a === 'RIGHT' && b === 'LEFT')
  )
}

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

export function useSnakeAiGame() {
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
  let supplySpawnTimer: number = 0
  let spiderSpawnTimer: number = 0
  let bigSupplySpawnTimer: number = 0
  const invincibleTimers: Map<number, number> = new Map()
  const HUMAN_ID = 1
  const AI_ID = 2

  const difficulty = ref<Difficulty>('medium')
  let aiTickCounter = 0

  function getOccupied(): Set<string> {
    const set = new Set<string>()
    for (const s of state.snakes) {
      for (const b of s.body) set.add(`${b.x},${b.y}`)
    }
    return set
  }

  function initSnakes() {
    invincibleTimers.set(HUMAN_ID, 0)
    invincibleTimers.set(AI_ID, 0)

    // 困难模式下 AI 有初始优势
    const aiBonus = difficulty.value === 'hard' ? 20 : 0
    const aiLength = difficulty.value === 'hard' ? 5 : 3

    state.snakes = [
      {
        id: HUMAN_ID,
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
        id: AI_ID,
        body: [
          { x: 16, y: 16 },
          { x: 17, y: 16 },
          { x: 18, y: 16 },
        ],
        direction: 'LEFT',
        health: INITIAL_HEALTH + aiBonus,
        alive: true,
        length: aiLength,
      },
    ]
    // 困难模式 AI 初始长度多 2 段，补上 body
    if (difficulty.value === 'hard') {
      const ai = state.snakes[1]
      ai.body = [
        { x: 16, y: 16 },
        { x: 17, y: 16 },
        { x: 18, y: 16 },
        { x: 18, y: 15 },
        { x: 18, y: 14 },
      ]
    }
  }

  function spawnItems() {
    const occupied = getOccupied()
    const supplyCount = state.items.filter((i) => i.type === 'supply').length
    const spiderCount = state.items.filter((i) => i.type === 'spider').length

    supplySpawnTimer++
    if (supplySpawnTimer >= SUPPLY_SPAWN_INTERVAL && supplyCount < MAX_SUPPLY_ON_BOARD) {
      const pos = randomEmptyCell(occupied)
      if (pos) {
        state.items.push({ type: 'supply', x: pos.x, y: pos.y })
        occupied.add(`${pos.x},${pos.y}`)
        supplySpawnTimer = 0
      }
    }

    spiderSpawnTimer++
    if (spiderSpawnTimer >= SPIDER_SPAWN_INTERVAL && spiderCount < MAX_SPIDER_ON_BOARD) {
      const pos = randomEmptyCell(occupied)
      if (pos) {
        state.items.push({ type: 'spider', x: pos.x, y: pos.y })
        spiderSpawnTimer = 0
      }
    }

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

  function moveSnake(
    snake: SnakeState,
    allSnakes: SnakeState[],
  ): { died: boolean; tookDamage: boolean } {
    const vec = DIR_VEC[snake.direction]
    if (!vec) return { died: false, tookDamage: false }

    const head = snake.body[0]
    const newHead = { x: head.x + vec.x, y: head.y + vec.y }

    const invincible = (invincibleTimers.get(snake.id) || 0) > 0

    const wallHit =
      newHead.x < 0 || newHead.x >= BOARD_SIZE || newHead.y < 0 || newHead.y >= BOARD_SIZE
    const bodyWithoutTail = snake.body.slice(0, snake.body.length - 1)
    let selfHit = false
    for (const b of bodyWithoutTail) {
      if (b.x === newHead.x && b.y === newHead.y) {
        selfHit = true
        break
      }
    }
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
        const wrappedHead = { ...newHead }
        if (wrappedHead.x < 0) wrappedHead.x = BOARD_SIZE - 1
        if (wrappedHead.x >= BOARD_SIZE) wrappedHead.x = 0
        if (wrappedHead.y < 0) wrappedHead.y = BOARD_SIZE - 1
        if (wrappedHead.y >= BOARD_SIZE) wrappedHead.y = 0
        snake.body.unshift(wrappedHead)
        if (snake.body.length > snake.length) snake.body.pop()
        return { died: false, tookDamage: false }
      }
      const damage = wallHit ? WALL_DAMAGE : BODY_DAMAGE
      snake.health -= damage
      invincibleTimers.set(snake.id, INVINCIBLE_TICKS)
      if (snake.health <= 0) {
        snake.alive = false
        return { died: true, tookDamage: true }
      }
      return { died: false, tookDamage: true }
    }

    snake.body.unshift(newHead)
    if (snake.body.length > snake.length) {
      snake.body.pop()
    }

    return { died: false, tookDamage: false }
  }

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
      snake.health = INITIAL_HEALTH
      snake.length += 2
    }
  }

  // ============ AI 逻辑 ============

  /** 检查某个格子是否可通过（非障碍物） */
  function isWalkable(x: number, y: number, _selfId: number): boolean {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return false
    for (const s of state.snakes) {
      if (!s.alive) continue
      // 蛇身（除自己蛇的尾巴，因为尾巴移动后会消失）
      // 保守处理：把整个身体都当作障碍
      for (const seg of s.body) {
        if (seg.x === x && seg.y === y) return false
      }
    }
    return true
  }

  /** BFS 寻路，返回从起点到终点的方向列表 */
  function bfs(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    selfId: number,
  ): string[] | null {
    if (!isWalkable(targetX, targetY, selfId)) {
      // 目标本身不可到达
      return null
    }

    const visited = new Set<string>()
    const queue: { x: number; y: number; path: string[] }[] = []
    queue.push({ x: startX, y: startY, path: [] })
    visited.add(`${startX},${startY}`)

    while (queue.length > 0) {
      const cur = queue.shift()!
      if (cur.x === targetX && cur.y === targetY) {
        return cur.path
      }

      for (const dir of DIRS) {
        const vec = DIR_VEC[dir]
        const nx = cur.x + vec.x
        const ny = cur.y + vec.y
        const key = `${nx},${ny}`
        if (!visited.has(key) && isWalkable(nx, ny, selfId)) {
          visited.add(key)
          queue.push({ x: nx, y: ny, path: [...cur.path, dir] })
        }
      }
    }
    return null // 无路可达
  }

  /** 评估一个方向是否安全（不会立即撞墙/撞身） */
  function isSafeDirection(snake: SnakeState, dir: string): boolean {
    const vec = DIR_VEC[dir]
    const head = snake.body[0]
    const nx = head.x + vec.x
    const ny = head.y + vec.y

    // 撞墙
    if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) return false

    // 撞自己（除尾巴）
    const bodyWithoutTail = snake.body.slice(0, snake.body.length - 1)
    for (const seg of bodyWithoutTail) {
      if (seg.x === nx && seg.y === ny) return false
    }

    // 撞对方
    for (const other of state.snakes) {
      if (other.id === snake.id || !other.alive) continue
      for (const seg of other.body) {
        if (seg.x === nx && seg.y === ny) return false
      }
    }

    return true
  }

  /** AI 决策：为 AI 蛇选择最佳方向 */
  function aiDecide() {
    const aiSnake = state.snakes.find((s) => s.id === AI_ID)
    if (!aiSnake || !aiSnake.alive) return

    const head = aiSnake.body[0]
    const healthRatio = aiSnake.health / INITIAL_HEALTH // 0~1

    // ===== 根据难度 + 当前血量动态计算 AI 参数 =====
    let effectiveInterval: number
    let effectiveRandom: number
    let effectiveBigSupplyScore: number
    let effectiveChaseScore: number

    if (difficulty.value === 'hard') {
      // 困难：始终满状态
      effectiveInterval = 1
      effectiveRandom = 0
      effectiveBigSupplyScore = 200
      effectiveChaseScore = 150
    } else if (difficulty.value === 'medium') {
      // 中等：轻微受血量影响
      effectiveInterval = 1
      effectiveRandom = 0.05 + healthRatio * 0.1 // 5%~15%
      effectiveBigSupplyScore = 200
      effectiveChaseScore = 50 + (1 - healthRatio) * 60 // 50~110（血越少追越凶）
    } else {
      // 简单：大幅受血量影响
      // 血量高(100%) → 间隔3、随机30%、不太追人
      // 血量低(≤30%) → 间隔1、随机5%、积极追人
      effectiveInterval = 1 + Math.floor(healthRatio * 2.5) // 1~3
      effectiveRandom = 0.05 + healthRatio * 0.3            // 5%~35%
      effectiveBigSupplyScore = 100 + (1 - healthRatio) * 100 // 100~200
      effectiveChaseScore = 30 + (1 - healthRatio) * 120      // 30~150
    }

    // 决策降频
    aiTickCounter++
    if (aiTickCounter < effectiveInterval) return
    aiTickCounter = 0

    const safeDirs = DIRS.filter(
      (d) => !isOpposite(aiSnake.direction, d) && isSafeDirection(aiSnake, d),
    )
    if (safeDirs.length === 0) {
      const nonOpposite = DIRS.filter((d) => !isOpposite(aiSnake.direction, d))
      if (nonOpposite.length > 0) {
        aiSnake.direction = nonOpposite[Math.floor(Math.random() * nonOpposite.length)]
      }
      return
    }

    // 随机犯傻
    if (effectiveRandom > 0 && Math.random() < effectiveRandom) {
      aiSnake.direction = safeDirs[Math.floor(Math.random() * safeDirs.length)]
      return
    }

    // 收集目标
    const targets: { x: number; y: number; score: number }[] = []

    for (const item of state.items) {
      if (item.type === 'supply') {
        targets.push({ x: item.x, y: item.y, score: 100 })
      } else if (item.type === 'big_supply') {
        targets.push({ x: item.x, y: item.y, score: effectiveBigSupplyScore })
      }
    }

    // 追逐人类玩家（血量越低追得越凶）
    const human = state.snakes.find((s) => s.id === HUMAN_ID)
    if (human && human.alive) {
      const chaseScore = targets.length > 0 ? effectiveChaseScore * 0.6 : effectiveChaseScore
      targets.push({ x: human.body[0].x, y: human.body[0].y, score: chaseScore })
    }

    if (targets.length === 0) {
      aiSnake.direction = safeDirs[Math.floor(Math.random() * safeDirs.length)]
      return
    }

    // 按得分排序，找 BFS 可达的最佳目标
    targets.sort((a, b) => b.score - a.score)

    let bestDir: string | null = null
    let bestScore = -Infinity

    for (const target of targets) {
      const path = bfs(head.x, head.y, target.x, target.y, AI_ID)
      if (path && path.length > 0) {
        const combined = target.score - path.length * 0.5
        if (combined > bestScore && safeDirs.includes(path[0])) {
          bestScore = combined
          bestDir = path[0]
        }
      }
    }

    if (bestDir) {
      aiSnake.direction = bestDir
    } else {
      let bestDist = Infinity
      for (const d of safeDirs) {
        const vec = DIR_VEC[d]
        const nx = head.x + vec.x
        const ny = head.y + vec.y
        let minDist = Infinity
        for (const target of targets) {
          const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y)
          if (dist < minDist) minDist = dist
        }
        if (minDist < bestDist) {
          bestDist = minDist
          bestDir = d
        }
      }
      aiSnake.direction = bestDir || safeDirs[0]
    }
  }

  // ============ 游戏循环 ============

  function tick() {
    if (state.status !== 'playing') return
    state.tickCount++

    if (graceTimer < GRACE_TICKS) {
      graceTimer++
    }

    // AI 决策：每次 tick 前 AI 决定方向
    aiDecide()

    const deadIds: number[] = []
    for (const s of state.snakes) {
      if (!s.alive) continue
      if (graceTimer >= GRACE_TICKS) {
        const result = moveSnake(s, state.snakes)
        if (result.died) deadIds.push(s.id)
      } else {
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
        s.health--
        checkItems(s)
        if (s.health <= 0) {
          s.alive = false
          deadIds.push(s.id)
        }
      }
    }

    if (graceTimer >= GRACE_TICKS) {
      checkHeadToHead()
    }

    for (const s of state.snakes) {
      const t = invincibleTimers.get(s.id) || 0
      if (t > 0) invincibleTimers.set(s.id, t - 1)
    }

    spawnItems()

    const alive = state.snakes.filter((s) => s.alive)
    if (alive.length <= 1) {
      endGame()
    }
  }

  function endGame() {
    state.status = 'finished'
    clearInterval(gameTimer!)
    gameTimer = null

    const alive = state.snakes.filter((s) => s.alive)
    const diffLabel: Record<Difficulty, string> = { easy: '简单', medium: '中等', hard: '困难' }

    if (alive.length === 1) {
      state.winnerId = alive[0].id
      state.winnerName = alive[0].id === HUMAN_ID ? '你' : `AI（${diffLabel[difficulty.value]}）`
    } else {
      state.winnerId = null
      state.winnerName = null
    }

    state.stats = state.snakes.map((s) => ({
      playerId: s.id,
      name: s.id === HUMAN_ID ? '你' : `AI(${diffLabel[difficulty.value]})`,
      length: s.length,
      health: s.health,
      alive: s.alive,
    }))
  }

  function startGame() {
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
    aiTickCounter = 0

    initSnakes()
    state.items = []
    spawnItems()

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

  function changeDirection(playerId: number, dir: string) {
    if (playerId !== HUMAN_ID) return // 只有人类玩家能控制
    const snake = state.snakes.find((s) => s.id === playerId)
    if (!snake || !snake.alive) return
    if (isOpposite(snake.direction, dir)) return

    // 预判：新方向下一步是否撞到自己身体（防止快速多次换向导致自撞）
    const head = snake.body[0]
    const vec = DIR_VEC[dir]
    const nextHead = { x: head.x + vec.x, y: head.y + vec.y }

    // 排除尾巴（尾巴会在移动时消失）
    const bodyWithoutTail = snake.body.slice(0, snake.body.length - 1)
    for (const seg of bodyWithoutTail) {
      if (seg.x === nextHead.x && seg.y === nextHead.y) return
    }
    // 检查是否撞到对方
    for (const other of state.snakes) {
      if (other.id === playerId || !other.alive) continue
      for (const seg of other.body) {
        if (seg.x === nextHead.x && seg.y === nextHead.y) return
      }
    }

    snake.direction = dir
  }

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

  onUnmounted(() => {
    if (gameTimer) clearInterval(gameTimer)
  })

  return {
    state,
    invincibleTimers,
    difficulty,
    startGame,
    changeDirection,
    reset,
    boardSize: BOARD_SIZE,
    HUMAN_ID,
    AI_ID,
  }
}
