import { describe, expect, it } from 'vitest'
import { KLINE_HISTORY_COUNTS, normalizeKlineRows } from '../model'

describe('stock kline history', () => {
  it('loads materially longer history for each period', () => {
    expect(KLINE_HISTORY_COUNTS).toEqual({ day: 2000, week: 1000, month: 360 })
  })

  it('sorts, deduplicates and drops invalid upstream rows', () => {
    expect(
      normalizeKlineRows([
        ['2026-01-03', '3', '4', '5', '2', '120'],
        ['bad-date', '1', '2', '3', '0', '100'],
        ['2026-01-02', '1', '2', '3', '0', '100'],
        ['2026-01-02', '1.1', '2.1', '3.1', '0.1', '110'],
        ['2026-01-04', 'x', '2', '3', '0', '100'],
      ]),
    ).toEqual([
      {
        date: '2026-01-02',
        open: 1.1,
        close: 2.1,
        high: 3.1,
        low: 0.1,
        volume: 110,
      },
      {
        date: '2026-01-03',
        open: 3,
        close: 4,
        high: 5,
        low: 2,
        volume: 120,
      },
    ])
  })

  it('rejects missing values, impossible dates and inconsistent OHLC', () => {
    expect(
      normalizeKlineRows([
        ['2026-13-01', '10', '11', '12', '9', '1000'],
        ['2026-02-30', '10', '11', '12', '9', '1000'],
        ['2026-01-01', null, '11', '12', '9', '1000'],
        ['2026-01-02', '', '11', '12', '9', '1000'],
        ['2026-01-03', '10', '11', '9', '8', '1000'],
      ]),
    ).toEqual([])
  })

  it('preserves non-positive historical adjusted prices for charting', () => {
    expect(normalizeKlineRows([['2020-01-01', '-10', '-9', '-8', '-11', '1000']])).toHaveLength(1)
  })
})
