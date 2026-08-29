<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useStockStore, type KlineData, type KlinePeriod } from '@/stores/stock'
import { formatLargeNumber } from '../research'
import type { DecisionSummary } from '../decision'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'StockOverviewPanel' })

defineProps<{
  period: KlinePeriod
  decision: DecisionSummary
}>()

const emit = defineEmits<{
  'update:period': [period: KlinePeriod]
  openPanel: [panel: 'financials' | 'notices']
}>()

const StockChart = defineAsyncComponent(() => import('./StockChart.vue'))
const TradeDatePicker = defineAsyncComponent(() => import('./TradeDatePicker.vue'))
const stock = useStockStore()
const { addToast } = useToast()
const activeKline = ref<KlineData | null>(null)

const quote = computed(() => stock.researchSummary)
const latestFinancial = computed(() => stock.financials[0] ?? null)
const displayKline = computed(() => activeKline.value ?? stock.klineResult)
const coverage = computed(() => {
  const first = stock.klineChartData[0]?.date
  const last = stock.klineChartData.at(-1)?.date
  return first && last ? `${first} 至 ${last} · ${stock.klineChartData.length} 根` : ''
})

function formatPrice(value: number | string | null | undefined, digits = 2) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '--'
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

async function changePeriod(period: KlinePeriod) {
  emit('update:period', period)
  activeKline.value = null
  if (!stock.stockCode) return
  try {
    await stock.loadKline(stock.stockCode, period)
  } catch (error) {
    addToast('error', error instanceof Error ? error.message : 'K 线数据加载失败')
  }
}

async function queryByDate(date: Date | null) {
  if (!date || !stock.stockCode) return
  stock.selectedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  await stock.queryStockByDate()
  activeKline.value = stock.klineResult
}

watch(
  () => stock.stockCode,
  () => {
    activeKline.value = null
  },
)
</script>

