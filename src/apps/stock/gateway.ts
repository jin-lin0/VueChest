import { api } from '@/lib/request'
import {
  instrumentKey,
  resolveInstrument,
  normalizeQuote,
  normalizeKlineRows,
  KLINE_HISTORY_COUNTS,
  type InstrumentInput,
  type StockResearchSummary,
  type KlinePeriod,
  type SearchResult,
  type MarketIndex,
} from './model'

/** A store-owned queue shares overlapping loads and merges callers in the same turn. */
export function createQuoteGateway() {
  const pending = new Map<string, Promise<StockResearchSummary | null>>()
  const queue = new Map<
    string,
    { resolve: (value: StockResearchSummary | null) => void; reject: (reason: unknown) => void }
  >()
  let scheduled = false
  async function flush() {
    scheduled = false
    const entries = [...queue]
    queue.clear()
    for (let offset = 0; offset < entries.length; offset += 100) {
      const group = entries.slice(offset, offset + 100)
      try {
        const { data } = await api.get<{ data: unknown[] }>(
          `/api/research-stocks/quotes?symbols=${group.map(([symbol]) => symbol).join(',')}`,
          { auth: false, timeoutMs: 20_000 },
        )
        const quotes = new Map(
          (Array.isArray(data) ? data : [])
            .map(normalizeQuote)
            .filter((row): row is StockResearchSummary => row !== null)
            .map((row) => [row.symbol, row]),
        )
        for (const [symbol, handler] of group) handler.resolve(quotes.get(symbol) ?? null)
      } catch (error) {
        for (const [, handler] of group) handler.reject(error)
      } finally {
        for (const [symbol] of group) pending.delete(symbol)
      }
    }
  }
  return async (inputs: InstrumentInput[]) => {
    const symbols = [...new Set(inputs.map(instrumentKey))]
    const promises = symbols.map((symbol) => {
      const existing = pending.get(symbol)
      if (existing) return existing
      const promise = new Promise<StockResearchSummary | null>((resolve, reject) =>
        queue.set(symbol, { resolve, reject }),
      )
      pending.set(symbol, promise)
      if (!scheduled) {
        scheduled = true
        queueMicrotask(() => {
          void flush()
        })
      }
      return promise
    })
    const settled = await Promise.allSettled(promises)
    const quotes = settled.flatMap((entry) =>
      entry.status === 'fulfilled' && entry.value ? [entry.value] : [],
    )
    const failure = settled.find((entry) => entry.status === 'rejected')
    if (!quotes.length && failure?.status === 'rejected') throw failure.reason
    return quotes
  }
}

export async function readKline(
  input: InstrumentInput,
  period: KlinePeriod = 'day',
  count = KLINE_HISTORY_COUNTS[period],
  signal?: AbortSignal,
) {
  const symbol = instrumentKey(input)
  const packet = await api.get<{
    data: unknown
    symbol: string
    period: KlinePeriod
    adjustment: string
    completedThrough: string
  }>(`/api/research-stocks/${symbol}/kline?period=${period}&count=${count}`, {
    auth: false,
    signal,
    timeoutMs: 20_000,
  })
  if (
    packet.symbol !== symbol ||
    packet.period !== period ||
    packet.adjustment !== (resolveInstrument(input).type === 'index' ? 'none' : 'qfq')
  )
    throw new Error('K 线标的、周期或复权模式不匹配，请更新行情服务')
  const confirmedDate = packet.completedThrough
  const confirmedTime =
    typeof confirmedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(confirmedDate)
      ? Date.parse(`${confirmedDate}T00:00:00Z`)
      : NaN
  if (
    !Number.isFinite(confirmedTime) ||
    new Date(confirmedTime).toISOString().slice(0, 10) !== confirmedDate
  )
    throw new Error('K 线缺少有效的已确认收盘日期')
  const data = normalizeKlineRows(packet.data)
  if (!data.length) throw new Error('没有有效的 K 线数据')
  return {
    data,
    completedThrough: confirmedDate,
  }
}
export async function searchInstruments(query: string) {
  const { data } = await api.get<{ data: SearchResult[] }>(
    `/api/research-stocks/search?q=${encodeURIComponent(query)}`,
    { auth: false, timeoutMs: 20_000 },
  )
  return data || []
}
export async function readMarketOverview() {
  const { data } = await api.get<{ data: MarketIndex[] }>('/api/research-stocks/market-overview', {
    auth: false,
    timeoutMs: 20_000,
  })
  return data || []
}
