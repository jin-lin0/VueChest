import type { KlineData } from '@/stores/stock'

export interface IndicatorPoint {
  date: string
  value: number
}

export interface MacdPoint {
  date: string
  dif: number
  dea: number
  histogram: number
}

export interface TechnicalSnapshot {
  score: number
  trend: 'bullish' | 'neutral' | 'bearish'
  trendLabel: string
  rsi: number | null
  macd: number | null
  momentum20: number | null
  volatility20: number | null
  support: number | null
  resistance: number | null
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  signals: Array<{ tone: 'positive' | 'neutral' | 'negative'; label: string; detail: string }>
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))

export function numericSeries(data: KlineData[], key: keyof KlineData = 'close'): number[] {
  return data.map((item) => Number(item[key])).filter(Number.isFinite)
}

export function sma(data: KlineData[], period: number): IndicatorPoint[] {
  if (period <= 0) return []
  const values = data.map((item) => Number(item.close))
  const result: IndicatorPoint[] = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!Number.isFinite(value)) continue
    sum += value
    if (index >= period) sum -= values[index - period]
    if (index >= period - 1) result.push({ date: data[index].date, value: round(sum / period) })
  }
  return result
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return []
  const multiplier = 2 / (period + 1)
  const result = [values[0]]
  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier))
  }
  return result
}

export function macd(data: KlineData[]): MacdPoint[] {
  const closes = numericSeries(data)
  if (closes.length !== data.length) return []
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const dif = closes.map((_, index) => fast[index] - slow[index])
  const dea = ema(dif, 9)
  return data.map((item, index) => ({
    date: item.date,
    dif: round(dif[index], 4),
    dea: round(dea[index], 4),
    histogram: round((dif[index] - dea[index]) * 2, 4),
  }))
}

export function rsi(data: KlineData[], period = 14): number | null {
  const closes = numericSeries(data)
  if (closes.length <= period) return null
  let gains = 0
  let losses = 0
  for (let index = closes.length - period; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1]
    if (change >= 0) gains += change
    else losses -= change
  }
  if (losses === 0) return 100
  const rs = gains / losses
  return round(100 - 100 / (1 + rs))
}

export function buildTechnicalSnapshot(data: KlineData[]): TechnicalSnapshot {
  const empty: TechnicalSnapshot = {
    score: 50,
    trend: 'neutral',
    trendLabel: '数据不足',
    rsi: null,
    macd: null,
    momentum20: null,
    volatility20: null,
    support: null,
    resistance: null,
    ma5: null,
    ma10: null,
    ma20: null,
    ma60: null,
    signals: [],
  }
  if (data.length < 5) return empty

  const closes = numericSeries(data)
  const last = closes.at(-1) ?? 0
  const lastValue = (period: number) => sma(data, period).at(-1)?.value ?? null
  const ma5 = lastValue(5)
  const ma10 = lastValue(10)
  const ma20 = lastValue(20)
  const ma60 = lastValue(60)
  const rsiValue = rsi(data)
  const macdValue = macd(data).at(-1)?.histogram ?? null

  const twenty = closes.slice(-20)
  const support = twenty.length ? Math.min(...twenty) : null
  const resistance = twenty.length ? Math.max(...twenty) : null
  const momentumBase = closes.at(-21)
  const momentum20 = momentumBase ? round(((last - momentumBase) / momentumBase) * 100) : null
  const returns = twenty.slice(1).map((value, index) => (value - twenty[index]) / twenty[index])
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
    : 0
  const volatility20 = round(Math.sqrt(variance) * Math.sqrt(252) * 100)

  let score = 50
  const signals: TechnicalSnapshot['signals'] = []
  if (ma20 !== null) {
    const above = last >= ma20
    score += above ? 12 : -12
    signals.push({
      tone: above ? 'positive' : 'negative',
      label: above ? '站上 MA20' : '跌破 MA20',
      detail: `现价 ${last.toFixed(2)}，MA20 ${ma20.toFixed(2)}`,
    })
  }
  if (ma5 !== null && ma10 !== null) {
    const golden = ma5 >= ma10
    score += golden ? 8 : -8
    signals.push({
      tone: golden ? 'positive' : 'negative',
      label: golden ? '短均线多头' : '短均线承压',
      detail: `MA5 ${ma5.toFixed(2)} / MA10 ${ma10.toFixed(2)}`,
    })
  }
  if (rsiValue !== null) {
    if (rsiValue >= 70) {
      score -= 6
      signals.push({ tone: 'neutral', label: 'RSI 偏热', detail: `RSI14 ${rsiValue}` })
    } else if (rsiValue <= 30) {
      score += 4
      signals.push({ tone: 'neutral', label: 'RSI 超卖区', detail: `RSI14 ${rsiValue}` })
    } else {
      score += rsiValue >= 50 ? 4 : -4
      signals.push({
        tone: rsiValue >= 50 ? 'positive' : 'negative',
        label: rsiValue >= 50 ? '动能偏强' : '动能偏弱',
        detail: `RSI14 ${rsiValue}`,
      })
    }
  }
  if (macdValue !== null) {
    score += macdValue >= 0 ? 8 : -8
    signals.push({
      tone: macdValue >= 0 ? 'positive' : 'negative',
      label: macdValue >= 0 ? 'MACD 红柱' : 'MACD 绿柱',
      detail: `柱值 ${macdValue.toFixed(3)}`,
    })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const trend = score >= 62 ? 'bullish' : score <= 38 ? 'bearish' : 'neutral'
  const trendLabel =
    trend === 'bullish' ? '趋势偏强' : trend === 'bearish' ? '趋势偏弱' : '震荡观察'

  return {
    score,
    trend,
    trendLabel,
    rsi: rsiValue,
    macd: macdValue,
    momentum20,
    volatility20,
    support: support === null ? null : round(support),
    resistance: resistance === null ? null : round(resistance),
    ma5,
    ma10,
    ma20,
    ma60,
    signals,
  }
}

export function formatLargeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  if (Math.abs(value) >= 1e12) return `${round(value / 1e12)} 万亿`
  if (Math.abs(value) >= 1e8) return `${round(value / 1e8)} 亿`
  if (Math.abs(value) >= 1e4) return `${round(value / 1e4)} 万`
  return round(value).toLocaleString('zh-CN')
}
