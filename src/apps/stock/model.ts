import { finiteOrNull, quoteTimestamp } from './data-quality'

export type Market = 'sh' | 'sz'
export type InstrumentType = 'stock' | 'index' | 'fund'
export interface Instrument {
  code: string
  market: Market
  type: InstrumentType
  symbol: string
}
export type InstrumentInput = string | Instrument
export interface FavoriteStock extends Instrument {
  name: string
}
export type SearchResult = FavoriteStock

/** Domain identities always include the exchange prefix and consistent metadata. */
export function resolveInstrument(input: InstrumentInput): SearchResult {
  const raw = typeof input === 'string' ? input : input?.symbol
  const match = typeof raw === 'string' ? /^(sh|sz)(\d{6})$/i.exec(raw.trim()) : null
  if (!match) throw new Error('请输入沪深市场代码，例如 sh000001、sz000001')
  const code = match[2]
  const market = match[1].toLowerCase() as Market
  if (!(market === 'sh' ? /^(6\d{5}|5\d{5}|000\d{3})$/ : /^(0\d{5}|3\d{5}|1[56]\d{4})$/).test(code))
    throw new Error('暂只支持沪深股票、指数与交易所基金')
  const type =
    (market === 'sh' && code.startsWith('000')) || (market === 'sz' && code.startsWith('399'))
      ? 'index'
      : (market === 'sh' && code.startsWith('5')) || (market === 'sz' && code.startsWith('1'))
        ? 'fund'
        : 'stock'
  if (
    typeof input === 'object' &&
    (input.code !== code ||
      input.market !== market ||
      input.type !== type ||
      input.symbol !== `${market}${code}`)
  )
    throw new Error('标的身份不匹配')
  return {
    code,
    market,
    type,
    symbol: `${market}${code}`,
    name: typeof input === 'object' && 'name' in input ? String(input.name) : code,
  }
}
export function instrumentKey(input: InstrumentInput) {
  return resolveInstrument(input).symbol
}
export function isStockReference(value: unknown): value is FavoriteStock {
  if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string')
    return false
  try {
    resolveInstrument(value as FavoriteStock)
    return true
  } catch {
    return false
  }
}

export interface StockResearchSummary extends SearchResult {
  price: number | null
  high: number | null
  low: number | null
  open: number | null
  previousClose: number | null
  change: number | null
  volume: number | null
  amount: number | null
  outerVolume: number | null
  volumeRatio: number | null
  totalMarketCap: number | null
  floatMarketCap: number | null
  pe: number | null
  pb: number | null
  turnover: number | null
  changePercent: number | null
  amplitude: number | null
  source: 'tencent'
  asOf: string | null
  fetchedAt: number
}
export interface StockResult extends SearchResult {
  date: string
  asOf: string
  fetchedAt: number
  changePercent: number | null
  open: number | null
  close: number
  high: number | null
  low: number | null
  volume: number | null
}
export interface KlineData {
  date: string
  open: number
  close: number
  high: number
  low: number
  /** Tencent candle volume uses lots; quote volume uses shares. */
  volume: number
}
export type KlinePeriod = 'day' | 'week' | 'month'
export const KLINE_HISTORY_COUNTS: Record<KlinePeriod, number> = {
  day: 2000,
  week: 1000,
  month: 360,
}
export interface MarketIndex extends Instrument {
  name: string
  price: number | null
  change: number | null
  changePercent: number | null
}
export interface PriceAlert extends FavoriteStock {
  id: string
  direction: 'above' | 'below'
  target: number
  enabled: boolean
  triggeredAt?: number
}

const numericFields = [
  'price',
  'high',
  'low',
  'open',
  'previousClose',
  'change',
  'volume',
  'amount',
  'outerVolume',
  'volumeRatio',
  'totalMarketCap',
  'floatMarketCap',
  'pe',
  'pb',
  'turnover',
  'changePercent',
  'amplitude',
] as const
export function normalizeQuote(raw: unknown): StockResearchSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.source !== 'tencent' || typeof value.symbol !== 'string') return null
  try {
    const meta = resolveInstrument(value.symbol)
    if (meta.code !== value.code || meta.market !== value.market || meta.type !== value.type)
      return null
    const fields = Object.fromEntries(
      numericFields.map((key) => [key, finiteOrNull(value[key])]),
    ) as Pick<StockResearchSummary, (typeof numericFields)[number]>
    if ((fields.price ?? 0) <= 0) return null
    return {
      ...meta,
      ...fields,
      name: String(value.name || meta.code),
      source: 'tencent',
      asOf: typeof value.asOf === 'string' && /^\d{14}$/.test(value.asOf) ? value.asOf : null,
      fetchedAt: finiteOrNull(value.fetchedAt) ?? 0,
    }
  } catch {
    return null
  }
}
export function quoteResult(quote: StockResearchSummary): StockResult {
  const asOf = quoteTimestamp(quote.asOf ?? '')
  return { ...quote, date: asOf.slice(0, 10), asOf, close: quote.price! }
}
export function normalizeKlineRows(value: unknown): KlineData[] {
  if (!Array.isArray(value)) return []
  const rows = new Map<string, KlineData>()
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 6) continue
    const date = String(item[0])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const parsedDate = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date)
      continue
    const values = item.slice(1, 6).map(finiteOrNull)
    if (values.some((entry) => entry === null)) continue
    const [open, close, high, low, volume] = values as number[]
    if (volume < 0 || high < Math.max(open, close) || low > Math.min(open, close)) continue
    rows.set(date, { date, open, close, high, low, volume })
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
}
