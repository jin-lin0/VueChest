<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStockStore } from '@/stores/stock'
import { formatLargeNumber } from '../research'
import { portfolioTotals } from '../portfolio'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'StockPortfolioPanel' })

const emit = defineEmits<{
  openStock: [code: string]
}>()

const stock = useStockStore()
const { addToast } = useToast()
const positionShares = ref<number | null>(null)
const positionCost = ref<number | null>(null)

const currentPrice = computed(() =>
  Number(stock.researchSummary?.price ?? stock.result?.close ?? 0),
)
const summary = computed(() => portfolioTotals(stock.portfolioPositionMetrics))

function formatPrice(value: number | string | null | undefined, digits = 2) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '--'
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function savePosition() {
  if (!stock.result || !positionShares.value || !positionCost.value) return
  if (positionShares.value <= 0 || positionCost.value <= 0) return
  stock.upsertPosition({
    code: stock.stockCode,
    name: stock.result.name,
    shares: positionShares.value,
    costPrice: positionCost.value,
  })
  positionShares.value = null
  positionCost.value = null
  addToast('success', '模拟持仓已保存')
}
</script>

<template>
  <section class="portfolio-panel">
    <div class="portfolio-heading">
      <div>
        <span>PORTFOLIO</span>
        <h1>模拟持仓</h1>
        <p>独立查看仓位与盈亏；选择股票后可在左侧补充新持仓。</p>
      </div>
      <button type="button" :disabled="stock.isPortfolioLoading" @click="stock.fetchPortfolioData">
        {{ stock.isPortfolioLoading ? '刷新中…' : '刷新行情' }}
      </button>
    </div>

    <div class="portfolio-summary-grid">
      <article>
        <small>模拟总成本</small><strong>{{ formatLargeNumber(summary.cost) }}</strong>
      </article>
      <article>
        <small>当前市值</small><strong>{{ formatLargeNumber(summary.marketValue) }}</strong>
      </article>
      <article :class="summary.profit >= 0 ? 'up' : 'down'">
        <small>浮动盈亏</small><strong>{{ formatLargeNumber(summary.profit) }}</strong
        ><b>{{ formatPercent(summary.profitPercent) }}</b>
      </article>
      <article>
        <small>已获取行情</small><strong>{{ summary.priced }}/{{ stock.positions.length }}</strong>
      </article>
    </div>

    <div class="portfolio-layout">
      <article class="workspace-card position-form-card">
        <header class="card-header">
          <div>
            <h2>记录模拟持仓</h2>
            <p v-if="stock.result">{{ stock.result.name }} · {{ stock.stockCode }}</p>
            <p v-else>尚未选择股票</p>
          </div>
        </header>
        <template v-if="stock.result">
          <label>
            <span>持有数量</span>
            <input
              v-model.number="positionShares"
              type="number"
              min="1"
              step="100"
              placeholder="100"
            />
          </label>
          <label>
            <span>成本价</span>
            <input
              v-model.number="positionCost"
              type="number"
              min="0.01"
              step="0.01"
              :placeholder="formatPrice(currentPrice)"
            />
          </label>
          <button type="button" :disabled="!positionShares || !positionCost" @click="savePosition">
            保存持仓
          </button>
        </template>
        <div v-else class="position-select-empty">
          <span>⌕</span>
          <strong>先从左侧选择股票</strong>
          <p>已有持仓可直接在右侧查看，不需要先查询股票。</p>
        </div>
        <p>模拟数据默认保存在本机；如需跨设备使用，可在云同步设置中主动选择股票数据。</p>
      </article>

      <article class="workspace-card position-list-card">
        <header class="card-header">
          <div>
            <h2>持仓明细</h2>
            <p>{{ stock.positions.length ? `${stock.positions.length} 只股票` : '暂无持仓' }}</p>
          </div>
        </header>
        <div v-if="stock.portfolioPositionMetrics.length" class="position-table-wrap">
          <table class="position-table">
            <thead>
              <tr>
                <th>股票</th>
                <th>数量</th>
                <th>成本价</th>
                <th>现价</th>
                <th>市值</th>
                <th>盈亏</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in stock.portfolioPositionMetrics" :key="item.id">
                <td>
                  <button
                    type="button"
                    class="position-stock"
                    title="打开股票研究"
                    @click="emit('openStock', item.code)"
                  >
                    <strong>{{ item.name }}</strong
                    ><small>{{ item.code }}</small>
                  </button>
                </td>
                <td>{{ item.shares.toLocaleString() }}</td>
                <td>{{ formatPrice(item.costPrice) }}</td>
                <td>{{ formatPrice(item.currentPrice) }}</td>
                <td>{{ formatLargeNumber(item.marketValue) }}</td>
                <td :class="Number(item.profit) >= 0 ? 'up' : 'down'">
                  <strong>{{ formatLargeNumber(item.profit) }}</strong
                  ><small>{{ formatPercent(item.profitPercent) }}</small>
                </td>
                <td>
                  <button
                    type="button"
                    class="remove-position"
                    aria-label="删除持仓"
                    @click="stock.removePosition(item.id)"
                  >
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="panel-empty">
          <span>◇</span>
          <strong>还没有模拟持仓</strong>
          <p>从左侧查询一只股票后即可记录数量与成本。</p>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.portfolio-panel {
  display: grid;
  gap: 14px;
}

