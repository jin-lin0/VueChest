<script setup lang="ts">
import { computed } from 'vue'
import { useStockStore } from '@/stores/stock'
import { formatLargeNumber } from '../research'
import ResearchLineChart, { type ResearchSeries } from './ResearchLineChart.vue'

defineOptions({ name: 'StockFinancialsPanel' })

const stock = useStockStore()
const chartSeries = computed<ResearchSeries[]>(() => {
  const rows = [...stock.financials].reverse()
  return [
    {
      name: '营业收入（亿）',
      color: '#0f766e',
      points: rows
        .filter((item) => item.revenue != null)
        .map((item) => ({
          date: item.reportDate,
          value: Number((item.revenue! / 1e8).toFixed(2)),
        })),
    },
    {
      name: '归母净利润（亿）',
      color: '#7c3aed',
      points: rows
        .filter((item) => item.netProfit != null)
        .map((item) => ({
          date: item.reportDate,
          value: Number((item.netProfit! / 1e8).toFixed(2)),
        })),
    },
  ]
})

function formatPrice(value: number | string | null | undefined, digits = 2) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '--'
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}
</script>

<template>
  <section class="stock-panel">
    <header class="panel-heading">
      <div>
        <h2>财务指标时间线</h2>
        <p>对比营收、利润、盈利能力与偿债结构的变化。</p>
      </div>
      <span>数据源：东方财富</span>
    </header>
    <ResearchLineChart
      v-if="chartSeries.some((item) => item.points.length)"
      :series="chartSeries"
      :height="280"
    />
    <div v-if="stock.financials.length" class="financial-table-wrap">
      <table class="financial-table">
        <thead>
          <tr>
            <th>报告期</th>
            <th>营业收入</th>
            <th>营收同比</th>
            <th>归母净利润</th>
            <th>利润同比</th>
            <th>EPS</th>
            <th>ROE</th>
            <th>毛利率</th>
            <th>负债率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in stock.financials" :key="`${item.reportDate}-${item.reportName}`">
            <td>
              <strong>{{ item.reportName }}</strong
              ><small>{{ item.reportDate }}</small>
            </td>
            <td>{{ formatLargeNumber(item.revenue) }}</td>
            <td :class="Number(item.revenueGrowth) >= 0 ? 'up' : 'down'">
              {{ formatPercent(item.revenueGrowth) }}
            </td>
            <td>{{ formatLargeNumber(item.netProfit) }}</td>
            <td :class="Number(item.netProfitGrowth) >= 0 ? 'up' : 'down'">
              {{ formatPercent(item.netProfitGrowth) }}
            </td>
            <td>{{ formatPrice(item.eps) }}</td>
            <td>{{ formatPercent(item.roe) }}</td>
            <td>{{ formatPercent(item.grossMargin) }}</td>
            <td>{{ formatPercent(item.debtRatio) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="panel-empty">财务数据暂不可用</div>
  </section>
</template>

<style scoped>
.stock-panel {
  min-height: 560px;
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 10px 36px rgba(15, 23, 42, 0.055);
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-light);
}
.panel-heading h2 {
  font-size: var(--font-size-title-lg);
}
.panel-heading p {
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
}
.panel-heading > span {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.financial-table-wrap {
  overflow: auto;
  margin-top: 14px;
}
.financial-table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}
.financial-table th {
  padding: 10px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  text-align: right;
}
.financial-table th:first-child,
.financial-table td:first-child {
  text-align: left;
}
.financial-table td {
  padding: 13px 10px;
  border-top: 1px solid var(--border-light);
  font-size: var(--font-size-meta);
  text-align: right;
}
.financial-table td:first-child {
  display: flex;
  flex-direction: column;
}
.financial-table small {
  color: var(--text-muted);
}
.panel-empty {
  display: grid;
  min-height: 300px;
  place-items: center;
  color: var(--text-muted);
}
.up {
  color: var(--stock-up) !important;
}
.down {
  color: var(--stock-down) !important;
}
@media (max-width: 520px) {
  .stock-panel {
    padding: 15px;
  }
  .financial-table {
    min-width: 820px;
  }
}
</style>
