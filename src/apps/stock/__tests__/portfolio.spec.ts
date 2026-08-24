import { describe, expect, it } from 'vitest'
import type { KlineData } from '@/stores/stock'
import {
  correlation,
  normalizePerformance,
  portfolioTotals,
  positionMetrics,
  runMaBacktest,
} from '../portfolio'

const series = (values: number[]): KlineData[] =>
  values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: String(value), close: String(value), high: String(value + 1), low: String(value - 1), volume: '1000',
  }))

describe('stock portfolio research', () => {
  it('calculates position and portfolio profit', () => {
    const position = positionMetrics(
      { id: 'p', code: '600519', name: '贵州茅台', shares: 100, costPrice: 1000, createdAt: 1 },
      1200,
    )
    expect(position.profit).toBe(20_000)
    expect(portfolioTotals([position]).profitPercent).toBe(20)
  })

  it('normalizes comparison curves and correlation', () => {
    const left = series([10, 11, 12, 13])
    const right = series([20, 22, 24, 26])
    expect(normalizePerformance('a', 'A', left).changePercent).toBe(30)
    expect(correlation(left, right)).toBe(1)
  })

  it('runs a moving average strategy without invalid equity', () => {
    const values = Array.from({ length: 80 }, (_, index) => 100 + Math.sin(index / 4) * 10 + index * 0.3)
    const result = runMaBacktest(series(values), 3, 8, 100_000)
    expect(result.equity.length).toBe(72)
    expect(Number.isFinite(result.totalReturn)).toBe(true)
    expect(result.maxDrawdown).toBeLessThanOrEqual(0)
  })
})
