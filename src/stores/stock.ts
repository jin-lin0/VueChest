import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config'
import { api } from '@/lib/request'
import { buildTechnicalSnapshot, type TechnicalSnapshot } from '@/apps/stock/research'
import { positionMetrics, type StockPosition, type PositionMetrics } from '@/apps/stock/portfolio'
import { finiteOrNull, quoteTimestamp } from '@/apps/stock/data-quality'
import { completedDailyBars } from '@/apps/stock/market-time'

export interface FavoriteStock {
  code: string
  name: string
}

export interface FavoriteStockData {
  code: string
  name: string
  price: string
  change: string
  changePercent: string
  open: string
  high: string
  low: string
  volume: string
  turnover?: number | null
  pe?: number | null
}

export interface StockResult {
  code: string
  name: string
  date: string
  asOf?: string
  changePercent?: number | null
  open: string
  close: string
  high: string
  low: string
  volume: string
}

export interface KlineData {
  date: string
  open: string
  close: string
  high: string
  low: string
  volume: string
}

export type KlinePeriod = 'day' | 'week' | 'month'

export const KLINE_HISTORY_COUNTS: Record<KlinePeriod, number> = {
  day: 2000,
  week: 1000,
  month: 360,
}

export function normalizeKlineRows(value: unknown): KlineData[] {
  if (!Array.isArray(value)) return []
  const rows = new Map<string, KlineData>()
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 6) continue
    const [date, open, close, high, low, volume] = item.map(String)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const parsedDate = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date)
      continue
    if (item.slice(1, 6).some((entry) => finiteOrNull(entry) === null)) continue
    // Long-history forward adjustment can yield non-positive synthetic prices.
    // Preserve them for charts; the return-based backtest rejects such intervals.
    if (Number(volume) < 0) continue
    if (
      Number(high) < Math.max(Number(open), Number(close)) ||
      Number(low) > Math.min(Number(open), Number(close))
    )
      continue
    rows.set(date, { date, open, close, high, low, volume })
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface SearchResult {
  code: string
  name: string
  market: string
}

export interface MarketIndex {
  code: string
  name: string
  price: number | null
  change: number | null
  changePercent: number | null
}

export interface StockResearchSummary {
  code: string
  name: string
  price: number | null
  high: number | null
  low: number | null
  open: number | null
  previousClose: number | null
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
  source?: 'tencent'
  asOf?: string | null
  fetchedAt?: number
}

export interface PriceAlert {
  id: string
  code: string
  name: string
  direction: 'above' | 'below'
  target: number
  enabled: boolean
  triggeredAt?: number
}

const getMarketId = (code: string): number => {
  if (code.startsWith('6') || code.startsWith('688')) return 1
  return 0
}

