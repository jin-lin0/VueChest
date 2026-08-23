import { STORAGE_KEYS } from '@/config/storage-keys'
import {
  DEFAULT_RACING_SETTINGS,
  DEFAULT_RACE_CONFIG,
  normalizeRaceConfig,
  type FixedTrackId,
  type LiveryId,
  type Medal,
  type RacingSettings,
  type RaceConfig,
} from './game'
import { MEDAL_WEIGHT } from './rules'

export interface RacingRecord {
  trackId: FixedTrackId
  carId: number
  bestLap: number
  bestTotal: number
  medal: Medal
}

export interface RacingSaveV1 {
  version: 1
  records: Record<string, RacingRecord>
  unlockedLiveries: LiveryId[]
  selectedLivery: LiveryId
  championshipWins: number
}

export const DEFAULT_RACING_SAVE: RacingSaveV1 = {
  version: 1,
  records: {},
  unlockedLiveries: ['classic'],
  selectedLivery: 'classic',
  championshipWins: 0,
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储不可用不应中断游戏。
  }
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function loadRacingSettings(): RacingSettings {
  const parsed = readJson(STORAGE_KEYS.RACING_SETTINGS)
  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_RACING_SETTINGS, keyBindings: { ...DEFAULT_RACING_SETTINGS.keyBindings } }
  }
  const o = parsed as Record<string, unknown>
  const d = DEFAULT_RACING_SETTINGS
  return {
    quality:
      o.quality === 'low' || o.quality === 'medium' || o.quality === 'high' ? o.quality : d.quality,
    cameraShake: typeof o.cameraShake === 'boolean' ? o.cameraShake : d.cameraShake,
    speedFov: typeof o.speedFov === 'boolean' ? o.speedFov : d.speedFov,
    particles: finiteNumber(o.particles, d.particles, 0, 100),
    autoAccelerate: typeof o.autoAccelerate === 'boolean' ? o.autoAccelerate : d.autoAccelerate,
    steeringSensitivity: finiteNumber(o.steeringSensitivity, d.steeringSensitivity, 0.5, 1.5),
    touchControls:
      o.touchControls === true || o.touchControls === false || o.touchControls === 'auto'
        ? o.touchControls
        : d.touchControls,
    masterVolume: finiteNumber(o.masterVolume, d.masterVolume, 0, 1),
    engineVolume: finiteNumber(o.engineVolume, d.engineVolume, 0, 1),
    effectsVolume: finiteNumber(o.effectsVolume, d.effectsVolume, 0, 1),
    ghostMode:
      o.ghostMode === 'personal' || o.ghostMode === 'gold' || o.ghostMode === 'off'
        ? o.ghostMode
        : d.ghostMode,
    ghostOpacity: finiteNumber(o.ghostOpacity, d.ghostOpacity, 0.1, 0.7),
    largeText: typeof o.largeText === 'boolean' ? o.largeText : d.largeText,
    colorAssist: typeof o.colorAssist === 'boolean' ? o.colorAssist : d.colorAssist,
    keyBindings:
      o.keyBindings && typeof o.keyBindings === 'object'
        ? { ...d.keyBindings, ...(o.keyBindings as Record<string, string>) }
        : { ...d.keyBindings },
  }
}

export function saveRacingSettings(settings: RacingSettings): void {
  writeJson(STORAGE_KEYS.RACING_SETTINGS, settings)
}

export function loadRaceConfig(): RaceConfig {
  const parsed = readJson(STORAGE_KEYS.RACING_CONFIG)
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_RACE_CONFIG }
  const o = parsed as Record<string, unknown>
  const mode = ['quick', 'time-trial', 'knockout', 'item-battle', 'championship'].includes(
    String(o.mode),
  )
    ? (o.mode as RaceConfig['mode'])
    : DEFAULT_RACE_CONFIG.mode
  const trackId = ['forest', 'desert', 'snow', 'random'].includes(String(o.trackId))
    ? (o.trackId as RaceConfig['trackId'])
    : DEFAULT_RACE_CONFIG.trackId
  const difficulty = ['casual', 'standard', 'expert'].includes(String(o.difficulty))
    ? (o.difficulty as RaceConfig['difficulty'])
    : DEFAULT_RACE_CONFIG.difficulty
  const laps = [1, 3, 5].includes(Number(o.laps))
    ? (Number(o.laps) as RaceConfig['laps'])
    : DEFAULT_RACE_CONFIG.laps
  const aiCount = [0, 1, 2, 3].includes(Number(o.aiCount))
    ? (Number(o.aiCount) as RaceConfig['aiCount'])
    : DEFAULT_RACE_CONFIG.aiCount
  const localPlayers = o.localPlayers === 2 ? 2 : 1
  return normalizeRaceConfig({ mode, trackId, difficulty, laps, aiCount, localPlayers })
}

