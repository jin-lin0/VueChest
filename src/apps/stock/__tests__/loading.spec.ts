import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/lib/request'
import { useStockStore } from '@/stores/stock'

vi.mock('@/lib/storage', () => ({
  getStorage: (_key: string, fallback: unknown) => fallback,
  setStorage: vi.fn(),
}))
vi.mock('@/lib/request', () => ({ api: { get: vi.fn() } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function quote(code: string) {
  const fields = Array(60).fill('10')
  fields[1] = `Stock ${code}`
  fields[30] = '20261009150000'
  return new Response(`v_${code.startsWith('6') ? 'sh' : 'sz'}${code}="${fields.join('~')}";`)
}
const rows = Array.from({ length: 80 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)
  return [
    date,
    String(100 + index),
    String(100 + index),
    String(101 + index),
    String(99 + index),
    '1000',
  ]
})
const response = (path: string) => {
  if (path.includes('/kline'))
    return {
      data: rows,
      period: new URLSearchParams(path.split('?')[1]).get('period'),
      adjustment: 'qfq',
    }
  if (path.includes('/summary'))
    return { data: { code: path.split('/')[3], price: 10, source: 'tencent' } }
  throw new Error(`Unexpected stock request: ${path}`)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(api.get).mockImplementation(async (path) => response(path))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => quote(url.match(/(?:sh|sz)(\d{6})/)?.[1] ?? '600000')),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('stock loading identity and dataset separation', () => {
  it('loads only Tencent kline and summary endpoints for the main workspace', async () => {
    const store = useStockStore()
    await store.loadStock('600000')
    expect(vi.mocked(api.get).mock.calls.map(([path]) => path)).toEqual([
      '/api/research-stocks/600000/kline?period=day&count=2000',
      '/api/research-stocks/600000/summary',
    ])
  })

  it('rejects late older quotes even if transport ignores cancellation', async () => {
    const gate = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('sh600000') ? gate.promise : Promise.resolve(quote('000001')),
      ),
    )
    const store = useStockStore()
    const old = store.loadStock('600000')
    await store.loadStock('000001')
    gate.resolve(quote('600000'))
    await old
    expect(store.stockCode).toBe('000001')
    expect(store.result?.code).toBe('000001')
    expect(store.researchSummary?.code).toBe('000001')
    expect(store.recentStocks.map((item) => item.code)).toEqual(['000001'])
  })

  it('keeps newer loading state when an older request completes', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.includes('600000') ? first.promise : second.promise)),
    )
    const store = useStockStore()
    const old = store.loadStock('600000')
    const current = store.loadStock('000001')
    first.resolve(quote('600000'))
    await old
    expect(store.isLoading).toBe(true)
    expect(store.result).toBeNull()
    second.resolve(quote('000001'))
    await current
    expect(store.isLoading).toBe(false)
  })

  it('clears old results immediately and preserves the new failure', async () => {
    const store = useStockStore()
    await store.loadStock('600000')
    const gate = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => gate.promise),
    )
    const pending = store.loadStock('000001')
    expect(store.result).toBeNull()
    expect(store.technicalSnapshot).toBeNull()
    expect(store.researchSummary).toBeNull()
    gate.resolve(new Response('', { status: 503 }))
    await pending
    expect(store.error).toContain('503')
    expect(store.dailyKlineData).toEqual([])
    expect(store.result).toBeNull()
  })

  it('does not publish a quote before its research bundle has settled', async () => {
    const gate = deferred<{ data: { code: string; price: number; source: 'tencent' } }>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('600000/summary') ? gate.promise : response(path),
    )
    const store = useStockStore()
    const old = store.loadStock('600000')
    await store.loadStock('000001')
    gate.resolve({ data: { code: '600000', price: 20, source: 'tencent' } })
    await old
    expect(store.researchSummary?.code).toBe('000001')
  })

  it('changes only chart bars when switching to weeks', async () => {
    const store = useStockStore()
    await store.loadStock('600000')
    const technical = JSON.stringify(store.technicalSnapshot)
    const daily = JSON.stringify(store.completedResearchData)
    vi.mocked(api.get).mockResolvedValue({
      data: rows.slice(-25),
      period: 'week',
      adjustment: 'qfq',
    })
    await store.loadKline('600000', 'week')
    expect(store.klinePeriod).toBe('week')
    expect(store.klineChartData).toHaveLength(25)
    expect(JSON.stringify(store.completedResearchData)).toBe(daily)
    expect(JSON.stringify(store.technicalSnapshot)).toBe(technical)
  })

  it('rejects an old chart response after reloading the same code', async () => {
    const store = useStockStore()
    await store.loadStock('600000')
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('period=month') ? gate.promise : response(path),
    )
    const pending = store.loadKline('600000', 'month')
    await store.loadStock('600000')
    gate.resolve({ data: rows.slice(-10), period: 'month', adjustment: 'qfq' })
    expect(await pending).toBe(false)
    expect(store.klinePeriod).toBe('day')
    expect(store.klineChartData).toHaveLength(80)
  })

  it('rejects undeclared/unadjusted data instead of silently using it', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: rows, period: 'day', adjustment: 'bfq' })
    const store = useStockStore()
    await expect(store.fetchKlineData('600000')).rejects.toThrow('复权模式不匹配')
  })

  it('uses the upstream quote timestamp rather than the request date', async () => {
    const store = useStockStore()
    await store.loadStock('600000')
    expect(store.result?.date).toBe('2026-10-09')
    expect(store.result?.asOf).toBe('2026-10-09 15:00:00')
  })

  it('does not repopulate cleared search results from a pending request', async () => {
    const gate = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => gate.promise),
    )
    const store = useStockStore()
    store.searchQuery = 'sample'
    const search = store.searchStocks('sample')
    store.clearSearch()
    gate.resolve(new Response('v_hint="sh~600000~Sample~sample~1"'))
    await search
    expect(store.searchResults).toEqual([])
    expect(store.isSearching).toBe(false)
  })

  it('checks alert-only symbols once and retains their trigger state', async () => {
    const store = useStockStore()
    store.addAlert({ code: '600000', name: 'Sample', direction: 'above', target: 9 })
    expect(store.positions).toEqual([])
    await store.fetchAlertData()
    const triggered = store.alerts[0].triggeredAt
    expect(triggered).toBeTypeOf('number')
    await store.fetchAlertData()
    expect(store.alerts[0].triggeredAt).toBe(triggered)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the quote usable when the Tencent valuation summary fails', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.includes('/summary')) throw new Error('research unavailable')
      return response(path)
    })
    const store = useStockStore()
    expect(await store.loadStock('600000')).toBe(true)
    expect(store.result?.code).toBe('600000')
    expect(store.error).toBe('')
    expect(store.researchSummary).toBeNull()
    expect(store.researchError).toContain('腾讯估值摘要')
  })

  it('rejects summary data from an unsupported provider', async () => {
    vi.mocked(api.get).mockImplementation(async (path) =>
      path.includes('/summary')
        ? { data: { code: '600000', price: 10, source: 'legacy' } }
        : response(path),
    )
    const store = useStockStore()
    expect(await store.loadStock('600000')).toBe(true)
    expect(store.researchSummary).toBeNull()
    expect(store.result?.code).toBe('600000')
  })
})
