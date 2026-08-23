export type RaceMode = 'quick' | 'time-trial' | 'knockout' | 'item-battle' | 'championship'
export type TrackId = 'forest' | 'desert' | 'snow' | 'random'
export type FixedTrackId = Exclude<TrackId, 'random'>
export type Difficulty = 'casual' | 'standard' | 'expert'
export type QualityPreset = 'low' | 'medium' | 'high'
export type GhostMode = 'personal' | 'gold' | 'off'
export type Medal = 'none' | 'bronze' | 'silver' | 'gold'
export type LiveryId = 'classic' | 'duotone' | 'sandstorm' | 'glacier' | 'champion-metal' | 'champion-stripe'

export interface RaceConfig {
  mode: RaceMode
  trackId: TrackId
  difficulty: Difficulty
  laps: 1 | 3 | 5
  aiCount: 0 | 1 | 2 | 3
  localPlayers: 1 | 2
}

export interface TrackDefinition {
  id: FixedTrackId
  name: string
  subtitle: string
  seed: number
  width: number
  checkpoints: number
  medalLapTimes: { bronze: number; silver: number; gold: number }
  assetManifest: string
  sky: number
  fog: number
  ground: number
  accent: string
  difficulty: string
}

export interface RacingSettings {
  quality: QualityPreset
  cameraShake: boolean
  speedFov: boolean
  particles: number
  autoAccelerate: boolean
  steeringSensitivity: number
  touchControls: boolean | 'auto'
  masterVolume: number
  engineVolume: number
  effectsVolume: number
  ghostMode: GhostMode
  ghostOpacity: number
  largeText: boolean
  colorAssist: boolean
  keyBindings: Record<string, string>
}

export const TRACKS: Record<FixedTrackId, TrackDefinition> = {
  forest: {
    id: 'forest',
    name: '翠影森林',
    subtitle: '宽阔林道 · 缓弯与发卡弯',
    seed: 1847,
    width: 24,
    checkpoints: 5,
    medalLapTimes: { bronze: 45, silver: 38, gold: 33 },
    assetManifest: '/assets/racing/forest/manifest.json',
    sky: 0x9bd7ff,
    fog: 0xaad7ce,
    ground: 0x315b35,
    accent: '#4ee28a',
    difficulty: '入门',
  },
  desert: {
    id: 'desert',
    name: '赤沙峡谷',
    subtitle: '连续组合弯 · 漂移圣地',
    seed: 6329,
    width: 18,
    checkpoints: 6,
    medalLapTimes: { bronze: 50, silver: 42, gold: 36 },
    assetManifest: '/assets/racing/desert/manifest.json',
    sky: 0xf6b36a,
    fog: 0xd99155,
    ground: 0x8f4e2d,
    accent: '#ff9f43',
    difficulty: '进阶',
  },
  snow: {
    id: 'snow',
    name: '极光雪原',
    subtitle: '高速直道 · S 弯与减速区',
    seed: 9173,
    width: 20,
    checkpoints: 5,
    medalLapTimes: { bronze: 43, silver: 36, gold: 31 },
    assetManifest: '/assets/racing/snow/manifest.json',
    sky: 0x8faee8,
    fog: 0xc8d8ef,
    ground: 0xe8f2ff,
    accent: '#7de7ff',
    difficulty: '高速',
  },
}

export const DEFAULT_RACE_CONFIG: RaceConfig = {
  mode: 'quick',
  trackId: 'forest',
  difficulty: 'standard',
  laps: 3,
  aiCount: 3,
  localPlayers: 1,
}

export const DEFAULT_KEY_BINDINGS: Record<string, string> = {
  p1Left: 'a',
  p1Right: 'd',
  p1Gas: 'w',
  p1Brake: 's',
  p1Action: ' ',
  p1Reset: 'r',
  p2Left: 'ArrowLeft',
  p2Right: 'ArrowRight',
  p2Gas: 'ArrowUp',
  p2Brake: 'ArrowDown',
  p2Action: 'Shift',
  p2Reset: '.',
}

export const DEFAULT_RACING_SETTINGS: RacingSettings = {
  quality: 'high',
  cameraShake: true,
  speedFov: true,
  particles: 100,
  autoAccelerate: false,
  steeringSensitivity: 1,
  touchControls: 'auto',
  masterVolume: 0.85,
  engineVolume: 0.75,
  effectsVolume: 0.9,
  ghostMode: 'personal',
  ghostOpacity: 0.32,
  largeText: false,
  colorAssist: false,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
}

export const MODE_LABELS: Record<RaceMode, { label: string; description: string }> = {
  quick: { label: '快速比赛', description: '纯粹竞速，漂移为氮气充能' },
  'time-trial': { label: '计时挑战', description: '挑战奖牌与最佳幽灵' },
  knockout: { label: '淘汰赛', description: '每圈淘汰最后一名' },
  'item-battle': { label: '道具乱斗', description: '拾取道具，欢乐反击' },
  championship: { label: '三站锦标赛', description: '三条赛道累计积分' },
}

export function normalizeRaceConfig(config: RaceConfig): RaceConfig {
  if (config.mode === 'time-trial') {
    return { ...config, localPlayers: 1, aiCount: 0, laps: 3, trackId: config.trackId === 'random' ? 'forest' : config.trackId }
  }
  if (config.mode === 'knockout') {
    return { ...config, localPlayers: 1, aiCount: 3, laps: 3 }
  }
  if (config.mode === 'item-battle') {
    return { ...config, aiCount: config.localPlayers === 2 ? 0 : 3, laps: 3 }
  }
  if (config.mode === 'championship') {
    return { ...config, localPlayers: 1, aiCount: 3, laps: 3, trackId: 'forest' }
  }
  return config
}

export function getMedal(track: TrackDefinition, lapTime: number): Medal {
  if (!Number.isFinite(lapTime) || lapTime <= 0) return 'none'
  if (lapTime <= track.medalLapTimes.gold) return 'gold'
  if (lapTime <= track.medalLapTimes.silver) return 'silver'
  if (lapTime <= track.medalLapTimes.bronze) return 'bronze'
  return 'none'
}

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
