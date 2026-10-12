import type { KlineData, FavoriteStock } from './model'

export interface StockPosition extends FavoriteStock {
  id: string
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

export interface BacktestOptions {
  shortPeriod?: number
  longPeriod?: number
  initialCapital?: number
  feeRate?: number
  lotSize?: number
  allowCloseSell?: boolean
}

export interface BacktestResult {
  startDate: string
  endDate: string
  initialCapital: number
  feeRate: number
  lotSize: number
  shortPeriod: number
  longPeriod: number
  allowCloseSell: boolean
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
    units: number
  }>
  equity: Array<{ date: string; value: number }>
  openPosition: { buyDate: string; buyPrice: number; units: number; marketValue: number } | null
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
  const complete = priced.length === positions.length
  return {
    cost: round(cost),
    marketValue: complete ? round(marketValue) : null,
    profit: complete ? round(profit) : null,
    profitPercent: complete ? (cost > 0 ? round((profit / cost) * 100) : 0) : null,
    priced: priced.length,
  }
}

export function normalizePerformance(code: string, name: string, data: KlineData[]): CompareSeries {
  const rows = data.filter((item) => Number.isFinite(item.close))
  const first = rows[0]?.close || 0
  const points = first
    ? rows.map((item) => ({
        date: item.date,
        value: round((item.close / first) * 100, 3),
      }))
    : []
  const returns = rows
    .slice(1)
    .map((item, index) => (item.close - rows[index].close) / rows[index].close)
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
  const rightByDate = new Map(right.map((item) => [item.date, item.close]))
  const pairs = left
    .map((item) => [item.close, rightByDate.get(item.date)] as const)
    .filter(
      (pair): pair is readonly [number, number] =>
        pair[1] !== undefined && Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
    )
  if (pairs.length < 4 || pairs.some(([x, y]) => x <= 0 || y <= 0)) return null
  // Compare returns over identical intervals, including gaps in either instrument.
  const xs = pairs.slice(1).map((pair, index) => pair[0] / pairs[index][0] - 1)
  const ys = pairs.slice(1).map((pair, index) => pair[1] / pairs[index][1] - 1)
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

export function runMaBacktest(data: KlineData[], options: BacktestOptions = {}): BacktestResult {
  const {
    shortPeriod = 5,
    longPeriod = 20,
    initialCapital = 100_000,
    feeRate = 0.0003,
    lotSize = 100,
    allowCloseSell = false,
  } = options
  if (
    !Number.isInteger(shortPeriod) ||
    !Number.isInteger(longPeriod) ||
    shortPeriod <= 0 ||
    longPeriod <= shortPeriod ||
    data.length <= longPeriod + 1
  ) {
    throw new Error('回测参数或历史数据不足')
  }
  if (
    !Number.isFinite(initialCapital) ||
    initialCapital <= 0 ||
    !Number.isFinite(feeRate) ||
    feeRate < 0 ||
    feeRate >= 1 ||
    !Number.isInteger(lotSize) ||
    lotSize <= 0
  ) {
    throw new Error('资金、费用或模型交易单位无效')
  }
  if (typeof allowCloseSell !== 'boolean') throw new Error('尾盘卖出配置无效')
  const closes = data.map((item) => item.close)
  const opens = data.map((item) => item.open)
  if (
    [...closes, ...opens].some((value) => !Number.isFinite(value) || value <= 0) ||
    data.some((row, index) => index > 0 && row.date <= data[index - 1].date)
  ) {
    throw new Error('K 线包含无效价格')
  }
  let cash = initialCapital
  let shares = 0
  let buy: { date: string; price: number; cost: number } | null = null
  let pending: 'buy' | 'sell' | null = null
  const trades: BacktestResult['trades'] = []
  const equity: BacktestResult['equity'] = []

  function sellAt(price: number, date: string) {
    // Both execution modes enforce T+1: today's purchase cannot be sold today.
    if (!buy || !shares || date <= buy.date) return false
    const proceeds = shares * price * (1 - feeRate)
    cash += proceeds
    trades.push({
      buyDate: buy.date,
      buyPrice: buy.price,
      sellDate: date,
      sellPrice: price,
      units: shares,
      returnPercent: round(((proceeds - buy.cost) / buy.cost) * 100),
    })
    shares = 0
    buy = null
    pending = null
    return true
  }

  for (let index = longPeriod; index < data.length; index += 1) {
    const date = data[index].date
    const openingPrice = opens[index]
    // Confirmed buy signals and deferred sales execute at the next tradable open.
    const tradable = data[index].volume > 0
    if (pending === 'buy' && !shares && tradable) {
      const units = Math.floor(cash / (openingPrice * (1 + feeRate)) / lotSize) * lotSize
      if (units > 0) {
        const cost = units * openingPrice * (1 + feeRate)
        cash -= cost
        shares = units
        buy = { date, price: openingPrice, cost }
      }
      pending = null
    } else if (pending === 'sell' && shares && buy && tradable) {
      sellAt(openingPrice, date)
    }
    const short = movingAverage(closes, index, shortPeriod)!
    const long = movingAverage(closes, index, longPeriod)!
    const prevShort = movingAverage(closes, index - 1, shortPeriod)!
    const prevLong = movingAverage(closes, index - 1, longPeriod)!
    if (!shares && prevShort <= prevLong && short > long) {
      pending = 'buy'
    } else if (shares && prevShort >= prevLong && short < long) {
      // Opt-in approximation: use the final daily signal and close as a late-day sale.
      if (!allowCloseSell || !tradable || !sellAt(closes[index], date)) pending = 'sell'
    }
    equity.push({ date, value: round(cash + shares * closes[index]) })
  }
  let peak = initialCapital
  let maxDrawdown = 0
  for (const point of equity) {
    peak = Math.max(peak, point.value)
    maxDrawdown = Math.min(maxDrawdown, ((point.value - peak) / peak) * 100)
  }
  const wins = trades.filter((trade) => trade.returnPercent > 0).length
  return {
    startDate: data[longPeriod].date,
    endDate: data.at(-1)!.date,
    initialCapital,
    feeRate,
    lotSize,
    shortPeriod,
    longPeriod,
    allowCloseSell,
    totalReturn: round(((equity.at(-1)!.value - initialCapital) / initialCapital) * 100),
    benchmarkReturn: round(((closes.at(-1)! - closes[longPeriod]) / closes[longPeriod]) * 100),
    maxDrawdown: round(maxDrawdown),
    winRate: trades.length ? round((wins / trades.length) * 100) : 0,
    trades,
    equity,
    openPosition: buy
      ? {
          buyDate: buy.date,
          buyPrice: buy.price,
          units: shares,
          marketValue: round(shares * closes.at(-1)!),
        }
      : null,
  }
}
