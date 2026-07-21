import { reactive, ref, onUnmounted } from 'vue'
import {
  BOARD_SIZE,
  DIR_VEC,
  DIRS,
  PLAYER_COLORS,
  type Difficulty,
  type Direction,
  type LocalPlayerConfig,
  type SnakeState,
  type GameState,
} from './snakeTypes'

export interface UseSnakeGameOptions {
  mode: 'local' | 'ai'
}

const INITIAL_HEALTH = 100
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

const HUMAN_ID = 1
const AI_ID = 2

/** 相反方向 */
function isOpposite(a: Direction, b: Direction): boolean {
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

/**
 * 贪吃蛇对战核心 composable（本地双人 / 人机共用）
 * - mode === 'local'：本地双人对战，两名玩家均可操控
 * - mode === 'ai'：人机对战，仅玩家 1（HUMAN_ID）可操控，玩家 2（AI_ID）由 AI 决策
 */
export function useSnakeGame(options: UseSnakeGameOptions) {
  const isAi = options.mode === 'ai'
  // 本地模式 tick 更快（100ms），人机模式更慢（200ms）便于人类操作
  const TICK_MS = isAi ? 200 : 100

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
  let aiTickCounter = 0 // AI 决策降频计数
  const invincibleTimers: Map<number, number> = new Map() // 受伤无敌计时器（剩余帧数）

  const difficulty = ref<Difficulty>('medium')
  const playerConfigs: LocalPlayerConfig[] = []
  const p1Wins = ref(0)
  const p2Wins = ref(0)

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
    invincibleTimers.set(HUMAN_ID, 0)
    invincibleTimers.set(AI_ID, 0)

    // 困难模式下 AI 有初始优势（仅 ai 模式生效）
    const aiBonus = isAi && difficulty.value === 'hard' ? 20 : 0
    const aiLength = isAi && difficulty.value === 'hard' ? 5 : 3

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

    // 困难模式 AI 初始长度多 2 段，补上 body（仅 ai 模式）
    if (isAi && difficulty.value === 'hard') {
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

  /** 移动蛇（副作用：更新蛇身 / 血量 / 存活状态） */
  function moveSnake(snake: SnakeState, allSnakes: SnakeState[]): void {
    const vec = DIR_VEC[snake.direction]
    if (!vec) return

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
        return
      }
      // 非无敌状态：扣血
      const damage = wallHit ? WALL_DAMAGE : BODY_DAMAGE
      snake.health -= damage
      // 设置无敌帧
      invincibleTimers.set(snake.id, INVINCIBLE_TICKS)
      if (snake.health <= 0) {
        snake.alive = false
        return
      }
      // 未死亡，停在原地（不移动）
      return
    }

    // 正常移动（无碰撞）
    snake.body.unshift(newHead)
    if (snake.body.length > snake.length) {
      snake.body.pop()
    }
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

  /** 游戏结束 */
  function endGame() {
    state.status = 'finished'
    clearInterval(gameTimer!)
    gameTimer = null

    const alive = state.snakes.filter((s) => s.alive)
    const diffLabel: Record<Difficulty, string> = { easy: '简单', medium: '中等', hard: '困难' }

    if (alive.length === 1) {
      state.winnerId = alive[0].id
      if (isAi) {
        state.winnerName = alive[0].id === HUMAN_ID ? '你' : `AI（${diffLabel[difficulty.value]}）`
      } else {
        state.winnerName =
          playerConfigs.find((p) => p.id === alive[0].id)?.name || `玩家${alive[0].id}`
        // 记录胜场
        if (alive[0].id === HUMAN_ID) p1Wins.value++
        else if (alive[0].id === AI_ID) p2Wins.value++
      }
    } else {
      state.winnerId = null
      state.winnerName = null
    }

    state.stats = state.snakes.map((s) => ({
      playerId: s.id,
      name: isAi
        ? s.id === HUMAN_ID
          ? '你'
          : `AI（${diffLabel[difficulty.value]}）`
        : playerConfigs.find((p) => p.id === s.id)?.name || `玩家${s.id}`,
      length: s.length,
      health: s.health,
      alive: s.alive,
    }))
  }

  /** 开始游戏 */
  function startGame(p1Name?: string, p2Name?: string) {
    if (!isAi) {
      playerConfigs.length = 0
      playerConfigs.push(
        {
          id: HUMAN_ID,
          name: p1Name || '玩家1',
          color: PLAYER_COLORS[HUMAN_ID]?.head ?? '#4CAF50',
          startPos: { x: 2, y: 2 },
          startDir: 'RIGHT',
          keys: ['w', 'a', 's', 'd'],
        },
        {
          id: AI_ID,
          name: p2Name || '玩家2',
          color: PLAYER_COLORS[AI_ID]?.head ?? '#f44336',
          startPos: { x: 16, y: 16 },
          startDir: 'LEFT',
          keys: ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'],
        },
      )
    }

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
  function changeDirection(playerId: number, dir: Direction) {
    // 人机模式：只有人类玩家能控制方向
    if (isAi && playerId !== HUMAN_ID) return
    const snake = state.snakes.find((s) => s.id === playerId)
    if (!snake || !snake.alive) return
    if (isOpposite(snake.direction, dir)) return
    // 预判：新方向下一步是否撞到自己身体 / 对手（撞墙允许，下一 tick 才扣血）
    if (wouldHitBodyOrOpponent(snake, dir)) return

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
    aiTickCounter = 0
    invincibleTimers.clear()
  }

  /** 重置整局会话（返回大厅时调用，清除胜场记录，仅本地模式有意义） */
  function resetSession() {
    p1Wins.value = 0
    p2Wins.value = 0
  }

  // ============ AI 逻辑（仅 mode === 'ai' 时参与） ============

  /** 检查某个格子是否可通过（非障碍物） */
  function isWalkable(x: number, y: number): boolean {
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
  ): Direction[] | null {
    if (!isWalkable(targetX, targetY)) {
      // 目标本身不可到达
      return null
    }

    const visited = new Set<string>()
    const queue: { x: number; y: number; path: Direction[] }[] = []
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
        if (!visited.has(key) && isWalkable(nx, ny)) {
          visited.add(key)
          queue.push({ x: nx, y: ny, path: [...cur.path, dir] })
        }
      }
    }
    return null // 无路可达
  }

  /** 新方向的下一步是否会撞到自己身体（除尾巴）或对手 */
  function wouldHitBodyOrOpponent(snake: SnakeState, dir: Direction): boolean {
    const vec = DIR_VEC[dir]
    const head = snake.body[0]
    const nx = head.x + vec.x
    const ny = head.y + vec.y

    // 撞自己（除尾巴）
    const bodyWithoutTail = snake.body.slice(0, snake.body.length - 1)
    for (const seg of bodyWithoutTail) {
      if (seg.x === nx && seg.y === ny) return true
    }

    // 撞对方
    for (const other of state.snakes) {
      if (other.id === snake.id || !other.alive) continue
      for (const seg of other.body) {
        if (seg.x === nx && seg.y === ny) return true
      }
    }

    return false
  }

  /** 评估一个方向是否安全（不会立即撞墙/撞身） */
  function isSafeDirection(snake: SnakeState, dir: Direction): boolean {
    const vec = DIR_VEC[dir]
    const head = snake.body[0]
    const nx = head.x + vec.x
    const ny = head.y + vec.y

    // 撞墙
    if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) return false

    return !wouldHitBodyOrOpponent(snake, dir)
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
      effectiveRandom = 0.05 + healthRatio * 0.3 // 5%~35%
      effectiveBigSupplyScore = 100 + (1 - healthRatio) * 100 // 100~200
      effectiveChaseScore = 30 + (1 - healthRatio) * 120 // 30~150
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

    let bestDir: Direction | null = null
    let bestScore = -Infinity

    for (const target of targets) {
      const path = bfs(head.x, head.y, target.x, target.y)
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

  /** 游戏 tick */
  function tick() {
    if (state.status !== 'playing') return
    state.tickCount++

    //  grace period: 前 N 帧不扣血、不检测碰撞
    if (graceTimer < GRACE_TICKS) {
      graceTimer++
    }

    // 人机模式：每次 tick 前 AI 决定方向
    if (isAi) aiDecide()

    // 移动每条蛇
    for (const s of state.snakes) {
      if (!s.alive) continue
      if (graceTimer >= GRACE_TICKS) {
        moveSnake(s, state.snakes)
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

  onUnmounted(() => {
    if (gameTimer) clearInterval(gameTimer)
  })

  return {
    state,
    playerConfigs,
    p1Wins,
    p2Wins,
    invincibleTimers,
    difficulty,
    startGame,
    changeDirection,
    reset,
    resetSession,
    boardSize: BOARD_SIZE,
    HUMAN_ID,
    AI_ID,
  }
}
