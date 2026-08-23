import { openDB, type IDBPDatabase } from 'idb'
import type { FixedTrackId } from './game'

export interface GhostFrame {
  time: number
  x: number
  z: number
  rotation: number
  speed: number
}

export interface GhostLap {
  version: 1
  trackId: FixedTrackId
  carId: number
  lapTime: number
  frames: GhostFrame[]
}

const DB_NAME = 'vue-chest-racing'
const STORE_NAME = 'ghosts'
const DB_VERSION = 1
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      },
    })
  }
  return dbPromise
}

export function ghostKey(trackId: FixedTrackId, carId: number): string {
  return `${trackId}:${carId}`
}

export async function loadGhost(trackId: FixedTrackId, carId: number): Promise<GhostLap | null> {
  try {
    const value = await (await getDb()).get(STORE_NAME, ghostKey(trackId, carId))
    return isGhostLap(value) ? value : null
  } catch {
    return null
  }
}

export async function saveGhost(lap: GhostLap): Promise<void> {
  try {
    await (await getDb()).put(STORE_NAME, lap, ghostKey(lap.trackId, lap.carId))
  } catch {
    // 幽灵车存储失败不影响比赛结算。
  }
}

export function isGhostLap(value: unknown): value is GhostLap {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    o.version === 1 &&
    (o.trackId === 'forest' || o.trackId === 'desert' || o.trackId === 'snow') &&
    typeof o.carId === 'number' &&
    typeof o.lapTime === 'number' &&
    Array.isArray(o.frames) &&
    o.frames.length > 1
  )
}

export class GhostRecorder {
  private frames: GhostFrame[] = []
  private lastSample = -Infinity
  constructor(private readonly sampleInterval = 0.05) {}

  reset(): void {
    this.frames = []
    this.lastSample = -Infinity
  }

  sample(frame: GhostFrame): void {
    if (frame.time - this.lastSample < this.sampleInterval) return
    this.frames.push({ ...frame })
    this.lastSample = frame.time
  }

  finish(trackId: FixedTrackId, carId: number, lapTime: number): GhostLap {
    return { version: 1, trackId, carId, lapTime, frames: this.frames.map((f) => ({ ...f })) }
  }
}

export function interpolateGhost(frames: GhostFrame[], time: number): GhostFrame | null {
  if (!frames.length) return null
  if (time <= frames[0].time) return { ...frames[0] }
  const last = frames[frames.length - 1]
  if (time >= last.time) return { ...last }
  let low = 0
  let high = frames.length - 1
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    if (frames[mid].time <= time) low = mid
    else high = mid
  }
  const a = frames[low]
  const b = frames[high]
  const ratio = (time - a.time) / Math.max(0.0001, b.time - a.time)
  let rotationDelta = ((b.rotation - a.rotation + Math.PI) % (Math.PI * 2)) - Math.PI
  if (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2
  return {
    time,
    x: a.x + (b.x - a.x) * ratio,
    z: a.z + (b.z - a.z) * ratio,
    rotation: a.rotation + rotationDelta * ratio,
    speed: a.speed + (b.speed - a.speed) * ratio,
  }
}
