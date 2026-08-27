import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config/storage-keys'
import type { Beatmap } from './beatmap'

export interface RhythmScoreRecord {
  id: string
  songId: string
  title: string
  difficulty: string
  score: number
  accuracy: number
  rank: string
  maxCombo: number
  miss: number
  averageError: number
  playedAt: number
}

export function loadRhythmScores() {
  return getStorage<RhythmScoreRecord[]>(STORAGE_KEYS.RHYTHM_SCORES, []) || []
}

export function saveRhythmScore(record: Omit<RhythmScoreRecord, 'id' | 'playedAt'>) {
  const scores = [
    { ...record, id: crypto.randomUUID(), playedAt: Date.now() },
    ...loadRhythmScores(),
  ].slice(0, 100)
  setStorage(STORAGE_KEYS.RHYTHM_SCORES, scores)
  return scores
}

export function scoresForSong(scores: RhythmScoreRecord[], songId: string) {
  return scores
    .filter((item) => item.songId === songId)
    .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
}

export function validateBeatmap(value: unknown): Beatmap {
  if (!value || typeof value !== 'object') throw new Error('谱面格式无效')
  const map = value as Partial<Beatmap>
  if (
    typeof map.songId !== 'string' ||
    typeof map.title !== 'string' ||
    typeof map.bpm !== 'number' ||
    !Number.isFinite(map.bpm) ||
    typeof map.duration !== 'number' ||
    !Array.isArray(map.notes) ||
    !map.meta ||
    typeof map.meta !== 'object'
  ) {
    throw new Error('谱面缺少必要字段')
  }
  if (map.notes.length > 100_000) throw new Error('谱面音符数量超过限制')
  const lanes = Number(map.lanes)
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 8) throw new Error('谱面轨道数量无效')
  const notes = map.notes.map((note) => {
    if (
      typeof note?.time !== 'number' ||
      !Number.isFinite(note.time) ||
      note.time < 0 ||
      !Number.isInteger(note.lane) ||
      note.lane < 0 ||
      note.lane >= lanes
    ) {
      throw new Error('谱面包含无效音符')
    }
    return { time: note.time, lane: note.lane, duration: note.duration }
  })
  return { ...(map as Beatmap), lanes, notes }
}

export function sliceBeatmap(map: Beatmap, start: number, end: number): Beatmap {
  const from = Math.max(0, Math.min(start, map.duration))
  const to = Math.max(from + 1, Math.min(end, map.duration))
  const notes = map.notes
    .filter((note) => note.time >= from && note.time < to)
    .map((note) => ({
      ...note,
      time: note.time - from,
      duration: note.duration ? Math.min(note.duration, to - note.time) : undefined,
    }))
  return {
    ...map,
    songId: `${map.songId}:segment:${from}-${to}`,
    title: `${map.title} · ${Math.round(from)}–${Math.round(to)}s`,
    offset: map.offset - from,
    duration: to - from,
    notes,
    meta: {
      ...map.meta,
      activePoints: new Set(notes.map((note) => note.time)).size,
      chordPoints: 0,
      holdNotes: notes.filter((note) => (note.duration || 0) > 0).length,
      holdTotalSec: notes.reduce((sum, note) => sum + (note.duration || 0), 0),
    },
  }
}
