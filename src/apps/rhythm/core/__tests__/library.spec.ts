import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Beatmap } from '../beatmap'

const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) => storage.get(key) ?? fallback ?? null,
  setStorage: (key: string, value: unknown) => storage.set(key, value),
}))

import {
  loadRhythmScores,
  saveRhythmScore,
  scoresForSong,
  sliceBeatmap,
  validateBeatmap,
} from '../library'

const map: Beatmap = {
  songId: 'song',
  title: 'Song',
  lanes: 4,
  bpm: 120,
  offset: 0,
  duration: 60,
  notes: [
    { time: 10, lane: 0 },
    { time: 20, lane: 1, duration: 2 },
    { time: 40, lane: 2 },
  ],
  meta: {
    quantizeDivision: 2,
    gridPoints: 100,
    activePoints: 3,
    chordPoints: 0,
    holdNotes: 1,
    holdTotalSec: 2,
    threshold: 1,
    beatFillRate: 0.8,
    maxGap: 20,
  },
}

beforeEach(() => storage.clear())

describe('rhythm library', () => {
  it('validates and slices imported beatmaps', () => {
    expect(validateBeatmap(map).notes).toHaveLength(3)
    const segment = sliceBeatmap(map, 15, 30)
    expect(segment.duration).toBe(15)
    expect(segment.notes).toEqual([{ time: 5, lane: 1, duration: 2 }])
  })

  it('stores and ranks song scores', () => {
    saveRhythmScore({
      songId: 'song',
      title: 'Song',
      difficulty: 'HARD',
      score: 900,
      accuracy: 90,
      rank: 'S',
      maxCombo: 10,
      miss: 1,
      averageError: 8,
    })
    saveRhythmScore({
      songId: 'song',
      title: 'Song',
      difficulty: 'HARD',
      score: 950,
      accuracy: 95,
      rank: 'SS',
      maxCombo: 20,
      miss: 0,
      averageError: 2,
    })
    expect(scoresForSong(loadRhythmScores(), 'song')[0].score).toBe(950)
  })
})