// 解码 Unicode 编码字符串（如 \u8d35\u5dde\u8305\u53f0 -> 贵州茅台）
const decodeUnicode = (str: string): string => {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

// 股票代码 -> 带市场前缀的行情符号（沪市 sh / 深市 sz）
const toSymbol = (code: string): string => {
  const prefix = getMarketId(code) === 1 ? 'sh' : 'sz'
  return `${prefix}${code}`
}

// 从腾讯行情文本中匹配指定符号的字段数组（字段数不足视为无效）
const matchQuoteFields = (text: string, symbol: string): string[] | null => {
  const match = text.match(new RegExp(`v_${symbol}="([^"]+)"`))
  if (!match) return null
  const fields = match[1].split('~')
  return fields.length >= 50 ? fields : null
}

export const useStockStore = defineStore('stock', () => {
  const stockCode = ref('')
  const selectedDate = ref('')
  const isLoading = ref(false)
  const error = ref('')
  const result = ref<StockResult | null>(null)
  const klineResult = ref<KlineData | null>(null)
  const klineChartData = ref<KlineData[]>([])
  const dailyKlineData = ref<KlineData[]>([])
  const klinePeriod = ref<KlinePeriod>('day')
  const completedResearchData = computed(() => completedDailyBars(dailyKlineData.value))
  const isKlineLoading = ref(false)
  const favorites = ref<FavoriteStock[]>(
    getStorage<FavoriteStock[]>(STORAGE_KEYS.STOCK_FAVORITES, []) || [],
  )
  const favoritesData = ref<FavoriteStockData[]>([])
  const isFavoritesLoading = ref(false)
  const searchQuery = ref('')
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)
  const showSearchResults = ref(false)
  const marketOverview = ref<MarketIndex[]>([])
  const marketError = ref('')
  const isMarketLoading = ref(false)
  const researchSummary = ref<StockResearchSummary | null>(null)
  const technicalSnapshot = ref<TechnicalSnapshot | null>(null)
  const isResearchLoading = ref(false)
  const researchError = ref('')
  let stockRequestId = 0
  let researchRequestId = 0
  let klineRequestId = 0
  let searchRequestId = 0
  let stockController: AbortController | null = null
  let klineController: AbortController | null = null
  const alerts = ref<PriceAlert[]>(getStorage<PriceAlert[]>(STORAGE_KEYS.STOCK_ALERTS, []) || [])
  const notes = ref<Record<string, string>>(
    getStorage<Record<string, string>>(STORAGE_KEYS.STOCK_NOTES, {}) || {},
  )
  const recentStocks = ref<FavoriteStock[]>(
    getStorage<FavoriteStock[]>(STORAGE_KEYS.STOCK_RECENT, []) || [],
  )
  const positions = ref<StockPosition[]>(
    getStorage<StockPosition[]>(STORAGE_KEYS.STOCK_POSITIONS, []) || [],
  )
  const portfolioQuotes = ref<Record<string, number>>({})
  const isPortfolioLoading = ref(false)
  const portfolioPositionMetrics = computed<PositionMetrics[]>(() =>
    positions.value.map((position) =>
      positionMetrics(position, portfolioQuotes.value[position.code]),
    ),
  )

  const formattedCode = computed(() => {
    if (!stockCode.value) return ''
    const marketId = getMarketId(stockCode.value)
    const prefix = marketId === 1 ? 'sh' : 'sz'
    return `${prefix}${stockCode.value}`
  })

  const fetchStockQuote = async (code: string, signal?: AbortSignal): Promise<StockResult> => {
    const symbol = toSymbol(code)
    const url = `/api/stock/q=${symbol}`

    const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000) })
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    const decoder = new TextDecoder('gbk')
    const text = decoder.decode(buffer)
    const fields = matchQuoteFields(text, symbol)
    if (!fields) {
      throw new Error('未找到该股票的行情数据，请检查股票代码是否正确')
    }

    const name = fields[1] || `股票${code}`
    const open = fields[5]
    const currentPrice = fields[3]
    const high = fields[33]
    const low = fields[34]
    const volume = fields[36]

    const asOf = quoteTimestamp(fields[30] || '')
    if ((finiteOrNull(currentPrice) ?? 0) <= 0) throw new Error('当前股票没有有效报价')

    return {
      code,
      name,
      date: asOf.slice(0, 10),
      asOf,
      changePercent: finiteOrNull(fields[32]),
      open,
      close: currentPrice,
      high,
      low,
      volume: Number(volume).toLocaleString(),
    }
  }

  const recordRecent = (code: string, name: string) => {
    recentStocks.value = [
      { code, name },
      ...recentStocks.value.filter((item) => item.code !== code),
    ].slice(0, 8)
    setStorage(STORAGE_KEYS.STOCK_RECENT, recentStocks.value)
  }

  const fetchMarketOverview = async () => {
    if (isMarketLoading.value) return
    isMarketLoading.value = true
    marketError.value = ''
    try {
      const { data } = await api.get<{ data: MarketIndex[] }>(
        '/api/research-stocks/market-overview',
        { auth: false, timeoutMs: 20_000 },
      )
      marketOverview.value = data || []
    } catch {
      marketError.value = '大盘行情加载失败，请重试'
    } finally {
      isMarketLoading.value = false
    }
  }

  const readResearchData = async (code: string, signal?: AbortSignal) => {
    try {
      const { data } = await api.get<{ data: StockResearchSummary }>(
        `/api/research-stocks/${code}/summary`,
        { auth: false, signal, timeoutMs: 12_000 },
      )
      return data?.code === code && data.source === 'tencent' ? data : null
    } catch {
      return null
    }
  }

  const commitResearchData = (data: StockResearchSummary | null) => {
    researchSummary.value = data
    researchError.value = data ? '' : '腾讯估值摘要暂不可用，行情与日线技术指标仍可使用'
  }

  const fetchResearchData = async (code: string) => {
    const requestId = ++researchRequestId
    const stockId = stockRequestId
    isResearchLoading.value = true
    try {
      const data = await readResearchData(code)
      if (requestId === researchRequestId && stockId === stockRequestId && code === stockCode.value)
        commitResearchData(data)
    } finally {
      if (requestId === researchRequestId && stockId === stockRequestId)
        isResearchLoading.value = false
    }
  }

  const refreshTechnicalSnapshot = () => {
    technicalSnapshot.value = buildTechnicalSnapshot(completedResearchData.value)
  }

  const checkAlerts = (code: string, price: number) => {
    if (!Number.isFinite(price) || price <= 0) return
    let changed = false
    alerts.value = alerts.value.map((alert) => {
      if (!alert.enabled || alert.code !== code) return alert
      const reached = alert.direction === 'above' ? price >= alert.target : price <= alert.target
      if (!reached || alert.triggeredAt) return alert
      changed = true
      return { ...alert, triggeredAt: Date.now() }
    })
    if (changed) setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
  }

  const loadStock = async (
    code: string,
    type: KlinePeriod = 'day',
    count = KLINE_HISTORY_COUNTS[type],
  ) => {
    const requestId = ++stockRequestId
    ++researchRequestId
    ++klineRequestId
    stockController?.abort()
    klineController?.abort()
    const controller = new AbortController()
    stockController = controller
    const timeout = setTimeout(() => controller.abort(), 20_000)
    stockCode.value = code
    klinePeriod.value = type
    result.value = null
    researchSummary.value = null
    dailyKlineData.value = []
    klineChartData.value = []
    klineResult.value = null
    technicalSnapshot.value = null
    selectedDate.value = ''
    researchError.value = ''
    isKlineLoading.value = false
    isResearchLoading.value = true
    isLoading.value = true
    error.value = ''
    try {
      const dailyRequest = fetchKlineData(
        code,
        'day',
        type === 'day' ? count : KLINE_HISTORY_COUNTS.day,
        controller.signal,
      )
      const [stockData, klineData, dailyData, researchData] = await Promise.all([
        fetchStockQuote(code, controller.signal),
        type === 'day' ? dailyRequest : fetchKlineData(code, type, count, controller.signal),
        dailyRequest,
        readResearchData(code, controller.signal),
      ])
      if (requestId !== stockRequestId || stockCode.value !== code) return false
      if (controller.signal.aborted) throw new Error('行情加载超时，请重试')
      result.value = stockData
      klineChartData.value = klineData
      dailyKlineData.value = dailyData
      klineResult.value = klineData.at(-1) || null
      refreshTechnicalSnapshot()
      commitResearchData(researchData)
      recordRecent(code, stockData.name)
      checkAlerts(code, Number(stockData.close))
      return true
    } catch (reason) {
      if (requestId !== stockRequestId) return false
      controller.abort()
      error.value = reason instanceof Error ? reason.message : '查询失败，请稍后重试'
      return false
    } finally {
      clearTimeout(timeout)
      if (requestId === stockRequestId) {
        isLoading.value = false
        isResearchLoading.value = false
      }
    }
  }

  const loadKline = async (
    code: string,
    type: KlinePeriod = 'day',
    count = KLINE_HISTORY_COUNTS[type],
  ) => {
    const requestId = ++klineRequestId
    const stockId = stockRequestId
    klineController?.abort()
    const controller = new AbortController()
    klineController = controller
    isKlineLoading.value = true
    try {
      const data = await fetchKlineData(code, type, count, controller.signal)
      if (requestId !== klineRequestId || stockId !== stockRequestId || stockCode.value !== code)
        return false
      klineChartData.value = data
      klinePeriod.value = type
      klineResult.value = data.at(-1) || null
      return true
    } catch (reason) {
      if (requestId !== klineRequestId || stockId !== stockRequestId) return false
      throw reason
    } finally {
      if (requestId === klineRequestId) isKlineLoading.value = false
    }
  }

  const queryStock = async () => {
    const code = stockCode.value.trim()
    if (!code) {
      error.value = '请输入股票代码'
      return
    }

    if (!/^\d{6}$/.test(code)) {
      error.value = '请输入6位数字股票代码'
      return
    }

    await loadStock(code)
  }

  const searchStocks = async (query: string) => {
    const requestId = ++searchRequestId
    if (!query.trim()) {
      isSearching.value = false
      searchResults.value = []
      showSearchResults.value = false
      return
    }

    isSearching.value = true
    showSearchResults.value = true

    try {
      // 使用腾讯股票smartbox接口进行模糊搜索（通过代理）
      const url = `/api/stock-search?v=2&q=${encodeURIComponent(query)}&t=all&c=1`
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })

      if (!response.ok) {
        throw new Error(`搜索请求失败: ${response.status}`)
      }

      const text = await response.text()
      if (requestId !== searchRequestId || query.trim() !== searchQuery.value.trim()) return
      // 解析返回的数据格式：v_hint="市场~代码~名称~拼音缩写~类型"
      const match = text.match(/v_hint="([^"]+)"/)
      if (!match) {
        searchResults.value = []
        return
      }

      const items = match[1].split('^')
      const results: SearchResult[] = []

      for (const item of items) {
        const fields = item.split('~')
        if (fields.length >= 3) {
          const market = fields[0] // sh=上海, sz=深圳
          const code = fields[1]
          const name = decodeUnicode(fields[2])

          // 只显示A股股票（沪市和深市）
          if (market === 'sh' || market === 'sz') {
            results.push({
              code,
              name,
              market,
            })
          }
        }
      }

      searchResults.value = results.slice(0, 10) // 限制最多显示10个结果
    } catch (e) {
      if (requestId !== searchRequestId) return
      console.error('搜索股票失败:', e)
      searchResults.value = []
    } finally {
      if (requestId === searchRequestId) isSearching.value = false
    }
  }

  const selectSearchResult = async (item: SearchResult) => {
    stockCode.value = item.code
    clearSearch()
    await loadStock(item.code)
  }

  const clearSearch = () => {
    ++searchRequestId
    isSearching.value = false
    searchQuery.value = ''
    searchResults.value = []
    showSearchResults.value = false
  }

  const isFavorite = (code: string) => {
    return favorites.value.some((f) => f.code === code)
  }

  const addFavorite = (code: string, name: string) => {
    if (!isFavorite(code)) {
      favorites.value = [...favorites.value, { code, name }]
      setStorage(STORAGE_KEYS.STOCK_FAVORITES, favorites.value)
      fetchFavoritesData()
    }
  }

  const removeFavorite = (code: string) => {
    favorites.value = favorites.value.filter((f) => f.code !== code)
    setStorage(STORAGE_KEYS.STOCK_FAVORITES, favorites.value)
    fetchFavoritesData()
  }

  const reorderFavorites = (items: FavoriteStock[]) => {
    favorites.value = items
    setStorage(STORAGE_KEYS.STOCK_FAVORITES, favorites.value)
  }

  const toggleFavorite = () => {
    const code = stockCode.value.trim()
    if (!code || result.value?.code !== code) return
    if (isFavorite(code)) {
      removeFavorite(code)
    } else {
      addFavorite(code, result.value.name)
    }
  }

  const parseQuoteData = (code: string, text: string): FavoriteStockData | null => {
    const fields = matchQuoteFields(text, toSymbol(code))
    if (!fields) return null

    const name = fields[1] || `股票${code}`
    const price = fields[3]
    if ((finiteOrNull(price) ?? 0) <= 0) return null
    const yesterdayClose = fields[4]
    const open = fields[5]
    const high = fields[33]
    const low = fields[34]
    const volume = fields[36]
    const pe = finiteOrNull(fields[39])

    const change = (Number(price) - Number(yesterdayClose)).toFixed(2)
    const changePercent =
      Number(yesterdayClose) === 0
        ? '0.00'
        : (((Number(price) - Number(yesterdayClose)) / Number(yesterdayClose)) * 100).toFixed(2)

    return {
      code,
      name,
      price,
      change,
      changePercent,
      open,
      high,
      low,
      volume: Number(volume).toLocaleString(),
      turnover: finiteOrNull(fields[38]),
      pe,
    }
  }

  const fetchQuoteBatch = async (codes: string[]): Promise<FavoriteStockData[]> => {
    const unique = [...new Set(codes.filter((code) => /^\d{6}$/.test(code)))]
    if (!unique.length) return []
    const symbols = unique.map((code) => toSymbol(code)).join(',')
    const response = await fetch(`/api/stock/q=${symbols}`, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`请求失败: ${response.status}`)
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer())
    return unique
      .map((code) => parseQuoteData(code, text))
      .filter((item): item is FavoriteStockData => Boolean(item))
  }

  let portfolioRequestId = 0
  const fetchPortfolioData = async () => {
    const requestId = ++portfolioRequestId
    if (!positions.value.length) {
      portfolioQuotes.value = {}
      isPortfolioLoading.value = false
      return
    }
    isPortfolioLoading.value = true
    try {
      const quotes = await fetchQuoteBatch(positions.value.map((item) => item.code))
      if (requestId !== portfolioRequestId) return
      portfolioQuotes.value = Object.fromEntries(
        quotes.map((quote) => [quote.code, Number(quote.price)]),
      )
      quotes.forEach((quote) => checkAlerts(quote.code, Number(quote.price)))
    } catch {
      if (requestId === portfolioRequestId) portfolioQuotes.value = {}
    } finally {
      if (requestId === portfolioRequestId) isPortfolioLoading.value = false
    }
  }

  const upsertPosition = (payload: Omit<StockPosition, 'id' | 'createdAt'>) => {
    const existing = positions.value.find((item) => item.code === payload.code)
    if (existing) Object.assign(existing, payload)
    else positions.value.push({ ...payload, id: crypto.randomUUID(), createdAt: Date.now() })
    positions.value = [...positions.value]
    setStorage(STORAGE_KEYS.STOCK_POSITIONS, positions.value)
    addFavorite(payload.code, payload.name)
    void fetchPortfolioData()
  }

  const removePosition = (id: string) => {
    positions.value = positions.value.filter((item) => item.id !== id)
    setStorage(STORAGE_KEYS.STOCK_POSITIONS, positions.value)
    void fetchPortfolioData()
  }

  let favoritesRequestId = 0
  const fetchFavoritesData = async () => {
    const requestId = ++favoritesRequestId
    if (favorites.value.length === 0) {
      favoritesData.value = []
      isFavoritesLoading.value = false
      return
    }

    isFavoritesLoading.value = true

    try {
      const symbols = favorites.value.map((f) => toSymbol(f.code)).join(',')

      const url = `/api/stock/q=${symbols}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const decoder = new TextDecoder('gbk')
      const text = decoder.decode(buffer)
      if (requestId !== favoritesRequestId) return

      const results: FavoriteStockData[] = []
      for (const fav of favorites.value) {
        const data = parseQuoteData(fav.code, text)
        if (data) {
          results.push(data)
        }
      }

      favoritesData.value = results
      results.forEach((quote) => checkAlerts(quote.code, Number(quote.price)))
    } catch {
      if (requestId === favoritesRequestId) favoritesData.value = []
    } finally {
      if (requestId === favoritesRequestId) isFavoritesLoading.value = false
    }
  }

  const monitoringError = ref('')
  let monitoring = false
  const fetchAlertData = async () => {
    if (monitoring) return
    const codes = alerts.value
      .filter((alert) => alert.enabled && !alert.triggeredAt)
      .map((alert) => alert.code)
    monitoringError.value = ''
    if (!codes.length) return
    monitoring = true
    try {
      const quotes = await fetchQuoteBatch(codes)
      quotes.forEach((quote) => checkAlerts(quote.code, Number(quote.price)))
      if (new Set(quotes.map((quote) => quote.code)).size < new Set(codes).size)
        monitoringError.value = '部分提醒标的没有有效报价，将在下次刷新重试'
    } catch {
      monitoringError.value = '提醒行情加载失败，将在下次刷新重试'
    } finally {
      monitoring = false
    }
  }

  const fetchKlineData = async (
    code: string,
    type: KlinePeriod = 'day',
    count: number = KLINE_HISTORY_COUNTS[type],
    signal?: AbortSignal,
  ): Promise<KlineData[]> => {
    const { data, period, adjustment } = await api.get<{
      data: unknown
      period: KlinePeriod
      adjustment: string
    }>(`/api/research-stocks/${code}/kline?period=${type}&count=${count}`, {
      auth: false,
      signal,
      timeoutMs: 20_000,
    })
    if (period !== type || adjustment !== 'qfq')
      throw new Error('K 线周期或复权模式不匹配，请更新行情服务')
    const rows = normalizeKlineRows(data)
    if (!rows.length) throw new Error('没有有效的 K 线数据')
    return rows
  }

  const queryStockByDate = async () => {
    const code = stockCode.value.trim()
    if (!code) {
      error.value = '请输入股票代码'
      return
    }

    if (!/^\d{6}$/.test(code)) {
      error.value = '请输入6位数字股票代码'
      return
    }

    if (!selectedDate.value) {
      error.value = '请选择查询日期'
      return
    }

    error.value = ''
    const selected = selectedDate.value
    const found = dailyKlineData.value.find((item) => item.date === selected)
    if (!found) {
      error.value = '未找到该日期的交易数据，可能为非交易日或超出已加载区间'
      return false
    }
    ++klineRequestId
    klineController?.abort()
    isKlineLoading.value = false
    klinePeriod.value = 'day'
    klineResult.value = found
    klineChartData.value = dailyKlineData.value
    return true
  }

  const addAlert = (payload: Omit<PriceAlert, 'id' | 'enabled'>) => {
    const alert: PriceAlert = { ...payload, id: crypto.randomUUID(), enabled: true }
    alerts.value = [alert, ...alerts.value].slice(0, 30)
    setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
    return alert
  }

  const removeAlert = (id: string) => {
    alerts.value = alerts.value.filter((alert) => alert.id !== id)
    setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
  }

  const toggleAlert = (id: string) => {
    alerts.value = alerts.value.map((alert) =>
      alert.id === id ? { ...alert, enabled: !alert.enabled, triggeredAt: undefined } : alert,
    )
    setStorage(STORAGE_KEYS.STOCK_ALERTS, alerts.value)
  }

  const setResearchNote = (code: string, text: string) => {
    notes.value = { ...notes.value, [code]: text }
    setStorage(STORAGE_KEYS.STOCK_NOTES, notes.value)
  }

  const getResearchNote = (code: string) => notes.value[code] || ''

  return {
    stockCode,
    selectedDate,
    isLoading,
    error,
    result,
    klineResult,
    klineChartData,
    dailyKlineData,
    completedResearchData,
    klinePeriod,
    isKlineLoading,
    favorites,
    favoritesData,
    isFavoritesLoading,
    searchQuery,
    searchResults,
    isSearching,
    showSearchResults,
    marketOverview,
    marketError,
    isMarketLoading,
    researchSummary,
    technicalSnapshot,
    isResearchLoading,
    researchError,
    alerts,
    notes,
    recentStocks,
    positions,
    portfolioQuotes,
    portfolioPositionMetrics,
    isPortfolioLoading,
    formattedCode,
    queryStock,
    queryStockByDate,
    searchStocks,
    selectSearchResult,
    clearSearch,
    isFavorite,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    toggleFavorite,
    fetchFavoritesData,
    fetchKlineData,
    fetchQuoteBatch,
    fetchPortfolioData,
    fetchAlertData,
    monitoringError,
    fetchMarketOverview,
    fetchResearchData,
    loadStock,
    loadKline,
    refreshTechnicalSnapshot,
    addAlert,
    removeAlert,
    toggleAlert,
    setResearchNote,
    getResearchNote,
    upsertPosition,
    removePosition,
  }
})