<template>
  <section class="panel-stack">
    <article class="workspace-card chart-card">
      <header class="card-header">
        <div>
          <h2>价格趋势</h2>
          <p v-if="stock.isKlineLoading">正在加载历史数据…</p>
          <p v-else-if="coverage">{{ coverage }}</p>
        </div>
        <div class="chart-controls">
          <div class="period-switch">
            <button
              v-for="item in ['day', 'week', 'month'] as KlinePeriod[]"
              :key="item"
              :class="{ active: period === item }"
              :disabled="stock.isKlineLoading"
              @click="changePeriod(item)"
            >
              {{ item === 'day' ? '日线' : item === 'week' ? '周线' : '月线' }}
            </button>
          </div>
          <TradeDatePicker @select="queryByDate" />
        </div>
      </header>
      <StockChart
        :data="stock.klineChartData"
        :selected-date="activeKline?.date || ''"
        @candle-click="activeKline = $event"
      />
      <div v-if="displayKline" class="candle-inspector">
        <span
          ><small>{{ displayKline.date }}</small
          ><strong>选中交易日</strong></span
        >
        <span
          ><small>开盘</small><strong>{{ formatPrice(displayKline.open) }}</strong></span
        >
        <span
          ><small>收盘</small><strong>{{ formatPrice(displayKline.close) }}</strong></span
        >
        <span
          ><small>最高 / 最低</small
          ><strong
            >{{ formatPrice(displayKline.high) }} / {{ formatPrice(displayKline.low) }}</strong
          ></span
        >
        <span
          ><small>成交量</small
          ><strong>{{ formatLargeNumber(Number(displayKline.volume)) }}</strong></span
        >
      </div>
    </article>

    <div class="analysis-grid">
      <article class="workspace-card decision-card">
        <header class="card-header">
          <div>
            <h2>研判结论</h2>
            <p>基于技术、估值、财务与公告信号的执行化输出</p>
          </div>
          <span class="decision-badge" :class="decision.tone">{{ decision.label }}</span>
        </header>
        <div class="decision-score">
          <strong>{{ decision.score }}</strong
          ><span>/100</span><small>置信度 {{ decision.confidence }}</small>
        </div>
        <div class="decision-metrics">
          <span>数据覆盖率：{{ decision.dataCoverage }}%</span>
          <span v-if="decision.missingData.length"
            >缺失项：{{ decision.missingData.join(' · ') }}</span
          >
        </div>
        <div v-if="decision.highlights.length" class="decision-highlights">
          <span v-for="item in decision.highlights" :key="`h-${item}`">{{ item }}</span>
        </div>
        <div v-if="decision.watchItems.length" class="decision-block">
          <h3>关键触发</h3>
          <ul>
            <li v-for="item in decision.watchItems" :key="`w-${item}`">{{ item }}</li>
          </ul>
        </div>
        <div v-if="decision.risks.length" class="decision-block">
          <h3>风险提示</h3>
          <ul>
            <li v-for="item in decision.risks" :key="`r-${item}`">{{ item }}</li>
          </ul>
        </div>
        <p class="decision-action">{{ decision.action }}</p>
      </article>

      <article class="workspace-card signal-card">
        <header class="card-header">
          <div><h2>技术研判</h2></div>
        </header>
        <template v-if="stock.technicalSnapshot">
          <div class="score-row">
            <div
              class="score-ring"
              :style="{ '--score': `${stock.technicalSnapshot.score * 3.6}deg` }"
            >
              <span
                ><strong>{{ stock.technicalSnapshot.score }}</strong
                ><small>/ 100</small></span
              >
            </div>
            <div class="trend-copy">
              <strong :class="stock.technicalSnapshot.trend">{{
                stock.technicalSnapshot.trendLabel
              }}</strong>
              <p>基于均线结构、RSI 与 MACD 的规则化快照，不预测未来涨跌。</p>
            </div>
          </div>
          <div class="signal-list">
            <div
              v-for="signal in stock.technicalSnapshot.signals"
              :key="signal.label"
              :class="signal.tone"
            >
              <i></i
              ><span
                ><strong>{{ signal.label }}</strong
                ><small>{{ signal.detail }}</small></span
              >
            </div>
          </div>
        </template>
      </article>

      <article class="workspace-card metric-card">
        <header class="card-header">
          <div><h2>交易与估值</h2></div>
        </header>
        <div class="metric-grid">
          <span
            ><small>市盈率 PE</small><strong>{{ formatPrice(quote?.pe) }}</strong></span
          >
          <span
            ><small>市净率 PB</small><strong>{{ formatPrice(quote?.pb) }}</strong></span
          >
          <span
            ><small>换手率</small><strong>{{ formatPercent(quote?.turnover) }}</strong></span
          >
          <span
            ><small>振幅</small><strong>{{ formatPercent(quote?.amplitude) }}</strong></span
          >
          <span
            ><small>量比</small><strong>{{ formatPrice(quote?.volumeRatio) }}</strong></span
          >
          <span
            ><small>总市值</small
            ><strong>{{ formatLargeNumber(quote?.totalMarketCap) }}</strong></span
          >
          <span
            ><small>20日动量</small
            ><strong>{{ formatPercent(stock.technicalSnapshot?.momentum20) }}</strong></span
          >
          <span
            ><small>年化波动</small
            ><strong>{{ formatPercent(stock.technicalSnapshot?.volatility20) }}</strong></span
          >
        </div>
        <div v-if="stock.technicalSnapshot" class="support-bar">
          <span
            ><small>20日支撑</small
            ><strong>{{ formatPrice(stock.technicalSnapshot.support) }}</strong></span
          >
          <i></i>
          <span
            ><small>20日压力</small
            ><strong>{{ formatPrice(stock.technicalSnapshot.resistance) }}</strong></span
          >
        </div>
      </article>

      <article v-if="latestFinancial" class="workspace-card finance-preview">
        <header class="card-header">
          <div><h2>财务质量</h2></div>
          <button @click="emit('openPanel', 'financials')">查看全部 →</button>
        </header>
        <div class="report-title">
          <strong>{{ latestFinancial.reportName }}</strong
          ><small>{{ latestFinancial.reportDate }}</small>
        </div>
        <div class="quality-grid">
          <span
            ><small>营业收入</small><strong>{{ formatLargeNumber(latestFinancial.revenue) }}</strong
            ><b :class="Number(latestFinancial.revenueGrowth) >= 0 ? 'up' : 'down'">{{
              formatPercent(latestFinancial.revenueGrowth)
            }}</b></span
          >
          <span
            ><small>归母净利润</small
            ><strong>{{ formatLargeNumber(latestFinancial.netProfit) }}</strong
            ><b :class="Number(latestFinancial.netProfitGrowth) >= 0 ? 'up' : 'down'">{{
              formatPercent(latestFinancial.netProfitGrowth)
            }}</b></span
          >
          <span
            ><small>ROE</small><strong>{{ formatPercent(latestFinancial.roe) }}</strong></span
          >
          <span
            ><small>毛利率</small
            ><strong>{{ formatPercent(latestFinancial.grossMargin) }}</strong></span
          >
        </div>
      </article>

      <article class="workspace-card notice-preview">
        <header class="card-header">
          <div><h2>最新公告</h2></div>
          <button @click="emit('openPanel', 'notices')">查看全部 →</button>
        </header>
        <a
          v-for="notice in stock.notices.slice(0, 4)"
          :key="notice.id"
          :href="notice.url"
          target="_blank"
          rel="noreferrer"
        >
          <span
            ><b>{{ notice.category }}</b
            ><strong>{{ notice.title }}</strong></span
          ><small>{{ notice.date }} ↗</small>
        </a>
        <p v-if="!stock.notices.length" class="card-empty">暂无公告数据</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.panel-stack {
  display: grid;
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
  font-size: var(--font-size-title-lg);
}
.card-header button {
  border: 0;
  background: transparent;
  color: #0f766e;
  cursor: pointer;
  font-weight: 800;
}
.chart-card .card-header p,
.decision-card .card-header p {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.chart-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.period-switch {
  display: flex;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  padding: 3px;
  background: var(--bg-page);
}
.period-switch button {
  border: 0;
  border-radius: 6px;
  padding: 5px 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-meta);
}
.period-switch button.active {
  background: #0f766e;
  color: #fff;
}
.period-switch button:disabled {
  cursor: wait;
  opacity: 0.5;
}
.chart-controls :deep(.dp__main) {
  width: 130px;
}
.chart-controls :deep(.dp__input) {
  height: 34px;
  border-color: var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}
