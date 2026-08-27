import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config'
import { formatDate } from '@/utils'
import { api } from '@/lib/request'
import { buildTechnicalSnapshot, type TechnicalSnapshot } from '@/apps/stock/research'
import { positionMetrics, type StockPosition, type PositionMetrics } from '@/apps/stock/portfolio'

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
    if (![open, close, high, low, volume].every((entry) => Number.isFinite(Number(entry)))) continue
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
}

export interface FinancialReport {
  reportDate: string
  reportName: string
  revenue: number | null
  revenueGrowth: number | null
  netProfit: number | null
  netProfitGrowth: number | null
  eps: number | null
  roe: number | null
  grossMargin: number | null
  netMargin: number | null
  debtRatio: number | null
  currentRatio: number | null
  cashflowPerShare: number | null
}

export interface StockNotice {
  id: string
  title: string
  date: string
  category: string
  url: string
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
  const researchSummary = ref<StockResearchSummary | null>(null)
  const financials = ref<FinancialReport[]>([])
  const notices = ref<StockNotice[]>([])
  const technicalSnapshot = ref<TechnicalSnapshot | null>(null)
  const isResearchLoading = ref(false)
  const researchError = ref('')
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

  const fetchStockQuote = async (code: string): Promise<StockResult> => {
    const symbol = toSymbol(code)
    const url = `/api/stock/q=${symbol}`

    const response = await fetch(url)
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

    const dateStr = formatDate(new Date(), 'YYYY-MM-DD')

    return {
      code,
      name,
      date: dateStr,
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
    try {
      const { data } = await api.get<{ data: MarketIndex[] }>(
        '/api/research-stocks/market-overview',
        { auth: false },
      )
      marketOverview.value = data || []
    } catch {
      marketOverview.value = []
    }
  }

  const fetchResearchData = async (code: string) => {
    isResearchLoading.value = true
    researchError.value = ''
    try {
      const [summaryResult, financialResult, noticeResult] = await Promise.allSettled([
        api.get<{ data: StockResearchSummary }>(`/api/research-stocks/${code}/summary`, {
          auth: false,
        }),
        api.get<{ data: FinancialReport[] }>(`/api/research-stocks/${code}/financials`, {
          auth: false,
        }),
        api.get<{ data: StockNotice[] }>(`/api/research-stocks/${code}/notices?limit=10`, {
          auth: false,
        }),
      ])
      researchSummary.value =
        summaryResult.status === 'fulfilled' ? summaryResult.value.data || null : null
      financials.value =
        financialResult.status === 'fulfilled' ? financialResult.value.data || [] : []
      notices.value = noticeResult.status === 'fulfilled' ? noticeResult.value.data || [] : []
      if (!researchSummary.value && !financials.value.length && !notices.value.length) {
        researchError.value = '研究数据暂时不可用，行情与技术指标仍可正常使用'
      }
    } finally {
      isResearchLoading.value = false
    }
  }

  const refreshTechnicalSnapshot = () => {
    technicalSnapshot.value = buildTechnicalSnapshot(klineChartData.value)
  }

  const checkAlerts = (code: string, price: number) => {
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
    stockCode.value = code
    isLoading.value = true
    error.value = ''
    try {
      const [stockData, klineData] = await Promise.all([
        fetchStockQuote(code),
        fetchKlineData(code, type, count),
      ])
      result.value = stockData
      klineChartData.value = klineData
      klineResult.value = klineData.at(-1) || null
      refreshTechnicalSnapshot()
      recordRecent(code, stockData.name)
      checkAlerts(code, Number(stockData.close))
      await fetchResearchData(code)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '查询失败，请稍后重试'
    } finally {
      isLoading.value = false
    }
  }

  let klineRequestId = 0
  const loadKline = async (
    code: string,
    type: KlinePeriod = 'day',
    count = KLINE_HISTORY_COUNTS[type],
  ) => {
    const requestId = ++klineRequestId
    isKlineLoading.value = true
    try {
      const data = await fetchKlineData(code, type, count)
      if (requestId !== klineRequestId || stockCode.value !== code) return false
      klineChartData.value = data
      klineResult.value = data.at(-1) || null
      refreshTechnicalSnapshot()
      return true
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
    if (!query.trim()) {
      searchResults.value = []
      showSearchResults.value = false
      return
    }

    isSearching.value = true
    showSearchResults.value = true

    try {
      // 使用腾讯股票smartbox接口进行模糊搜索（通过代理）
      const url = `/api/stock-search?v=2&q=${query}&t=all&c=1`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`搜索请求失败: ${response.status}`)
      }

      const text = await response.text()
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
      console.error('搜索股票失败:', e)
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

  const selectSearchResult = async (item: SearchResult) => {
    stockCode.value = item.code
    searchQuery.value = ''
    searchResults.value = []
    showSearchResults.value = false
    await loadStock(item.code)
  }

  const clearSearch = () => {
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
    if (!code || !result.value) return
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
    const yesterdayClose = fields[4]
    const open = fields[5]
    const high = fields[33]
    const low = fields[34]
    const volume = fields[36]
    const turnover = Number(fields[38])
    const pe = Number(fields[39])

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
      turnover: Number.isFinite(turnover) ? turnover : null,
      pe: Number.isFinite(pe) ? pe : null,
    }
  }

  const fetchQuoteBatch = async (codes: string[]): Promise<FavoriteStockData[]> => {
    const unique = [...new Set(codes.filter((code) => /^\d{6}$/.test(code)))]
    if (!unique.length) return []
    const symbols = unique.map((code) => toSymbol(code)).join(',')
    const response = await fetch(`/api/stock/q=${symbols}`)
    if (!response.ok) throw new Error(`请求失败: ${response.status}`)
    const text = new TextDecoder('gbk').decode(await response.arrayBuffer())
    return unique
      .map((code) => parseQuoteData(code, text))
      .filter((item): item is FavoriteStockData => Boolean(item))
  }

  const fetchPortfolioData = async () => {
    if (!positions.value.length) {
      portfolioQuotes.value = {}
      return
    }
    isPortfolioLoading.value = true
    try {
      const quotes = await fetchQuoteBatch(positions.value.map((item) => item.code))
      portfolioQuotes.value = Object.fromEntries(
        quotes.map((quote) => [quote.code, Number(quote.price)]),
      )
      quotes.forEach((quote) => checkAlerts(quote.code, Number(quote.price)))
    } finally {
      isPortfolioLoading.value = false
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

  const fetchFavoritesData = async () => {
    if (favorites.value.length === 0) {
      favoritesData.value = []
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

      const results: FavoriteStockData[] = []
      for (const fav of favorites.value) {
        const data = parseQuoteData(fav.code, text)
        if (data) {
          results.push(data)
        }
      }

      favoritesData.value = results
    } catch {
      favoritesData.value = []
    } finally {
      isFavoritesLoading.value = false
    }
  }

  const fetchKlineData = async (
    code: string,
    type: KlinePeriod = 'day',
    count: number = KLINE_HISTORY_COUNTS[type],
  ): Promise<KlineData[]> => {
    const symbol = toSymbol(code)
    const url = `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${symbol},${type},,,${count},&qfq=1`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }

    const text = await response.text()
    const data = JSON.parse(text)
    if (data.code !== 0 || !data.data?.[symbol]?.[type]) {
      throw new Error('未找到K线数据')
    }

    return normalizeKlineRows(data.data[symbol][type])
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

    isLoading.value = true
    error.value = ''
    klineResult.value = null
    klineChartData.value = []

    try {
      const klineData = await fetchKlineData(code, 'day', KLINE_HISTORY_COUNTS.day)
      const foundIndex = klineData.findIndex((item) => item.date === selectedDate.value)

      if (foundIndex !== -1) {
        klineResult.value = klineData[foundIndex]
        klineChartData.value = klineData
        refreshTechnicalSnapshot()
      } else {
        error.value = '未找到该日期的交易数据，可能为非交易日'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '查询失败，请稍后重试'
    } finally {
      isLoading.value = false
    }
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
    isKlineLoading,
    favorites,
    favoritesData,
    isFavoritesLoading,
    searchQuery,
    searchResults,
    isSearching,
    showSearchResults,
    marketOverview,
    researchSummary,
    financials,
    notices,
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
