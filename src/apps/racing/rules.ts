import type { Difficulty, Medal } from './game'

export type DriftLevel = 'none' | 'good' | 'great' | 'perfect'
export type ItemId = 'nitro' | 'shield' | 'missile' | 'magnet' | 'oil' | 'roadblock' | 'jammer' | 'swap'

export interface ComboState {
  value: number
  idle: number
}

export interface ChampionshipEntry {
  racerId: string
  points: number
  wins: number
  totalTime: number
}

export const DRIFT_THRESHOLDS = { good: 25, great: 55, perfect: 90 } as const

export function driftLevel(charge: number): DriftLevel {
  if (charge >= DRIFT_THRESHOLDS.perfect) return 'perfect'
  if (charge >= DRIFT_THRESHOLDS.great) return 'great'
  if (charge >= DRIFT_THRESHOLDS.good) return 'good'
  return 'none'
}

export function driftBoostMultiplier(level: DriftLevel): number {
  if (level === 'perfect') return 1.16
  if (level === 'great') return 1.1
  if (level === 'good') return 1.05
  return 1
}

export function perfectStart(offsetSeconds: number, windowSeconds = 0.15): 'perfect' | 'burnout' | 'normal' {
  if (Math.abs(offsetSeconds) <= windowSeconds) return 'perfect'
  if (offsetSeconds < -windowSeconds) return 'burnout'
  return 'normal'
}

export function resolveHit(
  speed: number,
  shieldHits: number,
  multiplier: number,
): { speed: number; shieldHits: number; blocked: boolean } {
  if (shieldHits > 0) return { speed, shieldHits: shieldHits - 1, blocked: true }
  return { speed: speed * multiplier, shieldHits: 0, blocked: false }
}

export function tickCombo(state: ComboState, delta: number): ComboState {
  if (state.value <= 0) return { value: 0, idle: 0 }
  const idle = state.idle + delta
  if (idle < 3) return { ...state, idle }
  const decaySteps = Math.floor(idle - 3) + 1
  return { value: Math.max(0, state.value - decaySteps), idle: 3 + ((idle - 3) % 1) }
}

export function addCombo(state: ComboState, amount = 1): ComboState {
  return { value: Math.min(10, state.value + amount), idle: 0 }
}

const ITEM_POOLS: Record<'leader' | 'middle' | 'trailing', ItemId[]> = {
  leader: ['shield', 'oil', 'roadblock', 'nitro', 'shield', 'oil'],
  middle: ['missile', 'magnet', 'nitro', 'shield', 'oil', 'jammer'],
  trailing: ['nitro', 'nitro', 'missile', 'swap', 'magnet', 'jammer'],
}

export function itemPoolForRank(rank: number, total: number): ItemId[] {
  if (rank <= 1) return [...ITEM_POOLS.leader]
  if (rank >= total) return [...ITEM_POOLS.trailing]
  return [...ITEM_POOLS.middle]
}

export function pickItem(rank: number, total: number, random = Math.random): ItemId {
  const pool = itemPoolForRank(rank, total)
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

export const AI_DIFFICULTY: Record<
  Difficulty,
  { pace: number; mistakeChance: number; rubberGap: number; catchUp: number; leadSlowdown: number }
> = {
  casual: { pace: 0.86, mistakeChance: 0.12, rubberGap: 12, catchUp: 1.15, leadSlowdown: 0.88 },
  standard: { pace: 0.96, mistakeChance: 0.05, rubberGap: 18, catchUp: 1.08, leadSlowdown: 0.95 },
  expert: { pace: 1.04, mistakeChance: 0.01, rubberGap: Infinity, catchUp: 1, leadSlowdown: 1 },
}

export function championshipPoints(rank: number): number {
  return [10, 6, 4, 2][rank - 1] ?? 0
}

export function sortChampionship(entries: ChampionshipEntry[]): ChampionshipEntry[] {
  return [...entries].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.totalTime - b.totalTime,
  )
}

export const MEDAL_WEIGHT: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 }
