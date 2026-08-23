import { describe, expect, it } from 'vitest'
import { dailyChallenge, normalizeGameProfile } from '../profile'

describe('game center profile', () => {
  it('normalizes damaged local data', () => {
    const result = normalizeGameProfile({ launches: { racing: -2, rhythm: 3 }, recent: [] })
    expect(result.launches.racing).toBe(0)
    expect(result.launches.rhythm).toBe(3)
    expect(result.launches.snake).toBe(0)
  })

  it('creates a deterministic daily challenge', () => {
    const date = new Date('2026-08-24T00:00:00+08:00')
    expect(dailyChallenge(date)).toEqual(dailyChallenge(date))
  })
})
