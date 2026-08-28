import { UPGRADES } from './upgrades'
import { renderNeonFrame } from './renderer'
import type {
  Bullet,
  Difficulty,
  Enemy,
  EnemyKind,
  EngineCallbacks,
  FloatingText,
  GameHud,
  GameInput,
  Particle,
  Pickup,
  Player,
  RunSummary,
  Star,
  UpgradeDefinition,
  UpgradeOption,
  Vector,
} from './types'

const WORLD_WIDTH = 3600
const WORLD_HEIGHT = 2400
const BOSS_TIMES = [120, 240, 360] as const
const RUN_DURATION = BOSS_TIMES[BOSS_TIMES.length - 1]
const ENEMY_GRID_SIZE = 160
const ENEMY_GRID_COLUMNS = Math.ceil(WORLD_WIDTH / ENEMY_GRID_SIZE)
const ENEMY_GRID_ROWS = Math.ceil(WORLD_HEIGHT / ENEMY_GRID_SIZE)
const MAX_ENEMIES = 96
const MAX_PLAYER_BULLETS = 180
const MAX_ENEMY_BULLETS = 180
const MAX_PICKUPS = 80
const BOSS_MINION_LIMIT = 24
const TAU = Math.PI * 2

const ENEMY_THREAT: Record<EnemyKind, number> = {
  drone: 1,
  brute: 3,
  shooter: 3,
  splitter: 4,
  boss: 0,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distanceSquared = (a: Vector, b: Vector) => {
  const x = a.x - b.x
  const y = a.y - b.y
  return x * x + y * y
}

const normalize = (x: number, y: number): Vector => {
  const length = Math.hypot(x, y)
  return length > 0.001 ? { x: x / length, y: y / length } : { x: 0, y: 0 }
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

function compactInPlace<T>(items: T[], keep: (item: T) => boolean) {
  let writeIndex = 0
  for (let readIndex = 0; readIndex < items.length; readIndex++) {
    const item = items[readIndex]
    if (!keep(item)) continue
    items[writeIndex++] = item
  }
  items.length = writeIndex
}

function createPlayer(): Player {
  return {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    radius: 18,
    angle: 0,
    hp: 100,
    maxHp: 100,
    speed: 250,
    damage: 23,
    fireRate: 5.2,
    bulletSpeed: 820,
    bulletSize: 5,
    multishot: 1,
    spread: 0.14,
    pierce: 0,
    critChance: 0.08,
    magnet: 120,
    armor: 0,
    regen: 0,
    dashCooldown: 3.1,
    dashTimer: 0,
    dashTime: 0,
    invulnerable: 0,
    fireTimer: 0,
    level: 1,
    xp: 0,
    nextXp: 28,
  }
}

export class NeonSurvivorEngine {
  readonly input: GameInput = {
    keys: new Set(),
    pointer: { x: 0, y: 0 },
    pointerActive: false,
    firing: false,
    moveStick: { x: 0, y: 0 },
    aimStick: { x: 0, y: 0 },
    touchAiming: false,
    dashQueued: false,
  }

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly callbacks: EngineCallbacks
  private player = createPlayer()
  private enemies: Enemy[] = []
  private bullets: Bullet[] = []
  private pickups: Pickup[] = []
  private particles: Particle[] = []
  private texts: FloatingText[] = []
  private stars: Star[] = []
  private readonly enemyGrid = Array.from(
    { length: ENEMY_GRID_COLUMNS * ENEMY_GRID_ROWS },
    () => [] as Enemy[],
  )
  private readonly occupiedEnemyCells: number[] = []
  private upgradeLevels = new Map<string, number>()
  private active = false
  private ended = false
  private renderDirty = true
  private width = 1
  private height = 1
  private dpr = 1
  private particleBudget = 320
  private lowPowerMode = false
  private reducedEffects = false
  private vignetteGradient: CanvasGradient | null = null
  private elapsed = 0
  private spawnTimer = 0
  private hudTimer = 0
  private rafId = 0
  private finishTimerId: number | null = null
  private previousTime = 0
  private enemyId = 0
  private kills = 0
  private score = 0
  private combo = 0
  private comboTimer = 0
  private difficulty: Difficulty = 'normal'
  private difficultyScale = 1
  private nextBossIndex = 0
  private bossReinforcementTimer = 0
  private bossId = 0
  private screenShake = 0
  private damageFlash = 0
  private dashVector: Vector = { x: 1, y: 0 }
  private camera: Vector = { x: 0, y: 0 }
  private pendingLevelUp = false

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不支持 Canvas 2D')
    this.canvas = canvas
    this.ctx = context
    this.callbacks = callbacks
    this.generateStars()
    this.resize()
    this.rafId = requestAnimationFrame(this.frame)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.lowPowerMode =
      window.matchMedia('(pointer: coarse)').matches || this.width < 760 || this.height < 520
    this.dpr = Math.min(this.lowPowerMode ? 1.25 : 1.5, window.devicePixelRatio || 1)
    this.particleBudget = this.lowPowerMode ? 160 : 320
    this.reducedEffects = this.lowPowerMode
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.vignetteGradient = this.ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.18,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72,
    )
    this.vignetteGradient.addColorStop(0, 'rgba(3, 5, 15, 0)')
    this.vignetteGradient.addColorStop(1, 'rgba(1, 2, 8, 0.62)')
    this.input.pointer = { x: this.width * 0.7, y: this.height * 0.5 }
    this.updateCamera()
    this.draw()
    this.renderDirty = false
  }

  start(difficulty: Difficulty) {
    this.clearFinishTimer()
    this.player = createPlayer()
    this.enemies = []
    this.bullets = []
    this.pickups = []
    this.particles = []
    this.texts = []
    this.upgradeLevels.clear()
    this.elapsed = 0
    this.spawnTimer = 0.25
    this.hudTimer = 0
    this.enemyId = 0
    this.kills = 0
    this.score = 0
    this.combo = 0
    this.comboTimer = 0
    this.difficulty = difficulty
    this.difficultyScale = difficulty === 'surge' ? 1.32 : 1
    this.nextBossIndex = 0
    this.bossReinforcementTimer = 0
    this.bossId = 0
    this.screenShake = 0
    this.damageFlash = 0
    this.pendingLevelUp = false
    this.reducedEffects = this.lowPowerMode
    this.ended = false
    this.active = true
    this.renderDirty = true
    this.previousTime = performance.now()
    this.emitHud()
    this.requestFrame()
  }

  pause() {
    if (!this.ended) this.active = false
    this.input.firing = false
    this.renderDirty = true
  }

  resume() {
    if (this.ended || this.pendingLevelUp) return
    this.active = true
    this.previousTime = performance.now()
    this.requestFrame()
  }

  startFiring() {
    this.input.firing = true
    if (!this.active || this.player.fireTimer > 0) return
    this.firePlayerWeapon()
    this.player.fireTimer = 1 / this.player.fireRate
  }

  applyUpgrade(id: string) {
    const definition = UPGRADES.find((upgrade) => upgrade.id === id)
    if (!definition || !this.pendingLevelUp) return
    const nextLevel = (this.upgradeLevels.get(id) || 0) + 1
    definition.apply(this.player, nextLevel)
    this.upgradeLevels.set(id, nextLevel)
    this.pendingLevelUp = false
    this.callbacks.onSound('level')
    this.burst(this.player.x, this.player.y, '#7afcff', 28, 220)

    if (this.player.xp >= this.player.nextXp) {
      this.triggerLevelUp()
      return
    }

    this.active = true
    this.previousTime = performance.now()
    this.emitHud()
    this.requestFrame()
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.clearFinishTimer()
    this.active = false
    this.ended = true
    this.input.keys.clear()
    this.enemies.length = 0
    this.bullets.length = 0
    this.pickups.length = 0
    this.particles.length = 0
    this.texts.length = 0
    this.stars.length = 0
    for (const key of this.occupiedEnemyCells) this.enemyGrid[key].length = 0
    this.occupiedEnemyCells.length = 0
    this.upgradeLevels.clear()
  }

  private frame = (time: number) => {
    this.rafId = 0
    const rawDelta = this.previousTime ? (time - this.previousTime) / 1000 : 0
    this.previousTime = time
    if (this.active) {
      this.update(Math.min(rawDelta, 0.034))
      this.draw()
      this.renderDirty = false
    } else if (this.renderDirty) {
      this.draw()
      this.renderDirty = false
    }
    if (this.active || this.renderDirty) this.requestFrame()
  }

  private requestFrame() {
    if (!this.rafId) this.rafId = requestAnimationFrame(this.frame)
  }

  private clearFinishTimer() {
    if (this.finishTimerId === null) return
    window.clearTimeout(this.finishTimerId)
    this.finishTimerId = null
  }

  private update(dt: number) {
    this.elapsed += dt
    this.screenShake = Math.max(0, this.screenShake - dt * 24)
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8)
    this.comboTimer = Math.max(0, this.comboTimer - dt)
    if (this.comboTimer <= 0) this.combo = 0

    this.updatePlayer(dt)
    this.rebuildEnemyGrid()
    this.updateBullets(dt)
    this.updateEnemies(dt)
    this.updatePickups(dt)
    this.updateParticles(dt)
    this.spawnEnemies(dt)
    this.updateBossProgression(dt)
    this.enforceBulletBudgets()
    this.updateEffectQuality()

    this.hudTimer -= dt
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.075
      this.emitHud()
    }
  }

  private updatePlayer(dt: number) {
    const player = this.player
    player.fireTimer -= dt
    player.dashTimer = Math.max(0, player.dashTimer - dt)
    player.dashTime = Math.max(0, player.dashTime - dt)
    player.invulnerable = Math.max(0, player.invulnerable - dt)
    player.hp = Math.min(player.maxHp, player.hp + player.regen * dt)

    let moveX = 0
    let moveY = 0
    if (this.input.keys.has('w') || this.input.keys.has('arrowup')) moveY -= 1
    if (this.input.keys.has('s') || this.input.keys.has('arrowdown')) moveY += 1
    if (this.input.keys.has('a') || this.input.keys.has('arrowleft')) moveX -= 1
    if (this.input.keys.has('d') || this.input.keys.has('arrowright')) moveX += 1
    moveX += this.input.moveStick.x
    moveY += this.input.moveStick.y
    const movement = normalize(moveX, moveY)

    if (this.input.dashQueued) {
      this.input.dashQueued = false
      this.tryDash(movement)
    }

    if (player.dashTime > 0) {
      player.x += this.dashVector.x * player.speed * 4.2 * dt
      player.y += this.dashVector.y * player.speed * 4.2 * dt
      if (Math.random() < 0.86) {
        this.addParticle(
          player.x - this.dashVector.x * 18,
          player.y - this.dashVector.y * 18,
          -this.dashVector.x * randomBetween(60, 160),
          -this.dashVector.y * randomBetween(60, 160),
          '#7afcff',
          randomBetween(3, 8),
          0.35,
        )
      }
    } else {
      player.x += movement.x * player.speed * dt
      player.y += movement.y * player.speed * dt
      if ((movement.x || movement.y) && Math.random() < 0.28) {
        this.addParticle(
          player.x - movement.x * 15,
          player.y - movement.y * 15,
          -movement.x * randomBetween(20, 55),
          -movement.y * randomBetween(20, 55),
          '#8b5cf6',
          randomBetween(2, 4),
          0.26,
        )
      }
    }

    player.x = clamp(player.x, player.radius + 18, WORLD_WIDTH - player.radius - 18)
    player.y = clamp(player.y, player.radius + 18, WORLD_HEIGHT - player.radius - 18)
    this.updateCamera()

    if (this.input.touchAiming) {
      if (Math.hypot(this.input.aimStick.x, this.input.aimStick.y) > 0.22) {
        player.angle = Math.atan2(this.input.aimStick.y, this.input.aimStick.x)
      }
    } else if (this.input.pointerActive) {
      const pointerWorldX = this.camera.x + this.input.pointer.x
      const pointerWorldY = this.camera.y + this.input.pointer.y
      player.angle = Math.atan2(pointerWorldY - player.y, pointerWorldX - player.x)
    }

    if ((this.input.firing || this.input.keys.has('j')) && player.fireTimer <= 0) {
      this.firePlayerWeapon()
      player.fireTimer += 1 / player.fireRate
    }
  }

  private tryDash(movement: Vector) {
    if (this.player.dashTimer > 0 || this.player.dashTime > 0) return
    let direction = movement
    if (!direction.x && !direction.y) {
      direction = { x: Math.cos(this.player.angle), y: Math.sin(this.player.angle) }
    }
    this.dashVector = direction
    this.player.dashTimer = this.player.dashCooldown
    this.player.dashTime = 0.16
    this.player.invulnerable = 0.26
    this.screenShake = Math.max(this.screenShake, 4)
    this.callbacks.onSound('dash')
    this.burst(this.player.x, this.player.y, '#7afcff', 14, 180)
  }

  private firePlayerWeapon() {
    const player = this.player
    const count = player.multishot
    for (let index = 0; index < count; index++) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * player.spread
      const angle = player.angle + offset
      const critical = Math.random() < player.critChance
      const speed = player.bulletSpeed
      this.bullets.push({
        x: player.x + Math.cos(angle) * 25,
        y: player.y + Math.sin(angle) * 25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: player.bulletSize * (critical ? 1.28 : 1),
        damage: player.damage * (critical ? 2 : 1),
        life: 1.35,
        pierce: player.pierce,
        color: critical ? '#fff38a' : '#7afcff',
        enemy: false,
      })
    }
    this.callbacks.onSound('shoot')
    this.addParticle(
      player.x + Math.cos(player.angle) * 26,
      player.y + Math.sin(player.angle) * 26,
      Math.cos(player.angle) * 45,
      Math.sin(player.angle) * 45,
      '#dffcff',
      5,
      0.16,
    )
  }

  private rebuildEnemyGrid() {
    for (const key of this.occupiedEnemyCells) this.enemyGrid[key].length = 0
    this.occupiedEnemyCells.length = 0
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue
      const cellX = Math.floor(enemy.x / ENEMY_GRID_SIZE)
      const cellY = Math.floor(enemy.y / ENEMY_GRID_SIZE)
      const key = cellX + cellY * ENEMY_GRID_COLUMNS
      const bucket = this.enemyGrid[key]
      if (!bucket) continue
      if (bucket.length === 0) this.occupiedEnemyCells.push(key)
      bucket.push(enemy)
    }
  }

  private updateBullets(dt: number) {
    for (const bullet of this.bullets) {
      bullet.life -= dt
      bullet.x += bullet.vx * dt
      bullet.y += bullet.vy * dt

      if (bullet.life <= 0 || this.isOutsideCombatView(bullet, bullet.enemy ? 480 : 220)) {
        bullet.life = 0
        continue
      }

      if (bullet.enemy) {
        if (
          bullet.life > 0 &&
          distanceSquared(bullet, this.player) < (bullet.radius + this.player.radius) ** 2
        ) {
          bullet.life = 0
          this.damagePlayer(bullet.damage)
        }
        continue
      }

      const cellX = Math.floor(bullet.x / ENEMY_GRID_SIZE)
      const cellY = Math.floor(bullet.y / ENEMY_GRID_SIZE)
      const speed = Math.hypot(bullet.vx, bullet.vy) || 1
      const directionX = bullet.vx / speed
      const directionY = bullet.vy / speed

      collisionCells: for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const gridX = cellX + offsetX
          const gridY = cellY + offsetY
          if (gridX < 0 || gridY < 0 || gridX >= ENEMY_GRID_COLUMNS || gridY >= ENEMY_GRID_ROWS)
            continue
          const bucket = this.enemyGrid[gridX + gridY * ENEMY_GRID_COLUMNS]
          if (bucket.length === 0) continue

          for (const enemy of bucket) {
            if (enemy.hp <= 0 || bullet.life <= 0) continue
            if (distanceSquared(bullet, enemy) > (bullet.radius + enemy.radius) ** 2) continue

            enemy.hp -= bullet.damage
            enemy.hitFlash = 0.1
            enemy.x += directionX * 7
            enemy.y += directionY * 7
            this.hitBurst(bullet.x, bullet.y, enemy.color)
            if (bullet.color === '#fff38a' || Math.random() < (this.reducedEffects ? 0.06 : 0.12)) {
              this.texts.push({
                x: enemy.x,
                y: enemy.y - enemy.radius,
                text: `${Math.round(bullet.damage)}`,
                color: bullet.color,
                life: 0.45,
                size: bullet.color === '#fff38a' ? 18 : 13,
              })
            }
            this.callbacks.onSound('hit')
            bullet.pierce -= 1
            if (bullet.pierce < 0) bullet.life = 0
            if (enemy.hp <= 0) this.killEnemy(enemy)
            if (bullet.life <= 0) break collisionCells
          }
        }
      }
    }

    compactInPlace(
      this.bullets,
      (bullet) =>
        bullet.life > 0 &&
        bullet.x > -80 &&
        bullet.y > -80 &&
        bullet.x < WORLD_WIDTH + 80 &&
        bullet.y < WORLD_HEIGHT + 80,
    )
  }

  private isOutsideCombatView(point: Vector, margin: number) {
    const x = point.x - this.camera.x
    const y = point.y - this.camera.y
    return x < -margin || y < -margin || x > this.width + margin || y > this.height + margin
  }

  private enforceBulletBudgets() {
    let playerCount = 0
    let enemyCount = 0
    for (const bullet of this.bullets) {
      if (bullet.enemy) enemyCount += 1
      else playerCount += 1
    }

    let playersToDrop = Math.max(0, playerCount - MAX_PLAYER_BULLETS)
    let enemiesToDrop = Math.max(0, enemyCount - MAX_ENEMY_BULLETS)
    if (playersToDrop === 0 && enemiesToDrop === 0) return

    compactInPlace(this.bullets, (bullet) => {
      if (bullet.enemy && enemiesToDrop > 0) {
        enemiesToDrop -= 1
        return false
      }
      if (!bullet.enemy && playersToDrop > 0) {
        playersToDrop -= 1
        return false
      }
      return true
    })
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
      enemy.contactTimer = Math.max(0, enemy.contactTimer - dt)
      enemy.shootTimer -= dt
      enemy.angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x)
      const distance = Math.sqrt(distanceSquared(enemy, this.player)) || 1
      const directionX = (this.player.x - enemy.x) / distance
      const directionY = (this.player.y - enemy.y) / distance

      if (enemy.kind === 'shooter') {
        const desired = distance > 330 ? 1 : distance < 230 ? -0.75 : 0
        const strafe = Math.sin(this.elapsed * 1.8 + enemy.orbit) * 0.48
        enemy.x += (directionX * desired - directionY * strafe) * enemy.speed * dt
        enemy.y += (directionY * desired + directionX * strafe) * enemy.speed * dt
        if (enemy.shootTimer <= 0 && distance < 620) {
          this.fireEnemyBullet(enemy, 330, 9)
          enemy.shootTimer = randomBetween(1.25, 1.8)
        }
      } else if (enemy.kind === 'boss') {
        const desired = distance > 360 ? 1 : distance < 250 ? -0.38 : 0
        enemy.x += directionX * enemy.speed * desired * dt
        enemy.y += directionY * enemy.speed * desired * dt
        if (enemy.shootTimer <= 0) {
          this.fireBossPattern(enemy)
          const enraged = enemy.hp < enemy.maxHp * 0.45
          enemy.shootTimer = Math.max(0.52, 1.18 - enemy.bossTier * 0.12 - (enraged ? 0.18 : 0))
        }
      } else {
        const wobble =
          enemy.kind === 'splitter' ? Math.sin(this.elapsed * 4 + enemy.orbit) * 0.42 : 0
        enemy.x += (directionX - directionY * wobble) * enemy.speed * dt
        enemy.y += (directionY + directionX * wobble) * enemy.speed * dt
      }

      enemy.x = clamp(enemy.x, enemy.radius, WORLD_WIDTH - enemy.radius)
      enemy.y = clamp(enemy.y, enemy.radius, WORLD_HEIGHT - enemy.radius)

      if (
        enemy.contactTimer <= 0 &&
        distanceSquared(enemy, this.player) < (enemy.radius + this.player.radius) ** 2
      ) {
        enemy.contactTimer = 0.68
        this.damagePlayer(enemy.damage)
        enemy.x -= directionX * 28
        enemy.y -= directionY * 28
      }
    }
    compactInPlace(this.enemies, (enemy) => enemy.hp > 0)
  }

  private fireEnemyBullet(enemy: Enemy, speed: number, damage: number) {
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x)
    this.bullets.push({
      x: enemy.x + Math.cos(angle) * enemy.radius,
      y: enemy.y + Math.sin(angle) * enemy.radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 6,
      damage: damage * this.difficultyScale,
      life: 3.2,
      pierce: 0,
      color: '#ff6d9e',
      enemy: true,
    })
  }

  private fireBossPattern(enemy: Enemy) {
    const baseAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x)
    const phase = Math.floor(this.elapsed * 1.25) % 3
    const enraged = enemy.hp < enemy.maxHp * 0.45
    const count = 5 + enemy.bossTier * 2 + (enraged ? 2 : 0)
    const speed = 260 + enemy.bossTier * 28
    for (let index = 0; index < count; index++) {
      const angle =
        phase === 0
          ? baseAngle + (index - (count - 1) / 2) * 0.16
          : phase === 1
            ? (index / count) * TAU + this.elapsed * 0.55
            : baseAngle + Math.sin(index * 2.4 + this.elapsed) * 0.5
      this.bullets.push({
        x: enemy.x + Math.cos(angle) * enemy.radius,
        y: enemy.y + Math.sin(angle) * enemy.radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 6 + enemy.bossTier * 0.7,
        damage: (8 + enemy.bossTier * 2.2) * this.difficultyScale,
        life: 4.2,
        pierce: 0,
        color: '#ff4fd8',
        enemy: true,
      })
    }
    this.screenShake = Math.max(this.screenShake, 2)
  }

  private damagePlayer(amount: number) {
    if (this.player.invulnerable > 0 || this.ended) return
    const damage = Math.max(1, amount * (1 - this.player.armor))
    this.player.hp -= damage
    this.player.invulnerable = 0.48
    this.screenShake = Math.max(this.screenShake, 10)
    this.damageFlash = 0.68
    this.callbacks.onSound('hurt')
    this.burst(this.player.x, this.player.y, '#ff4f7b', 18, 210)
    this.texts.push({
      x: this.player.x,
      y: this.player.y - 26,
      text: `-${Math.round(damage)}`,
      color: '#ff7597',
      life: 0.8,
      size: 18,
    })
    if (this.player.hp <= 0) {
      this.player.hp = 0
      this.finish(false)
    }
  }

  private spawnEnemies(dt: number) {
    if (this.hasActiveBoss()) return
    this.spawnTimer -= dt
    if (this.spawnTimer > 0 || this.enemies.length >= MAX_ENEMIES) return

    const wave = this.currentWave()
    const threatBudget = Math.min(78, 30 + wave * 4) * (this.difficulty === 'surge' ? 1.15 : 1)
    let currentThreat = this.currentEnemyThreat()
    if (currentThreat >= threatBudget) {
      this.spawnTimer = 0.2
      return
    }
    const interval =
      Math.max(0.2, 0.88 - this.elapsed * 0.00225) / (this.difficulty === 'surge' ? 1.25 : 1)
    this.spawnTimer = interval * randomBetween(0.72, 1.18)
    const batchChance = Math.min(0.72, 0.16 + wave * 0.055)
    const batch = wave >= 4 && Math.random() < batchChance ? (wave >= 10 ? 3 : 2) : 1
    for (let index = 0; index < batch; index++) {
      const kind = this.pickEnemyKind()
      if (currentThreat + ENEMY_THREAT[kind] > threatBudget) break
      const enemy = this.spawnEnemy(kind)
      if (!enemy) break
      currentThreat += this.enemyThreat(enemy)
    }
  }

  private currentEnemyThreat() {
    let threat = 0
    for (const enemy of this.enemies) {
      if (enemy.hp > 0) threat += this.enemyThreat(enemy)
    }
    return threat
  }

  private enemyThreat(enemy: Enemy) {
    return ENEMY_THREAT[enemy.kind] * (enemy.elite ? 1.75 : 1)
  }

  private pickEnemyKind(): EnemyKind {
    const roll = Math.random()
    if (this.elapsed > 100 && roll < 0.17) return 'splitter'
    if (this.elapsed > 65 && roll < 0.36) return 'shooter'
    if (this.elapsed > 30 && roll < 0.58) return 'brute'
    return 'drone'
  }

  private spawnEnemy(kind: EnemyKind, position?: Vector, small = false, bossTier = 0) {
    if (kind !== 'boss' && this.enemies.length >= MAX_ENEMIES) return null
    const spawn = position || this.randomSpawnPoint()
    const progress = 1 + this.elapsed * 0.0045
    const elite =
      kind !== 'boss' && this.elapsed > 80 && Math.random() < Math.min(0.24, this.elapsed / 1300)
    const stats: Record<
      EnemyKind,
      { radius: number; hp: number; speed: number; damage: number; color: string }
    > = {
      drone: {
        radius: small ? 10 : 15,
        hp: small ? 20 : 42,
        speed: small ? 158 : 116,
        damage: 10,
        color: '#ff537d',
      },
      brute: { radius: 24, hp: 138, speed: 67, damage: 18, color: '#ff9f43' },
      shooter: { radius: 17, hp: 72, speed: 82, damage: 10, color: '#bd6cff' },
      splitter: { radius: 19, hp: 92, speed: 102, damage: 13, color: '#48e5c2' },
      boss: { radius: 62, hp: 4200, speed: 58, damage: 26, color: '#ff3bd5' },
    }
    const base = stats[kind]
    const bossHealthScale = [1, 1, 2.15, 4.2][bossTier] || 1
    const healthScale =
      kind === 'boss' ? this.difficultyScale * bossHealthScale : progress * this.difficultyScale
    const eliteScale = elite ? 2.15 : 1
    const enemy: Enemy = {
      id: ++this.enemyId,
      kind,
      x: spawn.x,
      y: spawn.y,
      radius: base.radius * (elite ? 1.18 : 1),
      hp: base.hp * healthScale * eliteScale,
      maxHp: base.hp * healthScale * eliteScale,
      speed: (base.speed + (kind === 'boss' ? bossTier * 4 : 0)) * (elite ? 1.08 : 1),
      damage: base.damage * this.difficultyScale * (elite ? 1.35 : 1),
      color: base.color,
      angle: 0,
      hitFlash: 0,
      contactTimer: 0,
      shootTimer: randomBetween(0.4, 1.4),
      orbit: Math.random() * TAU,
      elite,
      bossTier,
    }
    this.enemies.push(enemy)
    return enemy
  }

  private randomSpawnPoint(): Vector {
    const angle = Math.random() * TAU
    const radius = Math.hypot(this.width, this.height) * 0.58 + randomBetween(90, 220)
    return {
      x: clamp(this.player.x + Math.cos(angle) * radius, 30, WORLD_WIDTH - 30),
      y: clamp(this.player.y + Math.sin(angle) * radius, 30, WORLD_HEIGHT - 30),
    }
  }

  private hasActiveBoss() {
    return this.enemies.some((enemy) => enemy.kind === 'boss' && enemy.hp > 0)
  }

  private updateBossProgression(dt: number) {
    const boss = this.enemies.find((enemy) => enemy.kind === 'boss' && enemy.hp > 0)
    if (boss) {
      this.bossReinforcementTimer -= dt
      if (this.bossReinforcementTimer <= 0) {
        const minionCount = this.enemies.length - 1
        if (minionCount < 26) {
          const count = boss.bossTier + 1
          for (let index = 0; index < count; index++) {
            const kind: EnemyKind = boss.bossTier >= 2 && index === count - 1 ? 'shooter' : 'drone'
            this.spawnEnemy(kind)
          }
        }
        this.bossReinforcementTimer = Math.max(4.2, 7.4 - boss.bossTier * 0.9)
      }
      return
    }

    const nextBossTime = BOSS_TIMES[this.nextBossIndex]
    if (nextBossTime !== undefined && this.elapsed >= nextBossTime) {
      this.spawnBoss(this.nextBossIndex + 1)
    }
  }

  private spawnBoss(tier: number) {
    this.nextBossIndex = tier
    this.bossReinforcementTimer = Math.max(4.2, 7.4 - tier * 0.9)
    const collapsedEnemies = this.collapseEnemiesForBoss()
    for (const bullet of this.bullets) {
      if (bullet.enemy) bullet.life = 0
    }
    const spawn = this.randomSpawnPoint()
    const boss = this.spawnEnemy('boss', spawn, false, tier)
    if (!boss) return
    this.bossId = boss.id
    this.callbacks.onSound('boss')
    this.screenShake = 16
    if (collapsedEnemies > 0) {
      this.texts.push({
        x: this.player.x,
        y: this.player.y - 132,
        text: `星渊坍缩 · 重构 ${collapsedEnemies} 个单位`,
        color: '#8fffee',
        life: 2.1,
        size: 18,
      })
    }
    this.texts.push({
      x: this.player.x,
      y: this.player.y - 100,
      text: tier === BOSS_TIMES.length ? '终局异常核心已降临' : `第 ${tier} 阶段核心已降临`,
      color: '#ff76e4',
      life: 2.4,
      size: 25,
    })
  }

  private collapseEnemiesForBoss() {
    const livingMinions = this.enemies.filter((enemy) => enemy.kind !== 'boss' && enemy.hp > 0)
    if (livingMinions.length <= BOSS_MINION_LIMIT) return 0

    livingMinions.sort(
      (left, right) => distanceSquared(left, this.player) - distanceSquared(right, this.player),
    )
    const retainedIds = new Set(livingMinions.slice(0, BOSS_MINION_LIMIT).map((enemy) => enemy.id))
    const previousCount = this.enemies.length
    compactInPlace(
      this.enemies,
      (enemy) => enemy.kind === 'boss' || (enemy.hp > 0 && retainedIds.has(enemy.id)),
    )
    return previousCount - this.enemies.length
  }

  private killEnemy(enemy: Enemy) {
    enemy.hp = 0
    this.kills += 1
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1
    this.comboTimer = 2.2
    const baseScore =
      enemy.kind === 'boss'
        ? 3500 * enemy.bossTier
        : enemy.elite
          ? 240
          : enemy.kind === 'brute'
            ? 85
            : 45
    this.score += Math.round(baseScore * (1 + Math.min(this.combo, 20) * 0.045))
    this.callbacks.onSound(enemy.kind === 'boss' ? 'boss' : 'kill')
    this.burst(
      enemy.x,
      enemy.y,
      enemy.color,
      enemy.kind === 'boss' ? 42 : enemy.elite ? 18 : 10,
      enemy.kind === 'boss' ? 360 : 185,
    )

    const xpValue =
      enemy.kind === 'boss'
        ? 100 + enemy.bossTier * 55
        : enemy.elite
          ? 24
          : enemy.kind === 'brute'
            ? 10
            : enemy.kind === 'shooter'
              ? 8
              : 6
    const drops = enemy.kind === 'boss' ? 4 + enemy.bossTier * 2 : enemy.elite ? 2 : 1
    for (let index = 0; index < drops; index++) {
      this.addPickup({
        x: enemy.x + randomBetween(-enemy.radius, enemy.radius),
        y: enemy.y + randomBetween(-enemy.radius, enemy.radius),
        kind: 'xp',
        value: xpValue / drops,
        radius: enemy.kind === 'boss' ? 7 : enemy.elite ? 6 : 5,
        life: 24,
        phase: Math.random() * TAU,
      })
    }
    if (enemy.kind !== 'boss' && Math.random() < 0.035) {
      this.addPickup({
        x: enemy.x,
        y: enemy.y,
        kind: 'heal',
        value: 18,
        radius: 8,
        life: 18,
        phase: Math.random() * TAU,
      })
    }
    if (enemy.kind === 'splitter') {
      if (this.enemies.length < MAX_ENEMIES) {
        this.spawnEnemy('drone', { x: enemy.x - 10, y: enemy.y }, true)
      }
      if (this.enemies.length < MAX_ENEMIES) {
        this.spawnEnemy('drone', { x: enemy.x + 10, y: enemy.y }, true)
      }
    }
    if (enemy.kind === 'boss') {
      this.bossId = 0
      this.bossReinforcementTimer = 0
      for (const bullet of this.bullets) {
        if (bullet.enemy) bullet.life = 0
      }

      if (enemy.bossTier >= BOSS_TIMES.length) {
        this.finish(true)
      } else {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.28)
        this.texts.push({
          x: this.player.x,
          y: this.player.y - 86,
          text: `阶段核心 ${enemy.bossTier}/${BOSS_TIMES.length} 已清除`,
          color: '#8fffee',
          life: 2.2,
          size: 23,
        })
      }
    }
  }

  private addPickup(pickup: Pickup) {
    if (this.pickups.length < MAX_PICKUPS) {
      this.pickups.push(pickup)
      return
    }

    let closest: Pickup | null = null
    let closestDistance = Number.POSITIVE_INFINITY
    for (const candidate of this.pickups) {
      if (candidate.kind !== pickup.kind) continue
      const distance = distanceSquared(candidate, pickup)
      if (distance >= closestDistance) continue
      closest = candidate
      closestDistance = distance
    }

    if (closest) {
      closest.value += pickup.value
      closest.radius = Math.min(pickup.kind === 'xp' ? 10 : 12, closest.radius + 0.2)
      closest.life = Math.max(closest.life, pickup.life)
      return
    }

    const replaceableIndex = this.pickups.findIndex((candidate) => candidate.kind === 'xp')
    if (replaceableIndex >= 0) this.pickups[replaceableIndex] = pickup
  }

  private updatePickups(dt: number) {
    for (const pickup of this.pickups) {
      pickup.life -= dt
      pickup.phase += dt * 3
      const distance = Math.sqrt(distanceSquared(pickup, this.player)) || 1
      if (distance < this.player.magnet) {
        const pull = clamp((this.player.magnet - distance) / this.player.magnet, 0.18, 1)
        pickup.x += ((this.player.x - pickup.x) / distance) * (180 + 620 * pull) * dt
        pickup.y += ((this.player.y - pickup.y) / distance) * (180 + 620 * pull) * dt
      }
      if (distance < pickup.radius + this.player.radius + 5) {
        pickup.life = 0
        if (pickup.kind === 'xp') this.gainXp(pickup.value)
        else this.player.hp = Math.min(this.player.maxHp, this.player.hp + pickup.value)
        this.callbacks.onSound('pickup')
        this.burst(pickup.x, pickup.y, pickup.kind === 'xp' ? '#80ffea' : '#7dff92', 6, 95)
      }
    }
    compactInPlace(this.pickups, (pickup) => pickup.life > 0)
  }

  private gainXp(amount: number) {
    this.player.xp += amount
    if (this.player.xp >= this.player.nextXp && !this.pendingLevelUp) this.triggerLevelUp()
  }

  private triggerLevelUp() {
    this.player.xp -= this.player.nextXp
    this.player.level += 1
    this.player.nextXp = Math.round(this.player.nextXp * 1.22 + 9)
    this.pendingLevelUp = true
    this.active = false
    this.callbacks.onSound('level')
    this.callbacks.onLevelUp(this.pickUpgradeOptions())
    this.emitHud()
  }

  private pickUpgradeOptions(): UpgradeOption[] {
    const available = UPGRADES.filter(
      (upgrade) => (this.upgradeLevels.get(upgrade.id) || 0) < upgrade.maxLevel,
    )
    const selected: UpgradeDefinition[] = []
    const pool = [...available]
    while (selected.length < 3 && pool.length) {
      const weighted = pool.flatMap((upgrade) => {
        const count = upgrade.rarity === 'common' ? 5 : upgrade.rarity === 'rare' ? 3 : 1
        return new Array(count).fill(upgrade) as UpgradeDefinition[]
      })
      const picked = weighted[Math.floor(Math.random() * weighted.length)]
      selected.push(picked)
      pool.splice(pool.indexOf(picked), 1)
    }
    return selected.map((upgrade) => {
      const level = (this.upgradeLevels.get(upgrade.id) || 0) + 1
      return {
        id: upgrade.id,
        icon: upgrade.icon,
        title: upgrade.title,
        description: upgrade.describe(level),
        rarity: upgrade.rarity,
        level,
      }
    })
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) {
      particle.life -= dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      const damping = Math.pow(particle.drag, dt * 60)
      particle.vx *= damping
      particle.vy *= damping
    }
    for (const text of this.texts) {
      text.life -= dt
      text.y -= 34 * dt
    }
    compactInPlace(this.particles, (particle) => particle.life > 0)
    compactInPlace(this.texts, (text) => text.life > 0)
  }

  private updateEffectQuality() {
    if (this.lowPowerMode) {
      this.reducedEffects = true
      return
    }

    const underHeavyLoad =
      this.enemies.length > 56 ||
      this.bullets.length > 150 ||
      this.particles.length > 240 ||
      this.pickups.length > 64
    const safelyRecovered =
      this.enemies.length < 44 &&
      this.bullets.length < 110 &&
      this.particles.length < 150 &&
      this.pickups.length < 48

    if (underHeavyLoad) this.reducedEffects = true
    else if (safelyRecovered) this.reducedEffects = false
  }

  private addParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    life: number,
    drag = 0.94,
  ) {
    const budget = this.reducedEffects ? Math.min(this.particleBudget, 220) : this.particleBudget
    if (this.particles.length >= budget) return
    this.particles.push({ x, y, vx, vy, color, size, life, maxLife: life, drag })
  }

  private burst(x: number, y: number, color: string, count: number, speed: number) {
    const budget = this.reducedEffects ? Math.min(this.particleBudget, 220) : this.particleBudget
    const available = Math.max(0, budget - this.particles.length)
    const particleCount = Math.min(count, available)
    for (let index = 0; index < particleCount; index++) {
      const angle = Math.random() * TAU
      const velocity = randomBetween(speed * 0.25, speed)
      this.addParticle(
        x,
        y,
        Math.cos(angle) * velocity,
        Math.sin(angle) * velocity,
        color,
        randomBetween(2, 7),
        randomBetween(0.28, 0.8),
        0.93,
      )
    }
  }

  private hitBurst(x: number, y: number, color: string) {
    const count = this.reducedEffects ? 1 : 2
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * TAU
      const velocity = randomBetween(60, 150)
      this.addParticle(
        x,
        y,
        Math.cos(angle) * velocity,
        Math.sin(angle) * velocity,
        color,
        randomBetween(2, 4),
        0.22,
      )
    }
  }

  private finish(victory: boolean) {
    if (this.ended) return
    this.ended = true
    this.active = false
    this.input.firing = false
    if (victory) this.score += Math.max(0, Math.round(this.player.hp * 22))
    this.emitHud()
    const summary: RunSummary = {
      score: this.score,
      kills: this.kills,
      level: this.player.level,
      elapsed: this.elapsed,
      victory,
    }
    this.finishTimerId = window.setTimeout(
      () => {
        this.finishTimerId = null
        this.callbacks.onEnd(summary)
      },
      victory ? 650 : 350,
    )
  }

  private currentWave() {
    return Math.min(12, Math.floor(this.elapsed / 30) + 1)
  }

  private emitHud() {
    const boss = this.enemies.find((enemy) => enemy.id === this.bossId && enemy.hp > 0)
    const nextBossTime = BOSS_TIMES[this.nextBossIndex] ?? RUN_DURATION
    const bossStage = boss?.bossTier || Math.min(this.nextBossIndex + 1, BOSS_TIMES.length)
    const hud: GameHud = {
      elapsed: this.elapsed,
      remaining: boss ? 0 : Math.max(0, nextBossTime - this.elapsed),
      wave: this.currentWave(),
      kills: this.kills,
      score: this.score,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      xp: this.player.xp,
      nextXp: this.player.nextXp,
      level: this.player.level,
      dashRatio: 1 - clamp(this.player.dashTimer / this.player.dashCooldown, 0, 1),
      bossHp: boss?.hp || 0,
      bossMaxHp: boss?.maxHp || 0,
      bossStage,
      bossTotal: BOSS_TIMES.length,
      combo: this.combo,
      comboTimer: this.comboTimer,
    }
    this.callbacks.onHud(hud)
  }

  private updateCamera() {
    this.camera.x = clamp(this.player.x - this.width / 2, 0, Math.max(0, WORLD_WIDTH - this.width))
    this.camera.y = clamp(
      this.player.y - this.height / 2,
      0,
      Math.max(0, WORLD_HEIGHT - this.height),
    )
  }

  private generateStars() {
    this.stars = Array.from({ length: 280 }, () => ({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      size: randomBetween(0.6, 2.2),
      alpha: randomBetween(0.18, 0.82),
      layer: randomBetween(0.3, 1),
    }))
  }

  private draw() {
    renderNeonFrame({
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      camera: this.camera,
      screenShake: this.screenShake,
      damageFlash: this.damageFlash,
      vignetteGradient: this.vignetteGradient,
      elapsed: this.elapsed,
      reducedEffects: this.reducedEffects,
      stars: this.stars,
      pickups: this.pickups,
      bullets: this.bullets,
      enemies: this.enemies,
      player: this.player,
      particles: this.particles,
      texts: this.texts,
      input: this.input,
    })
  }

}

export { BOSS_TIMES, RUN_DURATION }
