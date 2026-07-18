<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStockStore } from '@/stores'
import type { KlineData } from '@/stores/stock'
import StockChart from './components/StockChart.vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import draggable from 'vuedraggable'

defineOptions({ name: 'StockAnalysisView' })

const router = useRouter()
const stockStore = useStockStore()
const activeKline = ref<KlineData | null>(null)
const selectedDate = ref<Date | null>(null)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const displayKline = computed(() => activeKline.value ?? stockStore.klineResult)

watch(selectedDate, (val) => {
  if (val) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    stockStore.selectedDate = `${y}-${m}-${d}`
    stockStore.queryStockByDate()
  }
})

watch(
  () => stockStore.klineResult,
  (val) => {
    activeKline.value = val
  },
)

const onCandleClick = (data: KlineData) => {
  activeKline.value = data
}

onMounted(() => {
  stockStore.fetchFavoritesData()
})

const goBack = () => {
  router.push('/')
}

const selectFavorite = (code: string) => {
  stockStore.stockCode = code
  stockStore.queryStock()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  selectedDate.value = yesterday
}

const formatPrice = (price: string) => {
  return Number(price).toFixed(2)
}

const getChangeInfo = (open: string, close: string) => {
  const o = Number(open)
  const c = Number(close)
  if (o === 0) return { percent: '0.00', isUp: true }
  const percent = (((c - o) / o) * 100).toFixed(2)
  return { percent, isUp: c >= o }
}

// 防抖搜索函数
const debouncedSearch = (query: string) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    stockStore.searchStocks(query)
  }, 300) // 300ms防抖延迟
}

// 监听搜索输入变化
watch(
  () => stockStore.searchQuery,
  (val) => {
    if (val.trim()) {
      debouncedSearch(val)
    } else {
      stockStore.clearSearch()
    }
  },
)

// 聚焦时，如果有已有搜索结果则显示下拉框
const onSearchFocus = () => {
  if (stockStore.searchResults.length > 0) {
    stockStore.showSearchResults = true
  }
}

// 延迟隐藏搜索结果（避免点击结果时立即消失）
const hideSearchResults = () => {
  setTimeout(() => {
    stockStore.showSearchResults = false
  }, 200)
}

// 拖拽结束后的处理函数
const onDragEnd = () => {
  // 更新 favorites 顺序（根据 favoritesData 的新顺序）
  const newOrder = stockStore.favoritesData.map((item) => ({
    code: item.code,
    name: item.name,
  }))
  stockStore.favorites = newOrder
  // 保存到 localStorage
  localStorage.setItem('stock_favorites', JSON.stringify(newOrder))
}

// 查询按钮点击事件
const handleQuery = async () => {
  await stockStore.queryStock()
  if (stockStore.stockCode) {
    try {
      const klineData = await stockStore.fetchKlineData(stockStore.stockCode, 'day', 120)
      stockStore.klineChartData = klineData
      if (klineData.length > 0) {
        stockStore.klineResult = klineData[klineData.length - 1]
      }
    } catch (e) {
      console.error('获取K线数据失败:', e)
    }
  }
}

