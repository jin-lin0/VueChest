import { describe, expect, it } from 'vitest'
import { resolveInstrument, type KlineData } from '../model'
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
    open: value,
    close: value,
    high: value + 1,
    low: value - 1,
    volume: 1000,
  }))

describe('stock portfolio research', () => {
  it('calculates position and portfolio profit', () => {
    const position = positionMetrics(
      {
        id: 'p',
        ...resolveInstrument('sh600519'),
        name: '贵州茅台',
        shares: 100,
        costPrice: 1000,
        createdAt: 1,
      },
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
    const values = Array.from(
      { length: 80 },
      (_, index) => 100 + Math.sin(index / 4) * 10 + index * 0.3,
    )
    const result = runMaBacktest(series(values), 3, 8, 100_000)
    expect(result.equity.length).toBe(72)
    expect(Number.isFinite(result.totalReturn)).toBe(true)
    expect(result.maxDrawdown).toBeLessThanOrEqual(0)
  })

  it('keeps incomplete portfolio totals unknown instead of diluting returns', () => {
    const first = positionMetrics(
      {
        id: 'a',
        ...resolveInstrument('sh600000'),
        name: 'A',
        shares: 100,
        costPrice: 10,
        createdAt: 1,
      },
      12,
    )
    const missing = positionMetrics(
      {
        id: 'b',
        ...resolveInstrument('sz000001'),
        name: 'B',
        shares: 100,
        costPrice: 100,
        createdAt: 1,
      },
      null,
    )
    expect(portfolioTotals([first, missing])).toMatchObject({
      cost: 11000,
      priced: 1,
      marketValue: null,
      profit: null,
      profitPercent: null,
    })
  })

  it('correlates aligned returns instead of price levels', () => {
    expect(correlation(series([10, 11, 9.9, 10.89]), series([20, 18, 19.8, 17.82]))).toBe(-1)
    expect(correlation(series([10, 10, 10, 10]), series([20, 22, 24, 26]))).toBeNull()
  })

  it('executes yesterday’s close signal at today’s open and reconciles fees', () => {
    const data = series([10, 10, 10, 11, 12, 9, 8])
    data[4].open = 15
    data[6].open = 7
    const result = runMaBacktest(data, 2, 3, 10000, 0.01)
    expect(result.trades).toHaveLength(1)
    const trade = result.trades[0]
    expect(trade).toMatchObject({
      buyDate: data[4].date,
      buyPrice: 15,
      sellDate: data[6].date,
      sellPrice: 7,
      units: 600,
    })
    const cost = 600 * 15 * 1.01
    const proceeds = 600 * 7 * 0.99
    const expectedEquity = 10000 - cost + proceeds
    expect(result.equity.at(-1)?.value).toBe(expectedEquity)
    expect(result.totalReturn).toBe(Number(((expectedEquity / 10000 - 1) * 100).toFixed(2)))
    expect(trade.returnPercent).toBe(Number(((proceeds / cost - 1) * 100).toFixed(2)))
  })

  it('does not invent a fill for a signal on the last bar', () => {
    const result = runMaBacktest(series([10, 10, 10, 10, 11]), 2, 3, 10000, 0)
    expect(result.trades).toEqual([])
    expect(result.openPosition).toBeNull()
    expect(result.totalReturn).toBe(0)
  })

  it('marks remaining holdings to market without forcing an end-date sale', () => {
    const result = runMaBacktest(series([10, 10, 10, 11, 12, 13]), 2, 3, 10000, 0)
    expect(result.trades).toEqual([])
    expect(result.openPosition).toMatchObject({
      buyDate: '2026-01-05',
      buyPrice: 12,
      units: 800,
      marketValue: 10400,
    })
    expect(result.totalReturn).toBe(8)
    expect(result.winRate).toBe(0)
    expect(result.equity.at(-1)?.value).toBe(10800)
  })

  it('waits through zero-volume bars and uses the next available open', () => {
    const data = series([10, 10, 10, 11, 12, 13])
    data[4].volume = 0
    const result = runMaBacktest(data, 2, 3, 10000, 0)
    expect(result.openPosition?.buyDate).toBe(data[5].date)
    expect(result.openPosition?.buyPrice).toBe(13)
  })

  it('rejects invalid model parameters before producing NaN metrics', () => {
    const data = series([10, 10, 10, 11, 12, 9, 8])
    for (const capital of [0, -1, NaN, Infinity])
      expect(() => runMaBacktest(data, 2, 3, capital)).toThrow()
    expect(() => runMaBacktest(data, 2.5, 3)).toThrow()
    expect(() => runMaBacktest(data, 2, 3, 10000, -0.01)).toThrow()
  })
})
