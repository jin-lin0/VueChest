<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStockStore } from '@/stores/stock'
import { runMaBacktest, type BacktestResult } from '../portfolio'
import ResearchLineChart, { type ResearchSeries } from './ResearchLineChart.vue'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'StockBacktestPanel' })

const stock = useStockStore()
const { addToast } = useToast()
const shortPeriod = ref(5)
const longPeriod = ref(20)
const capital = ref(100_000)
const result = ref<BacktestResult | null>(null)

const chartSeries = computed<ResearchSeries[]>(() =>
  result.value ? [{ name: '策略权益', color: '#0f766e', points: result.value.equity }] : [],
)

function formatPrice(value: number | string | null | undefined, digits = 2) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '--'
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function run() {
  try {
    result.value = runMaBacktest(
      stock.klineChartData,
      Number(shortPeriod.value),
      Number(longPeriod.value),
      Number(capital.value),
    )
  } catch (error) {
    addToast('error', error instanceof Error ? error.message : '回测失败')
  }
}
</script>

<template>
  <section class="stock-panel backtest-panel">
    <header class="panel-heading">
      <div>
        <h2>均线策略回测</h2>
        <p>短均线上穿长均线买入、下穿卖出，含双边0.03%费用。</p>
      </div>
    </header>
    <div class="backtest-form">
      <label
        ><span>短均线</span><input v-model.number="shortPeriod" type="number" min="2" max="60"
      /></label>
      <label
        ><span>长均线</span><input v-model.number="longPeriod" type="number" min="3" max="120"
      /></label>
      <label
        ><span>初始资金</span><input v-model.number="capital" type="number" min="1000" step="1000"
      /></label>
      <button @click="run">运行回测</button>
    </div>
    <template v-if="result">
      <div class="backtest-metrics">
        <article>
          <small>策略收益</small
          ><strong :class="result.totalReturn >= 0 ? 'up' : 'down'">{{
            formatPercent(result.totalReturn)
          }}</strong>
        </article>
        <article>
          <small>同期持有</small
          ><strong :class="result.benchmarkReturn >= 0 ? 'up' : 'down'">{{
            formatPercent(result.benchmarkReturn)
          }}</strong>
        </article>
        <article>
          <small>最大回撤</small
          ><strong class="down">{{ formatPercent(result.maxDrawdown) }}</strong>
        </article>
        <article>
          <small>交易胜率</small><strong>{{ formatPercent(result.winRate) }}</strong>
        </article>
        <article>
          <small>交易次数</small><strong>{{ result.trades.length }}</strong>
        </article>
      </div>
      <ResearchLineChart :series="chartSeries" :height="300" />
      <div class="trade-list">
        <div
          v-for="trade in result.trades.slice().reverse().slice(0, 12)"
          :key="`${trade.buyDate}-${trade.sellDate}`"
        >
          <span
            ><small>买入</small
            ><strong>{{ trade.buyDate }} · ¥{{ formatPrice(trade.buyPrice) }}</strong></span
          >
          <span
            ><small>卖出</small
            ><strong>{{ trade.sellDate }} · ¥{{ formatPrice(trade.sellPrice) }}</strong></span
          >
          <b :class="trade.returnPercent >= 0 ? 'up' : 'down'">{{
            formatPercent(trade.returnPercent)
          }}</b>
        </div>
      </div>
    </template>
    <div v-else class="panel-empty">使用当前股票已加载的 K 线进行回测</div>
    <p class="backtest-note">
      回测仅验证历史规则表现，不代表未来收益；未计入滑点、涨跌停和无法成交等现实约束。
    </p>
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
.backtest-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(100px, 1fr)) auto;
  align-items: end;
  gap: 8px;
  margin: 16px 0;
}
.backtest-form label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 9px;
}
.backtest-form input {
  width: 100%;
  height: 38px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  outline: 0;
  padding: 0 10px;
  background: var(--bg-page);
  color: var(--text-primary);
}
.backtest-form button {
  min-height: 38px;
  border: 0;
  border-radius: 9px;
  padding: 0 16px;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
  font-weight: 800;
}
.backtest-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.backtest-metrics article {
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
.backtest-metrics small {
  color: var(--text-muted);
  font-size: 10px;
}
.backtest-metrics strong {
  margin-top: 4px;
  font-size: 20px;
}
.trade-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}
.trade-list > div {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px;
}
.trade-list span {
  display: flex;
  flex-direction: column;
}
.trade-list small {
  color: var(--text-muted);
  font-size: 8px;
}
.trade-list strong,
.trade-list b {
  font-size: 10px;
}
.backtest-note {
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.6;
  text-align: center;
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
  .backtest-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .backtest-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .trade-list {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .stock-panel {
    padding: 15px;
  }
  .backtest-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .backtest-form {
    grid-template-columns: 1fr;
  }
}
</style>