// 清理定时器
onUnmounted(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>股票查询</h1>
    </header>

    <main class="stock-layout">
      <aside class="sidebar">
        <div class="query-card">
          <h2>查询股票行情</h2>
          <p class="query-desc">输入股票名称或代码，查询实时行情</p>

          <div class="query-form">
            <div class="form-group">
              <label>搜索股票</label>
              <div class="search-input-wrapper">
                <input
                  v-model="stockStore.searchQuery"
                  type="text"
                  placeholder="输入股票名称或代码"
                  class="search-input"
                  @focus="onSearchFocus"
                  @blur="hideSearchResults"
                />
                <span v-if="stockStore.isSearching" class="search-loading">搜索中...</span>
                <span
                  v-if="stockStore.searchQuery"
                  class="clear-search"
                  @click="stockStore.clearSearch()"
                  >×</span
                >

                <!-- 搜索结果下拉框 -->
                <div
                  v-if="stockStore.showSearchResults && stockStore.searchResults.length > 0"
                  class="search-results"
                >
                  <div
                    v-for="result in stockStore.searchResults"
                    :key="result.code"
                    class="search-result-item"
                    @mousedown="stockStore.selectSearchResult(result)"
                  >
                    <div class="result-info">
                      <span class="result-name">{{ result.name }}</span>
                      <span class="result-code">{{ result.code }}</span>
                    </div>
                    <span class="result-market">{{ result.market === 'sh' ? '沪' : '深' }}</span>
                  </div>
                </div>

                <div
                  v-if="
                    stockStore.showSearchResults &&
                    stockStore.searchQuery &&
                    !stockStore.isSearching &&
                    stockStore.searchResults.length === 0
                  "
                  class="no-results"
                >
                  未找到相关股票
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>查询日期（可选）</label>
              <VueDatePicker
                v-model="selectedDate"
                :enable-time-picker="false"
                :max-date="new Date()"
                placeholder="选择日期"
                auto-apply
                :format="'yyyy-MM-dd'"
                :clearable="true"
              />
            </div>

            <button class="query-btn" :disabled="stockStore.isLoading" @click="handleQuery">
              <span v-if="stockStore.isLoading" class="loading-spinner"></span>
              {{ stockStore.isLoading ? '查询中...' : '查询' }}
            </button>
          </div>
        </div>

        <div v-if="stockStore.favorites.length > 0" class="favorites-card">
          <div class="favorites-header">
            <span class="favorites-label">自选股</span>
            <button class="refresh-btn" @click="stockStore.fetchFavoritesData()">刷新</button>
          </div>
          <div v-if="stockStore.isFavoritesLoading" class="favorites-loading">加载中...</div>
          <table v-else-if="stockStore.favoritesData.length > 0" class="favorites-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>最新价</th>
                <th>涨跌幅</th>
                <th></th>
              </tr>
            </thead>
            <draggable
              v-model="stockStore.favoritesData"
              tag="tbody"
              item-key="code"
              @end="onDragEnd"
            >
              <template #item="{ element: stock }">
                <tr @click="selectFavorite(stock.code)">
                  <td>
                    <div class="stock-name">{{ stock.name }}</div>
                    <div class="stock-code">{{ stock.code }}</div>
                  </td>
                  <td class="stock-price">¥{{ formatPrice(stock.price) }}</td>
                  <td :class="['stock-change', Number(stock.changePercent) >= 0 ? 'up' : 'down']">
                    {{ Number(stock.changePercent) >= 0 ? '+' : '' }}{{ stock.changePercent }}%
                  </td>
                  <td>
                    <button
                      class="remove-fav-btn"
                      @click.stop="stockStore.removeFavorite(stock.code)"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              </template>
            </draggable>
          </table>
        </div>
      </aside>

      <div class="main-content">
        <div v-if="stockStore.error" class="error-message">
          <span class="error-icon">!</span>
          <span>{{ stockStore.error }}</span>
        </div>

        <div v-if="stockStore.result" class="result-card">
          <div class="result-header">
            <div class="stock-info">
              <h3 class="stock-title">{{ stockStore.result.name }}</h3>
              <span class="stock-code-badge">{{ stockStore.formattedCode }}</span>
              <button
                class="fav-btn"
                :class="{ active: stockStore.isFavorite(stockStore.result.code) }"
                @click="stockStore.toggleFavorite()"
              >
                {{ stockStore.isFavorite(stockStore.result.code) ? '★ 已自选' : '☆ 加自选' }}
              </button>
            </div>
            <div class="result-date">{{ stockStore.result.date }}</div>
          </div>

          <div class="price-cards">
            <div class="price-card open">
              <div class="price-label">开盘价</div>
              <div class="price-value">¥{{ formatPrice(stockStore.result.open) }}</div>
            </div>
            <div class="price-card close">
              <div class="price-label">收盘价</div>
              <div class="price-value">¥{{ formatPrice(stockStore.result.close) }}</div>
            </div>
            <div class="price-card high">
              <div class="price-label">最高价</div>
              <div class="price-value">¥{{ formatPrice(stockStore.result.high) }}</div>
            </div>
            <div class="price-card low">
              <div class="price-label">最低价</div>
              <div class="price-value">¥{{ formatPrice(stockStore.result.low) }}</div>
            </div>
          </div>

          <div class="summary-row">
            <div class="summary-item">
              <span class="summary-label">涨跌幅</span>
              <span
                class="summary-value"
                :class="
                  getChangeInfo(stockStore.result.open, stockStore.result.close).isUp
                    ? 'up'
                    : 'down'
                "
              >
                {{ getChangeInfo(stockStore.result.open, stockStore.result.close).isUp ? '+' : ''
                }}{{ getChangeInfo(stockStore.result.open, stockStore.result.close).percent }}%
              </span>
            </div>
            <div class="summary-item">
              <span class="summary-label">成交量</span>
              <span class="summary-value">{{ stockStore.result.volume }} 股</span>
            </div>
          </div>
        </div>

        <div v-if="stockStore.klineResult" class="result-card">
          <div class="result-header">
            <div class="stock-info">
              <h3 class="stock-title">历史行情查询</h3>
              <span class="stock-code-badge">{{ stockStore.formattedCode }}</span>
            </div>
            <div class="result-date">{{ displayKline!.date }}</div>
          </div>

          <StockChart
            v-if="stockStore.klineChartData.length > 0"
            :data="stockStore.klineChartData"
            :selected-date="stockStore.selectedDate"
            @candle-click="onCandleClick"
          />

          <div class="price-cards">
            <div class="price-card open">
              <div class="price-label">开盘价</div>
              <div class="price-value">¥{{ formatPrice(displayKline!.open) }}</div>
            </div>
            <div class="price-card close">
              <div class="price-label">收盘价</div>
              <div class="price-value">¥{{ formatPrice(displayKline!.close) }}</div>
            </div>
            <div class="price-card high">
              <div class="price-label">最高价</div>
              <div class="price-value">¥{{ formatPrice(displayKline!.high) }}</div>
            </div>
            <div class="price-card low">
              <div class="price-label">最低价</div>
              <div class="price-value">¥{{ formatPrice(displayKline!.low) }}</div>
            </div>
          </div>

          <div class="summary-row">
            <div class="summary-item">
              <span class="summary-label">涨跌幅</span>
              <span
                class="summary-value"
                :class="getChangeInfo(displayKline!.open, displayKline!.close).isUp ? 'up' : 'down'"
              >
                {{ getChangeInfo(displayKline!.open, displayKline!.close).isUp ? '+' : ''
                }}{{ getChangeInfo(displayKline!.open, displayKline!.close).percent }}%
              </span>
            </div>
            <div class="summary-item">
              <span class="summary-label">成交量</span>
              <span class="summary-value">{{ displayKline!.volume }} 股</span>
            </div>
          </div>
        </div>

        <div v-if="!stockStore.result && !stockStore.klineResult" class="empty-state">
          <div class="empty-icon">📈</div>
          <p>输入股票代码并点击查询，或从自选股中选择</p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
}

