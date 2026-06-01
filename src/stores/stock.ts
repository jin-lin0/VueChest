import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage } from '@/utils'
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

const getMarketId = (code: string): number => {
  if (code.startsWith('6') || code.startsWith('688')) return 1
  return 0
}

export const useStockStore = defineStore('stock', () => {
  const stockCode = ref('')
  const isLoading = ref(false)
  const error = ref('')
  const result = ref<StockResult | null>(null)
  const favorites = ref<FavoriteStock[]>(
    getStorage<FavoriteStock[]>(STORAGE_KEYS.STOCK_FAVORITES, []) || [],
  )
  const favoritesData = ref<FavoriteStockData[]>([])
  const isFavoritesLoading = ref(false)

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

  return {
    stockCode,
    isLoading,
    error,
    result,
    favorites,
    favoritesData,
    isFavoritesLoading,
    stockName,
    formattedCode,
    queryStock,
    clearResult,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    fetchFavoritesData,
  }
})
