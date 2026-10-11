import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/lib/request'
import { useStockStore } from '@/stores/stock'
import { resolveInstrument } from '../model'
import { STORAGE_KEYS } from '@/config'

const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback: unknown) => storage.get(key) ?? fallback,
  setStorage: vi.fn(),
}))
vi.mock('@/lib/request', () => ({ api: { get: vi.fn() } }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function quote(symbol: string, price = 10, asOf = '20261009150000') {
  return {
    ...resolveInstrument(symbol),
    price,
    open: 9,
    high: 11,
    low: 8,
    change: 1,
    previousClose: 9,
    changePercent: 10,
    volume: 100000,
    pe: 20,
    pb: 1,
    volumeRatio: 1,
    source: 'tencent',
    asOf,
    fetchedAt: Date.now(),
  }
}
const rows = Array.from({ length: 80 }, (_, index) => [
  new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
  String(100 + index),
  String(100 + index),
  String(101 + index),
  String(99 + index),
  '1000',
])
function response(path: string) {
  if (path.includes('/kline'))
    return {
      data: rows,
      symbol: path.split('/')[3],
      period: new URLSearchParams(path.split('?')[1]).get('period'),
      adjustment: 'qfq',
      completedThrough: '2026-10-09',
    }
  if (path.includes('/quotes'))
    return {
      data: new URLSearchParams(path.split('?')[1])
        .get('symbols')!
        .split(',')
        .map((symbol) => quote(symbol)),
    }
  if (path.includes('/search') || path.includes('market-overview')) return { data: [] }
  throw new Error(`Unexpected stock request: ${path}`)
}
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve()
}
beforeEach(() => {
  setActivePinia(createPinia())
  storage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
  vi.mocked(api.get).mockImplementation(async (path) => response(path))
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('stock session and shared numeric quotes', () => {
  it('uses one quote JSON endpoint with no separate summary or browser GBK request', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    expect(vi.mocked(api.get).mock.calls.map(([path]) => path)).toEqual([
      '/api/research-stocks/sh600000/kline?period=day&count=2000',
      '/api/research-stocks/quotes?symbols=sh600000',
    ])
    expect(store.result?.close).toBe(10)
    expect(store.result?.volume).toBe(100000)
  })
  it('rejects a late older stock quote even if cancellation is ignored', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('symbols=sh600000') ? gate.promise : response(path),
    )
    const store = useStockStore()
    const old = store.loadStock('sh600000')
    await flush()
    await store.loadStock('sz000001')
    gate.resolve({ data: [quote('sh600000')] })
    await old
    expect(store.formattedCode).toBe('sz000001')
    expect(store.result?.symbol).toBe('sz000001')
    expect(store.researchSummary?.symbol).toBe('sz000001')
    expect(store.recentStocks.map((item) => item.code)).toEqual(['000001'])
  })
  it('keeps newer loading state when an older quote completes', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/quotes')
        ? path.includes('sh600000')
          ? first.promise
          : second.promise
        : response(path),
    )
    const store = useStockStore()
    const old = store.loadStock('sh600000')
    await flush()
    const current = store.loadStock('sz000001')
    first.resolve({ data: [quote('sh600000')] })
    await old
    expect(store.isLoading).toBe(true)
    expect(store.result).toBeNull()
    second.resolve({ data: [quote('sz000001')] })
    await current
    expect(store.isLoading).toBe(false)
  })
  it('clears an old result immediately and preserves the new failure', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/quotes') ? gate.promise : response(path),
    )
    const pending = store.loadStock('sz000001')
    expect(store.result).toBeNull()
    expect(store.technicalSnapshot).toBeNull()
    expect(store.researchSummary).toBeNull()
    gate.reject(new Error('503'))
    await pending
    expect(store.error).toContain('503')
    expect(store.dailyKlineData).toEqual([])
  })
  it('publishes the quote while history is still pending', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/kline') ? gate.promise : response(path),
    )
    const store = useStockStore()
    const pending = store.loadStock('sh600000')
    await flush()
    expect(store.result?.close).toBe(10)
    expect(store.isLoading).toBe(false)
    expect(store.isResearchLoading).toBe(true)
    gate.resolve(response('/api/research-stocks/sh600000/kline?period=day'))
    await pending
    expect(store.completedResearchData).toHaveLength(80)
  })
  it('keeps the quote usable when history fails and valuation fields are missing', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.includes('/kline')) throw new Error('history unavailable')
      return { data: [{ ...quote('sh600000'), pe: null, pb: null }] }
    })
    const store = useStockStore()
    expect(await store.loadStock('sh600000')).toBe(true)
    expect(store.result?.close).toBe(10)
    expect(store.researchSummary?.pe).toBeNull()
    expect(store.researchError).toContain('history unavailable')
    expect(store.technicalSnapshot).toBeNull()
  })
  it('changes only chart bars when switching to weeks', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    const technical = JSON.stringify(store.technicalSnapshot)
    const daily = JSON.stringify(store.completedResearchData)
    vi.mocked(api.get).mockResolvedValue({
      data: rows.slice(-25),
      symbol: 'sh600000',
      period: 'week',
      adjustment: 'qfq',
      completedThrough: '2026-10-09',
    })
    await store.loadKline('sh600000', 'week')
    expect(store.klinePeriod).toBe('week')
    expect(store.klineChartData).toHaveLength(25)
    expect(JSON.stringify(store.completedResearchData)).toBe(daily)
    expect(JSON.stringify(store.technicalSnapshot)).toBe(technical)
  })
  it('rejects an old chart response after reloading the same symbol', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('period=month') ? gate.promise : response(path),
    )
    const pending = store.loadKline('sh600000', 'month')
    await store.loadStock('sh600000')
    gate.resolve({
      data: rows.slice(-10),
      symbol: 'sh600000',
      period: 'month',
      adjustment: 'qfq',
      completedThrough: '2026-10-09',
    })
    expect(await pending).toBe(false)
    expect(store.klinePeriod).toBe('day')
    expect(store.klineChartData).toHaveLength(80)
  })
  it('does not let initial history overwrite a newer chart period', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('period=day') ? gate.promise : response(path),
    )
    const store = useStockStore()
    const pending = store.loadStock('sh600000')
    await flush()
    await store.loadKline('sh600000', 'week')
    gate.resolve(response('/api/research-stocks/sh600000/kline?period=day'))
    await pending
    expect(store.klinePeriod).toBe('week')
    expect(store.dailyKlineData).toHaveLength(80)
  })
  it('rejects wrong symbol or undeclared adjustment instead of silently using it', async () => {
    const store = useStockStore()
    for (const packet of [
      { data: rows, symbol: 'sh600000', period: 'day', adjustment: 'bfq' },
      { data: rows, symbol: 'sz000001', period: 'day', adjustment: 'qfq' },
    ]) {
      vi.mocked(api.get).mockResolvedValue(packet)
      await expect(store.fetchKlineData('sh600000')).rejects.toThrow('不匹配')
    }
  })
  it('uses the upstream quote timestamp', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    expect(store.result?.date).toBe('2026-10-09')
    expect(store.result?.asOf).toBe('2026-10-09 15:00:00')
  })
  it('rejects missing or invalid completed dates instead of estimating them locally', async () => {
    const store = useStockStore()
    for (const completedThrough of [undefined, '', '2026-02-30', '2026-1-1']) {
      vi.mocked(api.get).mockResolvedValue({
        data: rows,
        symbol: 'sh600000',
        period: 'day',
        adjustment: 'qfq',
        completedThrough,
      })
      await expect(store.fetchKlineData('sh600000')).rejects.toThrow('已确认收盘日期')
    }
  })
  it('does not repopulate a cleared search from a late response', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async () => gate.promise)
    const store = useStockStore()
    store.searchQuery = 'sample'
    const pending = store.searchStocks('sample')
    store.clearSearch()
    gate.resolve({ data: [{ ...resolveInstrument('sh600000'), name: 'Sample' }] })
    await pending
    expect(store.searchResults).toEqual([])
    expect(store.isSearching).toBe(false)
  })
  it('preserves exchange and type when opening a search result', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      const packet = response(path)
      if (path.includes('sh000001/kline')) return { ...packet, adjustment: 'none' }
      return packet
    })
    const store = useStockStore()
    await store.selectSearchResult({ ...resolveInstrument('sh000001'), name: '上证指数' })
    expect(store.stockCode).toBe('000001')
    expect(store.formattedCode).toBe('sh000001')
    expect(store.result?.type).toBe('index')
    expect(store.klineChartData).toHaveLength(80)
  })
  it('checks alert-only symbols and retains their one-time trigger state', async () => {
    const store = useStockStore()
    store.addAlert({
      ...resolveInstrument('sh600000'),
      name: 'Sample',
      direction: 'above',
      target: 9,
    })
    await store.refreshQuotes()
    const triggered = store.alerts[0].triggeredAt
    expect(triggered).toBeTypeOf('number')
    await store.refreshQuotes()
    expect(store.alerts[0].triggeredAt).toBe(triggered)
    expect(api.get).toHaveBeenCalledTimes(1)
  })
  it('shares one batch between main quote, watchlist, portfolio and alert refreshes', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    store.favorites = [{ ...resolveInstrument('sh600000'), name: 'Sample' }]
    store.positions = [
      {
        id: 'p',
        ...resolveInstrument('sh600000'),
        name: 'Sample',
        shares: 100,
        costPrice: 10,
        createdAt: 1,
      },
    ]
    store.addAlert({
      ...resolveInstrument('sh600000'),
      name: 'Sample',
      direction: 'above',
      target: 19,
    })
    vi.mocked(api.get)
      .mockClear()
      .mockResolvedValue({ data: [quote('sh600000', 20)] })
    await Promise.all([store.refreshQuotes(), store.refreshQuotes(), store.refreshQuotes()])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(store.favoritesData[0].price).toBe(20)
    expect(store.portfolioPositionMetrics[0].currentPrice).toBe(20)
    expect(store.result?.close).toBe(20)
    expect(store.researchSummary?.price).toBe(20)
    expect(store.alerts[0].triggeredAt).toBeTypeOf('number')
  })
  it('coalesces overlapping batch callers and retries after a failed request', async () => {
    const store = useStockStore()
    const first = store.fetchQuoteBatch(['sh000001', 'sz000001'])
    const second = store.fetchQuoteBatch(['sz000001', 'sh510300'])
    expect((await first).map((row) => row.symbol)).toEqual(['sh000001', 'sz000001'])
    expect((await second).map((row) => row.symbol)).toEqual(['sz000001', 'sh510300'])
    expect(api.get).toHaveBeenCalledTimes(1)
    vi.mocked(api.get).mockRejectedValueOnce(new Error('503'))
    await expect(store.fetchQuoteBatch(['sz000001'])).rejects.toThrow('503')
    expect(await store.fetchQuoteBatch(['sz000001'])).toHaveLength(1)
  })
  it('does not conflate same numeric codes across exchanges in storage or quote maps', async () => {
    storage.set(STORAGE_KEYS.STOCK_FAVORITES, [{ ...resolveInstrument('sz000001'), name: '银行' }])
    storage.set(STORAGE_KEYS.STOCK_NOTES, { sz000001: 'bank note' })
    const store = useStockStore()
    store.addFavorite('sh000001', '指数')
    await store.refreshQuotes()
    expect(store.favorites).toHaveLength(2)
    expect(store.favoritesData.map((row) => row.symbol)).toEqual(['sz000001', 'sh000001'])
    expect(store.getResearchNote('sz000001')).toBe('bank note')
    expect(store.getResearchNote('sh000001')).toBe('')
    store.setResearchNote('sh000001', 'index note')
    expect(store.getResearchNote('sh000001')).toBe('index note')
    store.removeFavorite('sh000001')
    expect(store.isFavorite('sz000001')).toBe(true)
  })
  it('ignores a slower quote with an older upstream timestamp', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    vi.mocked(api.get).mockResolvedValue({ data: [quote('sh600000', 8, '20261009140000')] })
    await store.refreshQuotes()
    expect(store.result?.close).toBe(10)
    expect(store.researchSummary?.price).toBe(10)
  })
  it('ignores incomplete stored identities and does not read bare-code note keys', async () => {
    const incomplete = { code: '000001', name: 'Bank' }
    storage.set(STORAGE_KEYS.STOCK_FAVORITES, [
      incomplete,
      { ...resolveInstrument('sh600000'), name: 'Sample' },
    ])
    storage.set(STORAGE_KEYS.STOCK_RECENT, [incomplete])
    storage.set(STORAGE_KEYS.STOCK_POSITIONS, [
      { ...incomplete, id: 'p', shares: 100, costPrice: 10, createdAt: 1 },
    ])
    storage.set(STORAGE_KEYS.STOCK_ALERTS, [
      { ...incomplete, id: 'a', direction: 'above', target: 9, enabled: true },
    ])
    storage.set(STORAGE_KEYS.STOCK_NOTES, { '000001': 'old note' })
    const store = useStockStore()
    expect(store.favorites.map((item) => item.symbol)).toEqual(['sh600000'])
    expect(store.recentStocks).toEqual([])
    expect(store.positions).toEqual([])
    expect(store.alerts).toEqual([])
    expect(store.getResearchNote('sz000001')).toBe('')
    expect(store.getResearchNote('sh000001')).toBe('')
    await store.refreshQuotes()
    expect(api.get).toHaveBeenCalledExactlyOnceWith(
      '/api/research-stocks/quotes?symbols=sh600000',
      expect.any(Object),
    )
  })
  it('leaves missing portfolio quotes unknown and surfaces refresh failures', async () => {
    const store = useStockStore()
    store.positions = [
      {
        id: 'p',
        ...resolveInstrument('sh600000'),
        name: 'Sample',
        shares: 100,
        costPrice: 10,
        createdAt: 1,
      },
    ]
    await store.refreshQuotes()
    vi.mocked(api.get).mockRejectedValue(new Error('503'))
    await store.refreshQuotes()
    expect(store.portfolioPositionMetrics[0].currentPrice).toBeNull()
    expect(store.quoteError).toContain('刷新失败')
  })
  it('rejects quote data from unsupported providers or wrong identities', async () => {
    for (const bad of [{ ...quote('sh600000'), source: 'legacy' }, { ...quote('sz000001') }]) {
      vi.mocked(api.get).mockResolvedValue({ data: [bad] })
      const store = useStockStore()
      expect(await store.loadStock('sh600000')).toBe(false)
      expect(store.result).toBeNull()
    }
  })
  it('refreshes at close without promoting cached intraday data while the refresh is pending', async () => {
    vi.setSystemTime(new Date('2026-10-09T06:59:00Z'))
    const bars = [...rows, ['2026-10-09', '10', '10', '11', '9', '1000']]
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/kline')
        ? { ...response(path), data: bars, completedThrough: '2026-10-08' }
        : response(path),
    )
    const store = useStockStore()
    await store.loadStock('sh600000')
    expect(store.completedResearchData).toHaveLength(80)
    vi.setSystemTime(new Date('2026-10-09T07:00:00Z'))
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/kline') ? gate.promise : response(path),
    )
    const pending = store.refreshDailyData()
    expect(store.completedResearchData).toHaveLength(80)
    gate.resolve({
      ...response('/api/research-stocks/sh600000/kline?period=day'),
      data: [...rows, ['2026-10-09', '10', '12', '13', '9', '2000']],
      completedThrough: '2026-10-09',
    })
    await pending
    expect(store.completedResearchData).toHaveLength(81)
    expect(store.completedResearchData.at(-1)?.close).toBe(12)
    expect(store.technicalSnapshot?.support).toBe(12)
  })
  it('retains confirmed bars if the closing refresh fails', async () => {
    vi.setSystemTime(new Date('2026-10-09T06:59:00Z'))
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/kline')
        ? {
            ...response(path),
            data: [rows[0], ['2026-10-09', '10', '10', '11', '9', '1000']],
            completedThrough: '2026-10-08',
          }
        : response(path),
    )
    const store = useStockStore()
    await store.loadStock('sh600000')
    vi.setSystemTime(new Date('2026-10-09T07:00:00Z'))
    vi.mocked(api.get).mockRejectedValue(new Error('503'))
    await store.refreshDailyData()
    expect(store.completedResearchData).toHaveLength(1)
    expect(store.researchError).toContain('已确认收盘')
  })
})

