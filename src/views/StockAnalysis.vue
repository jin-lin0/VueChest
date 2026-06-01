<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStockStore } from '@/stores'

defineOptions({ name: 'StockAnalysisView' })

const router = useRouter()
const stockStore = useStockStore()

onMounted(() => {
  stockStore.fetchFavoritesData()
})

const goBack = () => {
  router.push('/')
}

const selectFavorite = (code: string) => {
  stockStore.stockCode = code
  stockStore.queryStock()
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
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>股票查询</h1>
    </header>

    <main class="stock-content">
      <div class="query-section">
        <div class="query-card">
          <h2>查询股票行情</h2>
          <p class="query-desc">输入股票代码，查询实时开盘价和当前价格</p>

          <div class="query-form">
            <div class="form-group">
              <label>股票代码</label>
              <div class="code-input-wrapper">
                <input
                  v-model="stockStore.stockCode"
                  type="text"
                  placeholder="请输入6位股票代码，如 600519"
                  maxlength="6"
                  class="code-input"
                  @keyup.enter="stockStore.queryStock()"
                />
                <span v-if="stockStore.stockName" class="stock-name-tag">
                  {{ stockStore.stockName }}
                </span>
              </div>
              <div class="code-hint">沪市: 6开头 | 深市: 0/3开头 | 科创板: 688开头</div>
            </div>

            <div v-if="stockStore.favorites.length > 0" class="favorites-section">
              <div class="favorites-header">
                <span class="favorites-label">自选股</span>
                <button class="refresh-btn" @click="stockStore.fetchFavoritesData()">刷新</button>
              </div>
              <div v-if="stockStore.isFavoritesLoading" class="favorites-loading">加载中...</div>
              <table v-else-if="stockStore.favoritesData.length > 0" class="favorites-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>代码</th>
                    <th>最新价</th>
                    <th>涨跌幅</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="stock in stockStore.favoritesData"
                    :key="stock.code"
                    @click="selectFavorite(stock.code)"
                  >
                    <td class="stock-name">{{ stock.name }}</td>
                    <td class="stock-code">{{ stock.code }}</td>
                    <td class="stock-price">¥{{ formatPrice(stock.price) }}</td>
                    <td :class="['stock-change', Number(stock.changePercent) >= 0 ? 'up' : 'down']">
                      {{ Number(stock.changePercent) >= 0 ? '+' : '' }}{{ stock.changePercent }}%
                    </td>
                    <td>
                      <button
                        class="remove-fav-btn"
                        @click.stop="stockStore.removeFavorite(stock.code)"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button
              class="query-btn"
              :disabled="stockStore.isLoading"
              @click="stockStore.queryStock()"
            >
              <span v-if="stockStore.isLoading" class="loading-spinner"></span>
              {{ stockStore.isLoading ? '查询中...' : '查询' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="stockStore.error" class="error-message">
        <span class="error-icon">!</span>
        <span>{{ stockStore.error }}</span>
      </div>

      <div v-if="stockStore.result" class="result-section">
        <div class="result-card">
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
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.back-button {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #2c3e50;
}

.stock-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.query-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.query-card h2 {
  margin: 0 0 0.3rem;
  font-size: 1.3rem;
  color: #2c3e50;
}

.query-desc {
  margin: 0 0 1.2rem;
  color: #7f8c8d;
  font-size: 0.9rem;
}

.query-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 0.9rem;
  color: #2c3e50;
  margin-bottom: 0.4rem;
  font-weight: 600;
}

.code-input-wrapper {
  position: relative;
}

.code-input,
.date-input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.code-input:focus,
.date-input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.stock-name-tag {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background-color: #e3f2fd;
  color: #1976d2;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.code-hint {
  margin-top: 0.3rem;
  font-size: 0.8rem;
  color: #95a5a6;
}

.favorites-section {
  margin-top: 0.5rem;
}

.favorites-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.favorites-label {
  font-size: 0.9rem;
  color: #2c3e50;
  font-weight: 600;
}

.refresh-btn {
  background: none;
  border: 1px solid #3498db;
  color: #3498db;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.refresh-btn:hover {
  background-color: #3498db;
  color: white;
}

.favorites-loading {
  text-align: center;
  color: #7f8c8d;
  padding: 1rem;
  font-size: 0.9rem;
}

.favorites-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.favorites-table th {
  background-color: #f5f5f5;
  padding: 0.6rem 0.8rem;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 2px solid #e0e0e0;
}

.favorites-table td {
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid #eee;
}

.favorites-table tbody tr {
  cursor: pointer;
  transition: background-color 0.2s;
}

.favorites-table tbody tr:hover {
  background-color: #f5f5f5;
}

.stock-name {
  font-weight: 600;
  color: #2c3e50;
}

.stock-code {
  color: #7f8c8d;
  font-family: monospace;
}

.stock-price {
  font-weight: 600;
}

.stock-change.up {
  color: #e74c3c;
}

.stock-change.down {
  color: #2ecc71;
}

.remove-fav-btn {
  background: none;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.remove-fav-btn:hover {
  background-color: #e74c3c;
  color: white;
}

.query-btn {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.8rem 2rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: background-color 0.2s;
  align-self: flex-start;
}

.query-btn:hover:not(:disabled) {
  background-color: #2980b9;
}

.query-btn:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.loading-spinner {
  width: 16px;
  height: 16px;
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

.error-message {
  background-color: #fdecea;
  border: 1px solid #f5c6cb;
  color: #721c24;
  padding: 0.8rem 1rem;
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.error-icon {
  background-color: #e74c3c;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  flex-shrink: 0;
}

.result-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.stock-info {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.stock-title {
  margin: 0;
  font-size: 1.3rem;
  color: #2c3e50;
}

.stock-code-badge {
  background-color: #e3f2fd;
  color: #1976d2;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-family: monospace;
}

.fav-btn {
  background: none;
  border: 1px solid #e0e0e0;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #7f8c8d;
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
  color: #7f8c8d;
  font-size: 0.9rem;
}

.price-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.price-card {
  background-color: #f9f9f9;
  border-radius: 6px;
  padding: 1rem;
  text-align: center;
}

.price-label {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin-bottom: 0.4rem;
}

.price-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: #2c3e50;
}

.price-card.close .price-value {
  color: #e74c3c;
}

.summary-row {
  display: flex;
  gap: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.summary-label {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.summary-value {
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
}

.summary-value.up {
  color: #e74c3c;
}

.summary-value.down {
  color: #2ecc71;
}

@media (max-width: 600px) {
  .app-container {
    padding: 1rem;
  }

  .form-row {
    flex-direction: column;
  }

  .price-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .summary-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .stock-info {
    flex-wrap: wrap;
  }
}
</style>
