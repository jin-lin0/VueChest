import { describe, expect, it } from 'vitest'
import { finiteOrNull, formatPrice, summaryTimestamp } from '../data-quality'
import { completedDailyBars, marketClock } from '../market-time'
import type { KlineData } from '@/stores/stock'

describe('stock missing fields and exchange clock', () => {
  it('distinguishes missing values from true zeros', () => {
    for (const value of [null, undefined, '', '  ', false, NaN, Infinity, '--']) {
      expect(finiteOrNull(value)).toBeNull()
      expect(formatPrice(value)).toBe('--')
    }
    expect(finiteOrNull(0)).toBe(0)
    expect(formatPrice('0')).toBe('0.00')
  })
  it('excludes intraday and future rows regardless of host timezone', () => {
    const data = ['2026-10-08', '2026-10-09', '2026-10-10'].map((date) => ({ date }) as KlineData)
    expect(marketClock(new Date('2026-10-09T06:59:59Z'))).toEqual({
      date: '2026-10-09',
      closed: false,
    })
    expect(
      completedDailyBars(data, new Date('2026-10-09T06:59:59Z')).map((row) => row.date),
    ).toEqual(['2026-10-08'])
    expect(
      completedDailyBars(data, new Date('2026-10-09T07:00:00Z')).map((row) => row.date),
    ).toEqual(['2026-10-08', '2026-10-09'])
  })

  it('formats Tencent quote times and leaves unknown values empty', () => {
    expect(summaryTimestamp('20261009150000')).toBe('2026-10-09 15:00:00')
    expect(summaryTimestamp(null)).toBe('')
    expect(summaryTimestamp(undefined)).toBe('')
    expect(summaryTimestamp('bad timestamp')).toBe('')
  })
})