describe('refresh mutations and batch limits', () => {
  it('loads a newly added favorite after an in-flight refresh settles', async () => {
    const store = useStockStore()
    store.favorites = [{ ...resolveInstrument('sh600000'), name: 'Sample' }]
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementationOnce(async () => gate.promise)
    const pending = store.refreshQuotes()
    await flush()
    store.addFavorite('sz000001', 'Bank')
    gate.resolve({ data: [quote('sh600000')] })
    await pending
    await flush()
    expect(store.favoritesData.map((row) => row.symbol)).toEqual(['sh600000', 'sz000001'])
    expect(api.get).toHaveBeenCalledTimes(2)
  })
  it('preserves successful quotes when another 100-symbol group fails', async () => {
    const store = useStockStore()
    vi.mocked(api.get).mockRejectedValueOnce(new Error('503'))
    const symbols = Array.from({ length: 101 }, (_, index) => `sh${600000 + index}`)
    expect((await store.fetchQuoteBatch(symbols)).map((row) => row.symbol)).toEqual(['sh600100'])
    expect(api.get).toHaveBeenCalledTimes(2)
  })
  it('quote refresh does not erase a daily-data failure', async () => {
    const store = useStockStore()
    await store.loadStock('sh600000')
    store.researchError = '日线刷新失败'
    await store.refreshQuotes()
    expect(store.researchError).toBe('日线刷新失败')
  })
  it('rejects unsupported instruments without issuing a request', async () => {
    const store = useStockStore()
    for (const code of ['600000', '000001', 'bj430047', 'sh113000', 'sz123000'])
      expect(await store.loadStock(code)).toBe(false)
    await expect(store.fetchQuoteBatch(['000001'])).rejects.toThrow('沪深市场代码')
    expect(() => resolveInstrument({ ...resolveInstrument('sh000001'), market: 'sz' })).toThrow(
      '标的身份不匹配',
    )
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('completed comparison data', () => {
  it('does not include a provider-unconfirmed bar merely because wall time passed 15:00', async () => {
    vi.setSystemTime(new Date('2026-10-09T07:00:00Z'))
    vi.mocked(api.get).mockResolvedValue({
      ...response('/api/research-stocks/sh600000/kline?period=day'),
      data: [...rows, ['2026-10-09', '10', '10', '11', '9', '1000']],
      completedThrough: '2026-10-08',
    })
    const store = useStockStore()
    expect(await store.fetchCompletedDailyData('sh600000')).toHaveLength(80)
  })
})