export function saveRaceConfig(config: RaceConfig): void {
  writeJson(STORAGE_KEYS.RACING_CONFIG, config)
}

function isMedal(value: unknown): value is Medal {
  return value === 'none' || value === 'bronze' || value === 'silver' || value === 'gold'
}

export function loadRacingSave(): RacingSaveV1 {
  const parsed = readJson(STORAGE_KEYS.RACING_SAVE)
  if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_RACING_SAVE)
  const o = parsed as Record<string, unknown>
  const records: Record<string, RacingRecord> = {}
  if (o.records && typeof o.records === 'object') {
    for (const [key, raw] of Object.entries(o.records as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      if (
        (r.trackId !== 'forest' && r.trackId !== 'desert' && r.trackId !== 'snow') ||
        typeof r.carId !== 'number'
      )
        continue
      records[key] = {
        trackId: r.trackId,
        carId: r.carId,
        bestLap: finiteNumber(r.bestLap, 0, 0, 3600),
        bestTotal: finiteNumber(r.bestTotal, 0, 0, 36000),
        medal: isMedal(r.medal) ? r.medal : 'none',
      }
    }
  }
  const liveries: LiveryId[] = Array.isArray(o.unlockedLiveries)
    ? o.unlockedLiveries.filter((v): v is LiveryId =>
        [
          'classic',
          'duotone',
          'sandstorm',
          'glacier',
          'champion-metal',
          'champion-stripe',
        ].includes(String(v)),
      )
    : ['classic']
  const selected = liveries.includes(o.selectedLivery as LiveryId)
    ? (o.selectedLivery as LiveryId)
    : 'classic'
  return {
    version: 1,
    records,
    unlockedLiveries: liveries.includes('classic') ? liveries : ['classic', ...liveries],
    selectedLivery: selected,
    championshipWins: finiteNumber(o.championshipWins, 0, 0, 9999),
  }
}

export function saveRacingSave(save: RacingSaveV1): void {
  writeJson(STORAGE_KEYS.RACING_SAVE, save)
}

export function recordKey(trackId: FixedTrackId, carId: number): string {
  return `${trackId}:${carId}`
}

export function updateRecord(
  save: RacingSaveV1,
  record: RacingRecord,
): { save: RacingSaveV1; improved: boolean } {
  const key = recordKey(record.trackId, record.carId)
  const current = save.records[key]
  const bestLap =
    !current?.bestLap || (record.bestLap > 0 && record.bestLap < current.bestLap)
      ? record.bestLap
      : current.bestLap
  const bestTotal =
    !current?.bestTotal || (record.bestTotal > 0 && record.bestTotal < current.bestTotal)
      ? record.bestTotal
      : current.bestTotal
  const medal =
    !current || MEDAL_WEIGHT[record.medal] > MEDAL_WEIGHT[current.medal]
      ? record.medal
      : current.medal
  const improved =
    !current ||
    bestLap !== current.bestLap ||
    bestTotal !== current.bestTotal ||
    medal !== current.medal
  const next = {
    ...save,
    records: { ...save.records, [key]: { ...record, bestLap, bestTotal, medal } },
  }
  return { save: applyUnlocks(next), improved }
}

export function applyUnlocks(save: RacingSaveV1): RacingSaveV1 {
  const bestByTrack = new Map<FixedTrackId, Medal>()
  for (const record of Object.values(save.records)) {
    const current = bestByTrack.get(record.trackId) ?? 'none'
    if (MEDAL_WEIGHT[record.medal] > MEDAL_WEIGHT[current])
      bestByTrack.set(record.trackId, record.medal)
  }
  const medals = [...bestByTrack.values()]
  const unlocked = new Set<LiveryId>(['classic'])
  if (medals.some((m) => MEDAL_WEIGHT[m] > 0)) unlocked.add('duotone')
  if (medals.filter((m) => MEDAL_WEIGHT[m] >= 1).length >= 3) unlocked.add('sandstorm')
  if (medals.filter((m) => MEDAL_WEIGHT[m] >= 2).length >= 3) unlocked.add('glacier')
  if (medals.filter((m) => MEDAL_WEIGHT[m] >= 3).length >= 3) unlocked.add('champion-metal')
  if (save.championshipWins > 0) unlocked.add('champion-stripe')
  const selectedLivery = unlocked.has(save.selectedLivery) ? save.selectedLivery : 'classic'
  return { ...save, unlockedLiveries: [...unlocked], selectedLivery }
}
