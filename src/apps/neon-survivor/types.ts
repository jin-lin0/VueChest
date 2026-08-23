export type GamePhase = 'menu' | 'playing' | 'paused' | 'levelup' | 'gameover' | 'victory'

export type Difficulty = 'normal' | 'surge'

export type EnemyKind = 'drone' | 'brute' | 'shooter' | 'splitter' | 'boss'

export type UpgradeRarity = 'common' | 'rare' | 'epic'

export interface Vector {
  x: number
  y: number
}

export interface Player extends Vector {
  radius: number
  angle: number
  hp: number
  maxHp: number
  speed: number
  damage: number
  fireRate: number
  bulletSpeed: number
  bulletSize: number
  multishot: number
  spread: number
  pierce: number
  critChance: number
  magnet: number
  armor: number
  regen: number
  dashCooldown: number
  dashTimer: number
  dashTime: number
  invulnerable: number
  fireTimer: number
  level: number
  xp: number
  nextXp: number
}

export interface Enemy extends Vector {
  id: number
  kind: EnemyKind
  radius: number
  hp: number
  maxHp: number
  speed: number
  damage: number
  color: string
  angle: number
  hitFlash: number
  contactTimer: number
  shootTimer: number
  orbit: number
  elite: boolean
}

export interface Bullet extends Vector {
  vx: number
  vy: number
  radius: number
  damage: number
  life: number
  pierce: number
  color: string
  enemy: boolean
  trail: Vector[]
}

export interface Pickup extends Vector {
  kind: 'xp' | 'heal'
  value: number
  radius: number
  life: number
  phase: number
}

export interface Particle extends Vector {
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  drag: number
}

export interface FloatingText extends Vector {
  text: string
  color: string
  life: number
  size: number
}

export interface Star extends Vector {
  size: number
  alpha: number
  layer: number
}

export interface UpgradeOption {
  id: string
  icon: string
  title: string
  description: string
  rarity: UpgradeRarity
  level: number
}

export interface UpgradeDefinition {
  id: string
  icon: string
  title: string
  rarity: UpgradeRarity
  maxLevel: number
  describe: (nextLevel: number) => string
  apply: (player: Player, nextLevel: number) => void
}

export interface GameHud {
  elapsed: number
  remaining: number
  wave: number
  kills: number
  score: number
  hp: number
  maxHp: number
  xp: number
  nextXp: number
  level: number
  dashRatio: number
  bossHp: number
  bossMaxHp: number
  combo: number
  comboTimer: number
}

export interface RunSummary {
  score: number
  kills: number
  level: number
  elapsed: number
  victory: boolean
}

export interface EngineCallbacks {
  onHud: (hud: GameHud) => void
  onLevelUp: (options: UpgradeOption[]) => void
  onEnd: (summary: RunSummary) => void
  onSound: (name: 'shoot' | 'hit' | 'kill' | 'hurt' | 'dash' | 'pickup' | 'level' | 'boss') => void
}

export interface GameInput {
  keys: Set<string>
  pointer: Vector
  pointerActive: boolean
  firing: boolean
  moveStick: Vector
  aimStick: Vector
  touchAiming: boolean
  dashQueued: boolean
}