.portfolio-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 2px;
}

.portfolio-heading span {
  color: #0f766e;
  font-size: var(--font-size-caption);
  font-weight: 900;
  letter-spacing: 0.15em;
}

.portfolio-heading h1 {
  margin: 2px 0;
  color: var(--text-primary);
  font-size: var(--font-size-4xl);
}

.portfolio-heading p,
.card-header p {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.portfolio-heading > button {
  min-height: 36px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  padding: 0 13px;
  background: var(--bg-card);
  color: #0f766e;
  cursor: pointer;
  font-weight: 800;
}

.portfolio-heading > button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.portfolio-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.portfolio-summary-grid article {
  display: flex;
  min-height: 82px;
  flex-direction: column;
  justify-content: center;
  border: 1px solid var(--border-light);
  border-radius: 15px;
  padding: 14px 16px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.portfolio-summary-grid small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.portfolio-summary-grid strong {
  margin-top: 4px;
  font-size: var(--font-size-heading);
}

.portfolio-summary-grid b {
  font-size: var(--font-size-caption);
}

.portfolio-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}

.workspace-card {
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 10px 36px rgba(15, 23, 42, 0.055);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.card-header h2 {
  margin-top: 3px;
  color: var(--text-primary);
  font-size: var(--font-size-title-lg);
}

.position-form-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.position-form-card label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
}

.position-form-card input {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  outline: 0;
  padding: 0 10px;
  background: var(--bg-page);
  color: var(--text-primary);
}

.position-form-card input:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.position-form-card > button {
  min-height: 38px;
  border: 0;
  border-radius: 9px;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
  font-weight: 800;
}

.position-form-card > button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.position-form-card > p {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  line-height: 1.6;
}

.position-select-empty,
.panel-empty {
  display: grid;
  min-height: 150px;
  place-items: center;
  align-content: center;
  gap: 4px;
  border: 1px dashed var(--border-light);
  border-radius: 13px;
  padding: 14px;
  color: var(--text-muted);
  text-align: center;
}

.position-select-empty > span,
.panel-empty > span {
  color: #0f766e;
  font-size: var(--font-size-4xl);
}

.position-select-empty strong,
.panel-empty strong {
  color: var(--text-primary);
  font-size: var(--font-size-small);
}

.position-select-empty p,
.panel-empty p {
  max-width: 250px;
  font-size: var(--font-size-caption);
}

.position-table-wrap {
  overflow: auto;
  margin-top: 12px;
}

.position-table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}

.position-table th,
.position-table td {
  border-bottom: 1px solid var(--border-light);
  padding: 11px 9px;
  font-size: var(--font-size-caption);
  text-align: right;
}

.position-table th {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.position-table th:first-child,
.position-table td:first-child {
  text-align: left;
}

.position-table td:nth-last-child(2) strong,
.position-table td:nth-last-child(2) small {
  display: block;
}

.position-table small {
  color: var(--text-muted);
}

.position-stock,
.remove-position {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.position-stock {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  color: var(--text-primary);
  text-align: left;
}

.position-stock:hover strong {
  color: #0f766e;
}

.remove-position {
  color: var(--text-muted);
  font-size: var(--font-size-title);
}

.remove-position:hover {
  color: var(--danger);
}

.up {
  color: var(--stock-up) !important;
}

.down {
  color: var(--stock-down) !important;
}

@media (max-width: 980px) {
  .portfolio-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .portfolio-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .portfolio-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .portfolio-summary-grid {
    grid-template-columns: 1fr 1fr;
  }

  .workspace-card {
    padding: 15px;
  }
}
</style>