.back-button {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 0.9rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.stock-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 1.5rem;
}

.main-content {
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.query-card {
  background-color: var(--bg-card);
  border-radius: 8px;
  padding: 1.2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.query-card h2 {
  margin: 0 0 0.2rem;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.query-desc {
  margin: 0 0 1rem;
  color: var(--text-dim);
  font-size: 0.85rem;
}

.query-form {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 0.85rem;
  color: var(--text-primary);
  margin-bottom: 0.3rem;
  font-weight: 600;
}

.date-input {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.9rem;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.date-input:focus {
  outline: none;
  border-color: var(--info);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.search-input-wrapper {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 0.6rem 2rem 0.6rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.9rem;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--info);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.search-loading {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  color: var(--text-dim);
}

.clear-search {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.2rem;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 0 0.3rem;
}

.clear-search:hover {
  color: #e74c3c;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  max-height: 300px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--border-light);
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background-color: var(--bg-hover);
}

.result-info {
  display: flex;
  flex-direction: column;
}

.result-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.result-code {
  font-size: 0.8rem;
  color: var(--text-dim);
  font-family: monospace;
  margin-top: 0.1rem;
}

.result-market {
  font-size: 0.75rem;
  color: #fff;
  background-color: var(--info);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
}

.no-results {
  padding: 0.8rem;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.85rem;
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 4px 4px;
}

.query-btn {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.6rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: background-color 0.2s;
}

.query-btn:hover:not(:disabled) {
  background-color: #2980b9;
}

.query-btn:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.favorites-card {
  background-color: var(--bg-card);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.favorites-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.favorites-label {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 600;
}

.refresh-btn {
  background: none;
  border: 1px solid var(--info);
  color: var(--info);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.refresh-btn:hover {
  background-color: var(--info);
  color: white;
}

.favorites-loading {
  text-align: center;
  color: var(--text-dim);
  padding: 0.5rem;
  font-size: 0.85rem;
}

.favorites-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.favorites-table th {
  background-color: var(--bg-hover);
  padding: 0.4rem 0.5rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

.favorites-table td {
  padding: 0.5rem 0.5rem;
  border-bottom: 1px solid var(--border-light);
}

.favorites-table tbody tr {
  cursor: grab;
  transition: background-color 0.2s;
}

.favorites-table tbody tr:active {
  cursor: grabbing;
}

.favorites-table tbody tr:hover {
  background-color: var(--bg-hover);
}

.stock-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
}

.stock-code {
  color: var(--text-dim);
  font-family: monospace;
  font-size: 0.7rem;
  margin-top: 0.1rem;
}

.stock-price {
  font-weight: 600;
  font-size: 0.85rem;
}

.stock-change.up {
  color: #e74c3c;
}

.stock-change.down {
  color: #2ecc71;
}

.remove-fav-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 0.3rem;
  line-height: 1;
}

.remove-fav-btn:hover {
  color: #e74c3c;
}

.error-message {
  background-color: var(--danger-bg);
  border: 1px solid var(--danger);
  color: var(--danger);
  padding: 0.7rem 1rem;
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.error-icon {
  background-color: #e74c3c;
  color: white;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
  flex-shrink: 0;
}

.result-card {
  background-color: var(--bg-card);
  border-radius: 8px;
  padding: 1.2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--border-light);
}

.stock-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.stock-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.stock-code-badge {
  background-color: var(--accent-bg);
  color: var(--info);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: monospace;
}

.fav-btn {
  background: none;
  border: 1px solid var(--border-light);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--text-dim);
  transition: all 0.2s;
}

.fav-btn:hover {
  border-color: #f39c12;
  color: #f39c12;
}

.fav-btn.active {
  background-color: #fff3e0;
  border-color: #f39c12;
  color: #f39c12;
}

.result-date {
  color: var(--text-dim);
  font-size: 0.85rem;
}

.price-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.price-card {
  background-color: var(--bg-subtle);
  border-radius: 6px;
  padding: 0.8rem;
  text-align: center;
}

.price-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
}

.price-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.price-card.close .price-value {
  color: #e74c3c;
}

.summary-row {
  display: flex;
  gap: 2rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border-light);
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.summary-label {
  font-size: 0.85rem;
  color: var(--text-dim);
}

.summary-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.summary-value.up {
  color: #e74c3c;
}

.summary-value.down {
  color: #2ecc71;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state p {
  margin: 0;
  font-size: 1rem;
}

@media (max-width: 768px) {
  .app-container {
    padding: 0.8rem;
  }

  .app-header {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .app-header h1 {
    font-size: 1.2rem;
  }

  .back-button {
    padding: 0.4rem 0.8rem;
    font-size: 0.8rem;
  }

  .stock-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    position: static;
  }

  .query-card {
    padding: 1rem;
  }

  .query-card h2 {
    font-size: 1rem;
  }

  .query-form {
    gap: 0.6rem;
  }

  .form-group label {
    font-size: 0.8rem;
  }

  .search-input,
  .date-input {
    padding: 0.5rem;
    font-size: 0.85rem;
  }

  .query-btn {
    width: 100%;
    padding: 0.6rem;
  }

  .favorites-table {
    font-size: 0.75rem;
  }

  .favorites-table th,
  .favorites-table td {
    padding: 0.3rem 0.4rem;
  }

  .stock-name {
    font-size: 0.8rem;
  }

  .stock-code {
    font-size: 0.65rem;
  }

  .result-card {
    padding: 1rem;
  }

  .result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .price-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .price-card {
    padding: 0.6rem;
  }

  .price-value {
    font-size: 1rem;
  }

  .summary-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .stock-info {
    flex-wrap: wrap;
  }

  .stock-title {
    font-size: 1rem;
  }

  .empty-state {
    padding: 2rem 1rem;
  }

  .search-results {
    max-height: 200px;
  }
}
</style>