.candle-inspector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 10px;
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-subtle);
}
.candle-inspector span {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-light);
  padding-left: 10px;
}
.candle-inspector small,
.metric-grid small,
.quality-grid small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.candle-inspector strong {
  font-size: var(--font-size-small);
}
.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.score-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  align-items: center;
  gap: 20px;
  margin: 18px 0;
}
.score-ring {
  --score: 180deg;
  position: relative;
  display: grid;
  width: 94px;
  height: 94px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(#0f766e var(--score), var(--bg-subtle) 0);
}
.score-ring::before {
  position: absolute;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-card);
  content: '';
}
.score-ring span {
  position: relative;
  display: flex;
  align-items: baseline;
}
.score-ring strong {
  font-size: var(--font-size-5xl);
}
.score-ring small,
.signal-list small,
.support-bar small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.trend-copy > strong {
  font-size: var(--font-size-heading);
}
.trend-copy p {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  line-height: 1.6;
}
.signal-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.signal-list > div {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  padding: 10px;
}
.signal-list i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}
.signal-list .positive i {
  background: #0f766e;
}
.signal-list .negative i {
  background: var(--danger);
}
.signal-list span {
  display: flex;
  flex-direction: column;
}
.signal-list strong {
  font-size: var(--font-size-meta);
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 17px;
}
.metric-grid span,
.quality-grid span {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-subtle);
}
.metric-grid strong {
  margin-top: 3px;
  font-size: var(--font-size-body-lg);
}
.support-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  border: 1px dashed rgba(15, 118, 110, 0.28);
  border-radius: 11px;
  padding: 11px 14px;
}
.support-bar span {
  display: flex;
  flex-direction: column;
}
.support-bar i {
  flex: 1;
  height: 3px;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--stock-down), #eab308, var(--stock-up));
}
.support-bar strong {
  font-size: var(--font-size-control);
}
.report-title {
  display: flex;
  justify-content: space-between;
  margin: 16px 0 9px;
}
.report-title small {
  color: var(--text-muted);
}
.quality-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.quality-grid strong {
  margin: 4px 0;
  font-size: var(--font-size-body);
}
.quality-grid b {
  font-size: var(--font-size-caption);
}
.decision-badge {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 12px;
  background: var(--bg-subtle);
  font-size: var(--font-size-small);
  font-weight: 800;
}
.decision-badge.bullish {
  border: 1px solid color-mix(in srgb, var(--stock-up) 28%, transparent);
  color: var(--stock-up);
}
.decision-badge.neutral {
  border: 1px solid color-mix(in srgb, #e8a317 28%, transparent);
  color: #e8a317;
}
.decision-badge.bearish {
  border: 1px solid color-mix(in srgb, var(--stock-down) 28%, transparent);
  color: var(--stock-down);
}
.decision-score {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 12px 0 10px;
}
.decision-score strong {
  font-size: var(--font-size-5xl);
}
.decision-score small,
.decision-metrics {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.decision-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 8px;
}
.decision-highlights {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.decision-highlights span {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 8px 10px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
}
.decision-block {
  margin-top: 12px;
}
.decision-block h3 {
  margin-bottom: 6px;
  font-size: var(--font-size-small);
}
.decision-block ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 16px;
  color: var(--text-secondary);
}
.decision-block li {
  font-size: var(--font-size-meta);
  line-height: 1.6;
}
.decision-action {
  margin-top: 12px;
  border-radius: 10px;
  padding: 10px 11px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: var(--font-size-meta);
  line-height: 1.65;
}
.notice-preview a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-light);
  padding: 11px 4px;
  color: var(--text-primary);
  text-decoration: none;
}
.notice-preview a span {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.notice-preview a b {
  flex: none;
  border-radius: 6px;
  padding: 3px 6px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: var(--font-size-caption);
}
.notice-preview a strong {
  overflow: hidden;
  font-size: var(--font-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-preview a small {
  flex: none;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.card-empty {
  padding: 24px;
  color: var(--text-muted);
  text-align: center;
}
.up,
.bullish {
  color: var(--stock-up) !important;
}
.down,
.bearish {
  color: var(--stock-down) !important;
}
.neutral {
  color: #e8a317;
}
@media (max-width: 980px) {
  .analysis-grid {
    grid-template-columns: 1fr;
  }
  .candle-inspector,
  .metric-grid,
  .quality-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 520px) {
  .workspace-card {
    padding: 15px;
  }
  .chart-controls {
    align-items: flex-end;
    flex-direction: column;
  }
  .signal-list {
    grid-template-columns: 1fr;
  }
  .score-row {
    grid-template-columns: 84px 1fr;
  }
  .score-ring {
    width: 78px;
    height: 78px;
  }
  .score-ring::before {
    width: 60px;
    height: 60px;
  }
}
</style>
