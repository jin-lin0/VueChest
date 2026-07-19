import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config'

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

export interface SearchResult {
  code: string
  name: string
  market: string
}

const getMarketId = (code: string): number => {
  if (code.startsWith('6') || code.startsWith('688')) return 1
  return 0
}

// 解码 Unicode 编码字符串（如 \u8d35\u5dde\u8305\u53f0 -> 贵州茅台）
const decodeUnicode = (str: string): string => {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

export const useStockStore = defineStore('stock', () => {
  const stockCode = ref('')
  const selectedDate = ref('')
  const isLoading = ref(false)
  const error = ref('')
  const result = ref<StockResult | null>(null)
  const klineResult = ref<KlineData | null>(null)
  const klineChartData = ref<KlineData[]>([])
  const favorites = ref<FavoriteStock[]>(
    getStorage<FavoriteStock[]>(STORAGE_KEYS.STOCK_FAVORITES, []) || [],
  )
  const favoritesData = ref<FavoriteStockData[]>([])
  const isFavoritesLoading = ref(false)
  const searchQuery = ref('')
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)
  const showSearchResults = ref(false)

  const stockName = computed(() => {
    if (!stockCode.value) return ''
    return result.value?.name || ''
  })

  const formattedCode = computed(() => {
    if (!stockCode.value) return ''
    const marketId = getMarketId(stockCode.value)
    const prefix = marketId === 1 ? 'sh' : 'sz'
    return `${prefix}${stockCode.value}`
  })

  const fetchStockQuote = async (code: string): Promise<StockResult> => {
    const marketPrefix = getMarketId(code) === 1 ? 'sh' : 'sz'
    const symbol = `${marketPrefix}${code}`
    const url = `/api/stock/q=${symbol}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    const decoder = new TextDecoder('gbk')
    const text = decoder.decode(buffer)
    const regex = new RegExp(`v_${symbol}="([^"]+)"`)
    const match = text.match(regex)
    if (!match) {
      throw new Error('未找到该股票的行情数据，请检查股票代码是否正确')
    }

    const fields = match[1].split('~')
    if (fields.length < 50) {
      throw new Error('数据格式异常，请稍后重试')
    }

    const name = fields[1] || `股票${code}`
    const open = fields[5]
    const currentPrice = fields[3]
    const high = fields[33]
    const low = fields[34]
    const volume = fields[36]

    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

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

    isLoading.value = true
    error.value = ''
    result.value = null

    try {
      const stockData = await fetchStockQuote(code)
      result.value = stockData
    } catch (e) {
      error.value = e instanceof Error ? e.message : '查询失败，请稍后重试'
    } finally {
      isLoading.value = false
    }
  }

  const clearResult = () => {
    result.value = null
    error.value = ''
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

  const selectSearchResult = async (result: SearchResult) => {
    stockCode.value = result.code
    searchQuery.value = ''
    searchResults.value = []
    showSearchResults.value = false
    // 自动查询选中的股票
    queryStock()
    // 获取历史K线数据
    try {
      const klineData = await fetchKlineData(result.code, 'day', 120)
      klineChartData.value = klineData
      // 设置最近一个交易日的K线数据作为默认显示
      if (klineData.length > 0) {
        klineResult.value = klineData[klineData.length - 1]
      }
    } catch (e) {
      console.error('获取K线数据失败:', e)
    }
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
    const marketPrefix = getMarketId(code) === 1 ? 'sh' : 'sz'
    const symbol = `${marketPrefix}${code}`
    const regex = new RegExp(`v_${symbol}="([^"]+)"`)
    const match = text.match(regex)
    if (!match) return null

    const fields = match[1].split('~')
    if (fields.length < 50) return null

    const name = fields[1] || `股票${code}`
    const price = fields[3]
    const yesterdayClose = fields[4]
    const open = fields[5]
    const high = fields[33]
    const low = fields[34]
    const volume = fields[36]

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
    }
  }

  const fetchFavoritesData = async () => {
    if (favorites.value.length === 0) {
      favoritesData.value = []
      return
    }

    isFavoritesLoading.value = true

    try {
      const symbols = favorites.value
        .map((f) => {
          const marketPrefix = getMarketId(f.code) === 1 ? 'sh' : 'sz'
          return `${marketPrefix}${f.code}`
        })
        .join(',')

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
    type: 'day' | 'week' | 'month' = 'day',
    count: number = 30,
  ): Promise<KlineData[]> => {
    const marketPrefix = getMarketId(code) === 1 ? 'sh' : 'sz'
    const symbol = `${marketPrefix}${code}`
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

    const klineArray = data.data[symbol][type]
    return klineArray.map((item: string[]) => ({
      date: item[0],
      open: item[1],
      close: item[2],
      high: item[3],
      low: item[4],
      volume: item[5],
    }))
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
      const klineData = await fetchKlineData(code, 'day', 120)
      const foundIndex = klineData.findIndex((item) => item.date === selectedDate.value)

      if (foundIndex !== -1) {
        klineResult.value = klineData[foundIndex]
        klineChartData.value = klineData
      } else {
        error.value = '未找到该日期的交易数据，可能为非交易日'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '查询失败，请稍后重试'
    } finally {
      isLoading.value = false
    }
  }

  return {
    stockCode,
    selectedDate,
    isLoading,
    error,
    result,
    klineResult,
    klineChartData,
    favorites,
    favoritesData,
    isFavoritesLoading,
    searchQuery,
    searchResults,
    isSearching,
    showSearchResults,
    stockName,
    formattedCode,
    queryStock,
    queryStockByDate,
    clearResult,
    searchStocks,
    selectSearchResult,
    clearSearch,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    fetchFavoritesData,
    fetchKlineData,
  }
})
