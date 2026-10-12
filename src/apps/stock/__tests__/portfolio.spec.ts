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
    const result = runMaBacktest(series(values), {
      shortPeriod: 3,
      longPeriod: 8,
      initialCapital: 100_000,
    })
    expect(result.equity.length).toBe(72)
    expect(Number.isFinite(result.totalReturn)).toBe(true)
    expect(result.maxDrawdown).toBeLessThanOrEqual(0)
    expect(result.allowCloseSell).toBe(false)
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
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0.01,
    })
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
    const result = runMaBacktest(series([10, 10, 10, 10, 11]), {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
    })
    expect(result.trades).toEqual([])
    expect(result.openPosition).toBeNull()
    expect(result.totalReturn).toBe(0)
  })

  it('marks remaining holdings to market without forcing an end-date sale', () => {
    const result = runMaBacktest(series([10, 10, 10, 11, 12, 13]), {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
    })
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
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
    })
    expect(result.openPosition?.buyDate).toBe(data[5].date)
    expect(result.openPosition?.buyPrice).toBe(13)
  })

  it('rejects invalid model parameters before producing NaN metrics', () => {
    const data = series([10, 10, 10, 11, 12, 9, 8])
    for (const capital of [0, -1, NaN, Infinity])
      expect(() =>
        runMaBacktest(data, { shortPeriod: 2, longPeriod: 3, initialCapital: capital }),
      ).toThrow()
    expect(() => runMaBacktest(data, { shortPeriod: 2.5, longPeriod: 3 })).toThrow()
    expect(() =>
      runMaBacktest(data, { shortPeriod: 2, longPeriod: 3, initialCapital: 10000, feeRate: -0.01 }),
    ).toThrow()
  })

  it('sells an eligible holding at the signal-day close when enabled and reconciles fees', () => {
    const data = series([10, 10, 10, 11, 12, 9, 8])
    data[4].open = 15
    data[4].high = 16
    data[6].open = 7
    data[6].low = 6
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0.01,
      allowCloseSell: true,
    })
    expect(result.allowCloseSell).toBe(true)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0]).toMatchObject({
      buyDate: data[4].date,
      buyPrice: 15,
      sellDate: data[5].date,
      sellPrice: 9,
      units: 600,
    })
    const cost = 600 * 15 * 1.01
    const proceeds = 600 * 9 * 0.99
    const expectedEquity = 10000 - cost + proceeds
    expect(result.equity[2].value).toBe(expectedEquity)
    expect(result.equity.at(-1)?.value).toBe(expectedEquity)
    expect(result.totalReturn).toBe(Number(((expectedEquity / 10000 - 1) * 100).toFixed(2)))
    expect(result.trades[0].returnPercent).toBe(Number(((proceeds / cost - 1) * 100).toFixed(2)))
  })

  it('enforces T+1 when the sell signal occurs on the morning purchase day', () => {
    const data = series([10, 10, 10, 11, 8, 7])
    data[4].open = 12
    data[4].high = 13
    data[5].open = 9
    data[5].high = 10
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
      allowCloseSell: true,
    })
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0]).toMatchObject({
      buyDate: data[4].date,
      buyPrice: 12,
      sellDate: data[5].date,
      sellPrice: 9,
    })
    expect(result.trades.every((trade) => trade.sellDate > trade.buyDate)).toBe(true)
    expect(result.openPosition).toBeNull()
  })

  it('retains a same-day purchase at the end instead of violating T+1', () => {
    const data = series([10, 10, 10, 11, 8])
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
      allowCloseSell: true,
    })
    expect(result.trades).toEqual([])
    expect(result.openPosition?.buyDate).toBe(data[4].date)
    expect(result.winRate).toBe(0)
  })

  it('does not invent a close fill on a zero-volume sell-signal bar', () => {
    const data = series([10, 10, 10, 11, 12, 9, 8])
    data[5].volume = 0
    data[6].open = 7
    data[6].low = 6
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
      allowCloseSell: true,
    })
    expect(result.trades[0]).toMatchObject({ sellDate: data[6].date, sellPrice: 7 })
  })

  it('can execute a valid close sell signal on the last bar without forcing liquidation', () => {
    const data = series([10, 10, 10, 11, 12, 9])
    const options = { shortPeriod: 2, longPeriod: 3, initialCapital: 10000, feeRate: 0 }
    expect(runMaBacktest(data, options).trades).toEqual([])
    const result = runMaBacktest(data, { ...options, allowCloseSell: true })
    expect(result.trades[0].sellDate).toBe(data.at(-1)?.date)
    expect(result.openPosition).toBeNull()
  })

  it('uses the next supplied trading session for T+1 across a weekend', () => {
    const data = series([10, 10, 10, 11, 8, 7])
    const dates = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-12',
    ]
    data.forEach((row, index) => {
      row.date = dates[index]
    })
    const result = runMaBacktest(data, {
      shortPeriod: 2,
      longPeriod: 3,
      initialCapital: 10000,
      feeRate: 0,
      allowCloseSell: true,
    })
    expect(result.trades[0]).toMatchObject({ buyDate: '2026-01-09', sellDate: '2026-01-12' })
  })
})
