import { describe, expect, it } from 'vitest'
import { buildTechnicalSnapshot, formatLargeNumber, macd, rsi, sma } from '../research'
import type { KlineData } from '../model'

function series(values: number[]): KlineData[] {
  return values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: value - 1,
    close: value,
    high: value + 1,
    low: value - 2,
    volume: 1000 + index,
  }))
}

describe('stock research indicators', () => {
  it('calculates moving averages', () => {
    const result = sma(series([1, 2, 3, 4, 5, 6]), 3)
    expect(result.map((item) => item.value)).toEqual([2, 3, 4, 5])
  })

  it('detects a strong upward trend', () => {
    const snapshot = buildTechnicalSnapshot(series(Array.from({ length: 80 }, (_, i) => 100 + i)))
    expect(snapshot.trend).toBe('bullish')
    expect(snapshot.score).toBeGreaterThanOrEqual(62)
    expect(snapshot.ma5).toBeGreaterThan(snapshot.ma20 || 0)
  })

  it('returns stable RSI and MACD values', () => {
    const data = series(Array.from({ length: 40 }, (_, i) => 50 + i * 0.5))
    expect(rsi(data)).toBe(100)
    expect(macd(data)).toHaveLength(40)
    expect(macd(data).at(-1)?.histogram).toBeTypeOf('number')
  })

  it('formats research values', () => {
    expect(formatLargeNumber(1591141364200)).toBe('1.59 万亿')
    expect(formatLargeNumber(null)).toBe('--')
  })

  it('keeps flat prices neutral and requires twenty returns for volatility', () => {
    const flat = series(Array(80).fill(100))
    expect(rsi(flat)).toBe(50)
    expect(buildTechnicalSnapshot(flat).trend).toBe('neutral')
    expect(buildTechnicalSnapshot(flat).volatility20).toBe(0)
    expect(buildTechnicalSnapshot(flat.slice(0, 20)).volatility20).toBeNull()
  })
})

describe('fund price precision', () => {
  it('retains thousandths in support and resistance levels', () => {
    const data = series(Array.from({ length: 80 }, () => 4.385))
    expect(buildTechnicalSnapshot(data, 3).support).toBe(4.385)
    expect(buildTechnicalSnapshot(data, 3).resistance).toBe(4.385)
  })
})
