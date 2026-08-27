import { describe, expect, it } from 'vitest'
import { minimumBarSpacing, recentLogicalRange } from '../chart-range'

describe('stock chart visible range', () => {
  it('starts with the latest 120 bars while retaining older history for scrolling', () => {
    expect(recentLogicalRange(2000)).toEqual({ from: 1880, to: 1999 })
  })

  it('fits short datasets without creating negative logical space', () => {
    expect(recentLogicalRange(40)).toEqual({ from: 0, to: 39 })
    expect(recentLogicalRange(0)).toBeNull()
  })

  it('prevents zooming out past the available dataset width', () => {
    expect(minimumBarSpacing(900, 300)).toBe(3)
    expect(minimumBarSpacing(900, 2000)).toBe(2)
  })
})
