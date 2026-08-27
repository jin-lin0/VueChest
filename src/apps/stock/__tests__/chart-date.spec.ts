import { describe, expect, it } from 'vitest'
import { formatChartDate, formatChartTick } from '../chart-date'

describe('stock chart date labels', () => {
  it('formats the crosshair date as an unambiguous ISO date', () => {
    expect(formatChartDate('2026-08-27')).toBe('2026-08-27')
    expect(formatChartDate({ year: 2026, month: 8, day: 7 })).toBe('2026-08-07')
  })

  it('keeps axis labels compact according to their scale', () => {
    expect(formatChartTick('2026-08-27', 0)).toBe('2026')
    expect(formatChartTick('2026-08-27', 1)).toBe('8月')
    expect(formatChartTick('2026-08-27', 2)).toBe('08-27')
  })
})
