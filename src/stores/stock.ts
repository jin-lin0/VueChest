import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { buildTechnicalSnapshot } from '@/apps/stock/research'
import { positionMetrics, type PositionMetrics } from '@/apps/stock/portfolio'
import { completedDailyBars, completedThrough, marketClock } from '@/apps/stock/market-time'
import {
  createQuoteGateway,
  readKline,
  searchInstruments,
  readMarketOverview,
} from '@/apps/stock/gateway'
import { useStockLocalData } from '@/apps/stock/local-data'
import {
  resolveInstrument,
  instrumentKey,
  quoteResult,
  KLINE_HISTORY_COUNTS,
  type InstrumentInput,
  type StockResult,
  type KlineData,
  type KlinePeriod,
  type StockResearchSummary,
  type SearchResult,
  type MarketIndex,
} from '@/apps/stock/model'

export const useStockStore = defineStore('stock', () => {
  const stockCode = ref('')
  const selectedInstrument = ref<SearchResult | null>(null)
  const formattedCode = computed(() => selectedInstrument.value?.symbol ?? '')
  const pricePrecision = computed(() => (selectedInstrument.value?.type === 'fund' ? 3 : 2))
  const selectedDate = ref('')
  const isLoading = ref(false)
  const error = ref('')
  const result = ref<StockResult | null>(null)
  const klineResult = ref<KlineData | null>(null)
  const klineChartData = ref<KlineData[]>([])
  const dailyKlineData = ref<KlineData[]>([])
  const klinePeriod = ref<KlinePeriod>('day')
  const marketNow = ref(Date.now())
  const dailyCompletedThrough = ref('')
  const completedResearchData = computed(() =>
    completedDailyBars(dailyKlineData.value, new Date(marketNow.value)).filter(
      (row) => row.date <= dailyCompletedThrough.value,
    ),
  )
  const technicalSnapshot = computed(() =>
    completedResearchData.value.length
      ? buildTechnicalSnapshot(completedResearchData.value, pricePrecision.value)
      : null,
  )
  const isKlineLoading = ref(false)
  const favoritesData = ref<StockResearchSummary[]>([])
  const isFavoritesLoading = ref(false)
  const searchQuery = ref('')
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)
  const showSearchResults = ref(false)
  const marketOverview = ref<MarketIndex[]>([])
  const marketError = ref('')
  const isMarketLoading = ref(false)
  const researchSummary = ref<StockResearchSummary | null>(null)
  const isResearchLoading = ref(false)
  const researchError = ref('')
  const monitoringError = ref('')
  const quoteError = ref('')
  const portfolioQuotes = ref<Record<string, number>>({})
  const isPortfolioLoading = ref(false)
  const quoteBook = ref<Record<string, StockResearchSummary>>({})
  const local = useStockLocalData(() => {
    void refreshQuotes()
  })
  const portfolioPositionMetrics = computed<PositionMetrics[]>(() =>
    local.positions.value.map((position) =>
      positionMetrics(position, portfolioQuotes.value[instrumentKey(position)]),
    ),
  )
  const fetchQuoteBatch = createQuoteGateway()
  let stockRequestId = 0
  let klineRequestId = 0
  let searchRequestId = 0
  let stockController: AbortController | null = null
  let klineController: AbortController | null = null
  let quoteRefresh: Promise<void> | null = null
  let quoteRefreshSymbols: string[] = []
  let dailyRefresh: Promise<void> | null = null
  let lastDailyRefresh = 0

  function projectQuotes() {
    favoritesData.value = local.favorites.value.flatMap((item) => {
      const quote = quoteBook.value[instrumentKey(item)]
      return quote ? [quote] : []
    })
    portfolioQuotes.value = Object.fromEntries(
      local.positions.value.flatMap((item) => {
        const quote = quoteBook.value[instrumentKey(item)]
        return quote?.price != null ? [[instrumentKey(item), quote.price]] : []
      }),
    )
    const quote = quoteBook.value[formattedCode.value]
    if (quote && result.value?.symbol === quote.symbol) {
      result.value = quoteResult(quote)
      researchSummary.value = quote
    }
  }
  function commitQuotes(quotes: StockResearchSummary[]) {
    const book = { ...quoteBook.value }
    for (const quote of quotes) {
      const previous = book[quote.symbol]
      // Ignore slower responses carrying an older upstream timestamp.
      if (previous?.asOf && (!quote.asOf || previous.asOf > quote.asOf)) continue
      if (previous?.asOf === quote.asOf && previous.fetchedAt > quote.fetchedAt) continue
      book[quote.symbol] = quote
      local.checkAlerts(quote, quote.price!)
    }
    quoteBook.value = book
    projectQuotes()
  }
  async function refreshQuotes(): Promise<void> {
    const inputs: InstrumentInput[] = [
      ...local.favorites.value,
      ...local.positions.value,
      ...local.alerts.value.filter((alert) => alert.enabled && !alert.triggeredAt),
    ]
    if (selectedInstrument.value) inputs.push(selectedInstrument.value)
    const symbols = [...new Set(inputs.map(instrumentKey))]
    if (quoteRefresh) {
      const added = symbols.some((symbol) => !quoteRefreshSymbols.includes(symbol))
      return quoteRefresh.then(() => (added ? refreshQuotes() : undefined))
    }
    quoteRefreshSymbols = symbols
    quoteError.value = ''
    monitoringError.value = ''
    if (!symbols.length) {
      projectQuotes()
      return
    }
    isFavoritesLoading.value = local.favorites.value.length > 0
    isPortfolioLoading.value = local.positions.value.length > 0
    quoteRefresh = (async () => {
      try {
        const quotes = await fetchQuoteBatch(symbols)
        const found = new Set(quotes.map((quote) => quote.symbol))
        const book = { ...quoteBook.value }
        for (const symbol of symbols) if (!found.has(symbol)) delete book[symbol]
        quoteBook.value = book
        commitQuotes(quotes)
        if (found.size < symbols.length) {
          quoteError.value = '部分标的没有有效报价，请稍后重试'
          monitoringError.value = quoteError.value
        }
      } catch {
        const book = { ...quoteBook.value }
        for (const symbol of symbols) delete book[symbol]
        quoteBook.value = book
        projectQuotes()
        quoteError.value = '行情刷新失败，主行情保留上次报价，请查看行情时间'
        monitoringError.value = '提醒行情加载失败，将在下次刷新重试'
      } finally {
        isFavoritesLoading.value = false
        isPortfolioLoading.value = false
        quoteRefresh = null
      }
    })()
    return quoteRefresh
  }
  async function fetchMarketOverview() {
    if (isMarketLoading.value) return
    isMarketLoading.value = true
    marketError.value = ''
    try {
      marketOverview.value = await readMarketOverview()
    } catch {
      marketError.value = '大盘行情加载失败，请重试'
    } finally {
      isMarketLoading.value = false
    }
  }
  const fetchKlineData = async (
    input: InstrumentInput,
    type: KlinePeriod = 'day',
    count = KLINE_HISTORY_COUNTS[type],
    signal?: AbortSignal,
  ) => (await readKline(input, type, count, signal)).data

  async function fetchCompletedDailyData(input: InstrumentInput, count = 250) {
    const packet = await readKline(input, 'day', count)
    return completedDailyBars(packet.data).filter((row) => row.date <= packet.completedThrough)
  }
  async function loadStock(
    input: InstrumentInput,
    type: KlinePeriod = 'day',
    count = KLINE_HISTORY_COUNTS[type],
  ) {
    let meta: SearchResult
    try {
      meta = resolveInstrument(input)
    } catch (reason) {
      error.value = (reason as Error).message
      return false
    }
    const requestId = ++stockRequestId
    const chartRequestId = ++klineRequestId
    stockController?.abort()
    klineController?.abort()
    const controller = new AbortController()
    stockController = controller
    stockCode.value = meta.code
    selectedInstrument.value = meta
    klinePeriod.value = type
    result.value = null
    researchSummary.value = null
    dailyKlineData.value = []
    dailyCompletedThrough.value = ''
    klineChartData.value = []
    klineResult.value = null
    selectedDate.value = ''
    researchError.value = ''
    quoteError.value = ''
    isKlineLoading.value = true
    isResearchLoading.value = true
    isLoading.value = true
    error.value = ''
    const current = () => requestId === stockRequestId && formattedCode.value === meta.symbol
    // Publish the quote independently from the longer adjusted-history request.
    const history = (async () => {
      try {
        const daily = readKline(
          meta,
          'day',
          type === 'day' ? count : KLINE_HISTORY_COUNTS.day,
          controller.signal,
        )
        const [dailyData, chartData] = await Promise.all([
          daily,
          type === 'day' ? daily : readKline(meta, type, count, controller.signal),
        ])
        if (!current() || controller.signal.aborted) return
        marketNow.value = Date.now()
        dailyKlineData.value = dailyData.data
        dailyCompletedThrough.value = dailyData.completedThrough
        if (chartRequestId === klineRequestId) {
          klineChartData.value = chartData.data
          klineResult.value = chartData.data.at(-1) || null
        }
        lastDailyRefresh = Date.now()
      } catch (reason) {
        if (current())
          researchError.value = reason instanceof Error ? reason.message : '日线技术数据加载失败'
      } finally {
        if (current()) {
          isResearchLoading.value = false
          if (chartRequestId === klineRequestId) isKlineLoading.value = false
        }
      }
    })()
    try {
      const [quote] = await fetchQuoteBatch([meta])
      if (!current()) return false
      if (!quote) throw new Error('当前标的没有有效报价')
      commitQuotes([quote])
      const latest = quoteBook.value[meta.symbol]
      result.value = quoteResult(latest)
      researchSummary.value = latest
      selectedInstrument.value = { ...meta, name: latest.name }
      local.recordRecent(meta, latest.name)
      return true
    } catch (reason) {
      if (current()) {
        controller.abort()
        error.value = reason instanceof Error ? reason.message : '查询失败，请稍后重试'
        dailyKlineData.value = []
        klineChartData.value = []
        klineResult.value = null
      }
      return false
    } finally {
      if (current()) isLoading.value = false
      // Keep the action awaitable for chart-dependent callers, without blocking rendering.
      await history
    }
  }
  async function loadKline(
    input: InstrumentInput,
    type: KlinePeriod = 'day',
    count = KLINE_HISTORY_COUNTS[type],
  ) {
    const meta = resolveInstrument(input)
    const requestId = ++klineRequestId
    const stockId = stockRequestId
    klineController?.abort()
    const controller = new AbortController()
    klineController = controller
    isKlineLoading.value = true
    try {
      const data = await fetchKlineData(meta, type, count, controller.signal)
      if (
        requestId !== klineRequestId ||
        stockId !== stockRequestId ||
        formattedCode.value !== meta.symbol
      )
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
  async function refreshDailyData() {
    marketNow.value = Date.now()
    if (!selectedInstrument.value || isResearchLoading.value) return
    const now = new Date(marketNow.value)
    const needsClose =
      dailyCompletedThrough.value < completedThrough(now) &&
      dailyKlineData.value.at(-1)?.date === marketClock(now).date
    if (!needsClose && Date.now() - lastDailyRefresh < 300_000) return
    if (dailyRefresh) return dailyRefresh
    const meta = selectedInstrument.value
    const stockId = stockRequestId
    const chartId = klineRequestId
    dailyRefresh = (async () => {
      try {
        const packet = await readKline(meta, 'day')
        if (stockId !== stockRequestId || meta.symbol !== formattedCode.value) return
        dailyKlineData.value = packet.data
        dailyCompletedThrough.value = packet.completedThrough
        lastDailyRefresh = Date.now()
        researchError.value = ''
        if (klinePeriod.value === 'day' && chartId === klineRequestId) {
          klineChartData.value = packet.data
          klineResult.value =
            packet.data.find((row) => row.date === selectedDate.value) ?? packet.data.at(-1) ?? null
        }
      } catch {
        if (stockId === stockRequestId)
          researchError.value = '日线刷新失败，技术指标保留上次已确认收盘的数据'
      } finally {
        dailyRefresh = null
      }
    })()
    return dailyRefresh
  }
  async function refreshData() {
    marketNow.value = Date.now()
    await Promise.allSettled([refreshQuotes(), refreshDailyData(), fetchMarketOverview()])
  }
  async function searchStocks(query: string) {
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
      const data = await searchInstruments(query)
      if (requestId === searchRequestId && query.trim() === searchQuery.value.trim())
        searchResults.value = data
    } catch {
      if (requestId === searchRequestId) searchResults.value = []
    } finally {
      if (requestId === searchRequestId) isSearching.value = false
    }
  }
  function clearSearch() {
    ++searchRequestId
    isSearching.value = false
    searchQuery.value = ''
    searchResults.value = []
    showSearchResults.value = false
  }
  async function selectSearchResult(item: SearchResult) {
    clearSearch()
    await loadStock(item)
  }
  function queryStockByDate() {
    error.value = ''
    if (!selectedDate.value) {
      error.value = '请选择查询日期'
      return false
    }
    const found = dailyKlineData.value.find((row) => row.date === selectedDate.value)
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
  function toggleFavorite() {
    if (!result.value || result.value.symbol !== formattedCode.value) return
    if (local.isFavorite(result.value)) local.removeFavorite(result.value)
    else local.addFavorite(result.value, result.value.name)
  }
  function refreshTechnicalSnapshot() {
    marketNow.value = Date.now()
  }
  return {
    ...local,
    stockCode,
    selectedInstrument,
    formattedCode,
    pricePrecision,
    selectedDate,
    isLoading,
    error,
    result,
    klineResult,
    klineChartData,
    dailyKlineData,
    dailyCompletedThrough,
    completedResearchData,
    marketNow,
    klinePeriod,
    isKlineLoading,
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
    portfolioQuotes,
    portfolioPositionMetrics,
    isPortfolioLoading,
    monitoringError,
    quoteError,
    queryStockByDate,
    searchStocks,
    selectSearchResult,
    clearSearch,
    toggleFavorite,
    fetchKlineData,
    fetchCompletedDailyData,
    fetchQuoteBatch,
    fetchMarketOverview,
    refreshQuotes,
    refreshDailyData,
    refreshData,
    loadStock,
    loadKline,
    refreshTechnicalSnapshot,
  }
})
