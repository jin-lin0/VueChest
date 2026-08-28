<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStockStore } from '@/stores/stock'
import { correlation, normalizePerformance, type CompareSeries } from '../portfolio'
import ResearchLineChart, { type ResearchSeries } from './ResearchLineChart.vue'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'StockComparePanel' })

const stock = useStockStore()
const { addToast } = useToast()
const selection = ref<string[]>([])
const series = ref<CompareSeries[]>([])
const correlations = ref<Record<string, number | null>>({})
const loading = ref(false)

const candidates = computed(() => {
  const items = [...stock.favorites, ...stock.recentStocks, ...stock.positions]
  return [
    ...new Map(items.map((item) => [item.code, { code: item.code, name: item.name }])).values(),
  ]
})

const chartSeries = computed<ResearchSeries[]>(() => {
  const colors = ['#0f766e', '#7c3aed', '#dc2626', '#d97706']
  return series.value.map((item, index) => ({
    name: item.name,
    color: colors[index % colors.length],
    points: item.points,
  }))
})

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function toggle(code: string) {
  if (selection.value.includes(code)) {
    selection.value = selection.value.filter((item) => item !== code)
    return
  }
  if (selection.value.length >= 4) {
    addToast('warning', '最多同时对比 4 只股票')
    return
  }
  selection.value.push(code)
}

async function run() {
  if (selection.value.length < 2) {
    addToast('warning', '请至少选择 2 只股票')
    return
  }
  loading.value = true
  try {
    const rows = await Promise.all(
      selection.value.map(async (code) => ({
        code,
        data: await stock.fetchKlineData(code, 'day', 250),
      })),
    )
    series.value = rows.map((row) => {
      const item = candidates.value.find((candidate) => candidate.code === row.code)
      return normalizePerformance(row.code, item?.name || row.code, row.data)
    })
    const base = rows[0]
    correlations.value = Object.fromEntries(
      rows.slice(1).map((row) => [row.code, correlation(base.data, row.data)]),
    )
  } catch (error) {
    addToast('error', error instanceof Error ? error.message : '股票对比加载失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="stock-panel compare-panel">
    <header class="panel-heading">
      <div>
        <h2>多股票对比</h2>
        <p>将最近250个交易日归一化为100，比较收益、波动与相关性。</p>
      </div>
      <button :disabled="loading || selection.length < 2" @click="run">
        {{ loading ? '加载中…' : '开始对比' }}
      </button>
    </header>
    <div class="compare-picker">
      <button
        v-for="item in candidates"
        :key="item.code"
        :class="{ active: selection.includes(item.code) }"
        @click="toggle(item.code)"
      >
        <strong>{{ item.name }}</strong
        ><small>{{ item.code }}</small>
      </button>
    </div>
    <ResearchLineChart v-if="chartSeries.length" :series="chartSeries" :height="330" />
    <div v-if="series.length" class="compare-metrics">
      <article v-for="(item, index) in series" :key="item.code">
        <i :style="{ background: chartSeries[index]?.color }"></i>
        <span
          ><strong>{{ item.name }}</strong
          ><small>{{ item.code }}</small></span
        >
        <span>
          <small>区间收益</small>
          <b :class="item.changePercent >= 0 ? 'up' : 'down'">{{
            formatPercent(item.changePercent)
          }}</b>
        </span>
        <span
          ><small>年化波动</small><b>{{ formatPercent(item.volatility) }}</b></span
        >
        <span v-if="index > 0">
          <small>与 {{ series[0].name }} 相关性</small><b>{{ correlations[item.code] ?? '--' }}</b>
        </span>
      </article>
    </div>
    <div v-else class="panel-empty">选择2–4只自选、持仓或最近研究的股票</div>
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
  font-size: 18px;
}
.panel-heading p {
  color: var(--text-secondary);
  font-size: 11px;
}
.panel-heading button {
  min-height: 38px;
  border: 0;
  border-radius: 9px;
  padding: 0 14px;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
  font-weight: 800;
}
.panel-heading button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.compare-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 16px 0 12px;
}
.compare-picker button {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  padding: 8px 11px;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.compare-picker button.active {
  border-color: #0f766e;
  background: color-mix(in srgb, #0f766e 10%, var(--bg-card));
}
.compare-picker small,
.compare-metrics small {
  color: var(--text-muted);
  font-size: 9px;
}
.compare-metrics {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}
.compare-metrics article {
  display: grid;
  grid-template-columns: 6px minmax(120px, 1fr) repeat(3, minmax(100px, 0.6fr));
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px;
}
.compare-metrics i {
  width: 6px;
  height: 34px;
  border-radius: 99px;
}
.compare-metrics span {
  display: flex;
  flex-direction: column;
}
.compare-metrics b {
  font-size: 12px;
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
@media (max-width: 980px) {
  .compare-metrics {
    overflow-x: auto;
  }
  .compare-metrics article {
    min-width: 660px;
  }
}
@media (max-width: 520px) {
  .stock-panel {
    padding: 15px;
  }
}
</style>
