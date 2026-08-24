import type { KlineData } from '@/stores/stock'

export interface StockPosition {
  id: string
  code: string
  name: string
  shares: number
  costPrice: number
  createdAt: number
}

export interface PositionMetrics extends StockPosition {
  currentPrice: number | null
  costValue: number
  marketValue: number | null
  profit: number | null
  profitPercent: number | null
}

export interface CompareSeries {
  code: string
  name: string
  points: Array<{ date: string; value: number }>
  changePercent: number
  volatility: number
}

export interface BacktestResult {
  totalReturn: number
  benchmarkReturn: number
  maxDrawdown: number
  winRate: number
  trades: Array<{
    buyDate: string
    buyPrice: number
    sellDate: string
    sellPrice: number
    returnPercent: number
  }>
  equity: Array<{ date: string; value: number }>
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))

export function positionMetrics(
  position: StockPosition,
  currentPrice: number | null | undefined,
): PositionMetrics {
  const costValue = position.shares * position.costPrice
  const price = currentPrice != null && Number.isFinite(currentPrice) ? currentPrice : null
  const marketValue = price === null ? null : position.shares * price
  const profit = marketValue === null ? null : marketValue - costValue
  return {
    ...position,
    currentPrice: price,
    costValue: round(costValue),
    marketValue: marketValue === null ? null : round(marketValue),
    profit: profit === null ? null : round(profit),
    profitPercent: profit === null || costValue === 0 ? null : round((profit / costValue) * 100),
  }
}

export function portfolioTotals(positions: PositionMetrics[]) {
  const cost = positions.reduce((sum, item) => sum + item.costValue, 0)
  const priced = positions.filter((item) => item.marketValue !== null)
  const marketValue = priced.reduce((sum, item) => sum + (item.marketValue || 0), 0)
  const profit = marketValue - priced.reduce((sum, item) => sum + item.costValue, 0)
  return {
    cost: round(cost),
    marketValue: round(marketValue),
    profit: round(profit),
    profitPercent: cost > 0 ? round((profit / cost) * 100) : 0,
    priced: priced.length,
  }
}

export function normalizePerformance(
  code: string,
  name: string,
  data: KlineData[],
): CompareSeries {
  const rows = data.filter((item) => Number.isFinite(Number(item.close)))
  const first = Number(rows[0]?.close || 0)
  const points = first
    ? rows.map((item) => ({
        date: item.date,
        value: round((Number(item.close) / first) * 100, 3),
      }))
    : []
  const returns = rows
    .slice(1)
    .map((item, index) => (Number(item.close) - Number(rows[index].close)) / Number(rows[index].close))
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
    : 0
  return {
    code,
    name,
    points,
    changePercent: points.length ? round(points.at(-1)!.value - 100) : 0,
    volatility: round(Math.sqrt(variance) * Math.sqrt(252) * 100),
  }
}

export function correlation(left: KlineData[], right: KlineData[]): number | null {
  const rightByDate = new Map(right.map((item) => [item.date, Number(item.close)]))
  const pairs = left
    .map((item) => [Number(item.close), rightByDate.get(item.date)] as const)
    .filter((pair): pair is readonly [number, number] =>
      pair[1] !== undefined && Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
    )
  if (pairs.length < 3) return null
  const xs = pairs.map((pair) => pair[0])
  const ys = pairs.map((pair) => pair[1])
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let numerator = 0
  let xSquare = 0
  let ySquare = 0
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean
    const y = ys[index] - yMean
    numerator += x * y
    xSquare += x * x
    ySquare += y * y
  }
  const denominator = Math.sqrt(xSquare * ySquare)
  return denominator ? round(numerator / denominator, 3) : null
}

function movingAverage(values: number[], end: number, period: number) {
  if (end + 1 < period) return null
  const window = values.slice(end + 1 - period, end + 1)
  return window.reduce((sum, value) => sum + value, 0) / period
}

export function runMaBacktest(
  data: KlineData[],
  shortPeriod = 5,
  longPeriod = 20,
  initialCapital = 100_000,
  feeRate = 0.0003,
): BacktestResult {
  if (shortPeriod <= 0 || longPeriod <= shortPeriod || data.length <= longPeriod) {
    throw new Error('回测参数或历史数据不足')
  }
  const closes = data.map((item) => Number(item.close))
  if (closes.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('K 线包含无效价格')
  }
  let cash = initialCapital
  let shares = 0
  let buy: { date: string; price: number } | null = null
  const trades: BacktestResult['trades'] = []
  const equity: BacktestResult['equity'] = []

  for (let index = longPeriod; index < data.length; index += 1) {
    const short = movingAverage(closes, index, shortPeriod)!
    const long = movingAverage(closes, index, longPeriod)!
    const prevShort = movingAverage(closes, index - 1, shortPeriod)!
    const prevLong = movingAverage(closes, index - 1, longPeriod)!
    const price = closes[index]
    if (!shares && prevShort <= prevLong && short > long) {
      shares = (cash * (1 - feeRate)) / price
      cash = 0
      buy = { date: data[index].date, price }
    } else if (shares && prevShort >= prevLong && short < long) {
      cash = shares * price * (1 - feeRate)
      if (buy) {
        trades.push({
          buyDate: buy.date,
          buyPrice: buy.price,
          sellDate: data[index].date,
          sellPrice: price,
          returnPercent: round(((price * (1 - feeRate * 2) - buy.price) / buy.price) * 100),
        })
      }
      shares = 0
      buy = null
    }
    equity.push({ date: data[index].date, value: round(cash + shares * price) })
  }
  if (shares) {
    const price = closes.at(-1)!
    cash = shares * price * (1 - feeRate)
    if (buy) {
      trades.push({
        buyDate: buy.date,
        buyPrice: buy.price,
        sellDate: data.at(-1)!.date,
        sellPrice: price,
        returnPercent: round(((price * (1 - feeRate * 2) - buy.price) / buy.price) * 100),
      })
    }
    equity[equity.length - 1].value = round(cash)
  }
  let peak = initialCapital
  let maxDrawdown = 0
  for (const point of equity) {
    peak = Math.max(peak, point.value)
    maxDrawdown = Math.min(maxDrawdown, ((point.value - peak) / peak) * 100)
  }
  const wins = trades.filter((trade) => trade.returnPercent > 0).length
  return {
    totalReturn: round(((cash - initialCapital) / initialCapital) * 100),
    benchmarkReturn: round(((closes.at(-1)! - closes[longPeriod]) / closes[longPeriod]) * 100),
    maxDrawdown: round(maxDrawdown),
    winRate: trades.length ? round((wins / trades.length) * 100) : 0,
    trades,
    equity,
  }
}
