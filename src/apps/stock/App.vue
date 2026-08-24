<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import StockChart from './components/StockChart.vue'
import ResearchLineChart, { type ResearchSeries } from './components/ResearchLineChart.vue'
import { useStockStore, type KlineData, type PriceAlert } from '@/stores/stock'
import { STOCK_COLORS } from './config'
import { debounce } from '@/utils'
import { formatLargeNumber } from './research'
import {
  correlation,
  normalizePerformance,
  portfolioTotals,
  runMaBacktest,
  type BacktestResult,
  type CompareSeries,
} from './portfolio'
import { buildResearchDecision, extractNoticeSignals, type DecisionSummary } from './decision'
import { useToast } from '@/composables/useToast'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

defineOptions({ name: 'StockResearchWorkspace' })

type ResearchPanel =
  | 'overview'
  | 'portfolio'
  | 'compare'
  | 'backtest'
  | 'financials'
  | 'notices'
  | 'journal'
type KlinePeriod = 'day' | 'week' | 'month'

const router = useRouter()
const stock = useStockStore()
const { addToast } = useToast()

const activePanel = ref<ResearchPanel>('overview')
const activePeriod = ref<KlinePeriod>('day')
const activeKline = ref<KlineData | null>(null)
const noteDraft = ref('')
const alertDirection = ref<PriceAlert['direction']>('above')
const alertTarget = ref<number | null>(null)
const positionShares = ref<number | null>(null)
const positionCost = ref<number | null>(null)
const compareSelection = ref<string[]>([])
const compareSeries = ref<CompareSeries[]>([])
const compareCorrelation = ref<Record<string, number | null>>({})
const compareLoading = ref(false)
const backtestShort = ref(5)
const backtestLong = ref(20)
const backtestCapital = ref(100_000)
const backtestResult = ref<BacktestResult | null>(null)
let portfolioRefreshTimer: ReturnType<typeof setInterval> | null = null

const quote = computed(() => stock.researchSummary)
const currentPrice = computed(() => quote.value?.price ?? Number(stock.result?.close || 0))
const changePercent = computed(() => quote.value?.changePercent ?? 0)
const isUp = computed(() => changePercent.value >= 0)
const displayKline = computed(() => activeKline.value ?? stock.klineResult)
const latestFinancial = computed(() => stock.financials[0] ?? null)
const currentAlerts = computed(() => stock.alerts.filter((item) => item.code === stock.stockCode))
const portfolioSummary = computed(() => portfolioTotals(stock.portfolioPositionMetrics))
const compareCandidates = computed(() => {
  const items = [...stock.favorites, ...stock.recentStocks, ...stock.positions]
  return [...new Map(items.map((item) => [item.code, { code: item.code, name: item.name }])).values()]
})
const latestNoticeSignals = computed(() => extractNoticeSignals(stock.notices))

const researchDecision = computed<DecisionSummary>(() =>
  buildResearchDecision({
    technical: stock.technicalSnapshot,
    valuation: quote.value,
    financial: latestFinancial.value,
    technicalPrice: currentPrice.value,
    technicalVolatility: stock.technicalSnapshot?.volatility20 ?? null,
    support: stock.technicalSnapshot?.support ?? null,
    resistance: stock.technicalSnapshot?.resistance ?? null,
    notices: latestNoticeSignals.value,
    klineLength: stock.klineChartData.length,
    financialCount: stock.financials.length,
  }),
)

const compareChartSeries = computed<ResearchSeries[]>(() => {
  const colors = ['#0f766e', '#7c3aed', '#dc2626', '#d97706']
  return compareSeries.value.map((item, index) => ({
    name: item.name,
    color: colors[index % colors.length],
    points: item.points,
  }))
})
const financialChartSeries = computed<ResearchSeries[]>(() => {
  const rows = [...stock.financials].reverse()
  return [
    {
      name: '营业收入（亿）',
      color: '#0f766e',
      points: rows
        .filter((item) => item.revenue != null)
        .map((item) => ({ date: item.reportDate, value: Number((item.revenue! / 1e8).toFixed(2)) })),
    },
    {
      name: '归母净利润（亿）',
      color: '#7c3aed',
      points: rows
        .filter((item) => item.netProfit != null)
        .map((item) => ({ date: item.reportDate, value: Number((item.netProfit! / 1e8).toFixed(2)) })),
    },
  ]
})
const backtestChartSeries = computed<ResearchSeries[]>(() =>
  backtestResult.value
    ? [{ name: '策略权益', color: '#0f766e', points: backtestResult.value.equity }]
    : [],
)
const panelItems: Array<{ id: ResearchPanel; label: string; count?: () => number }> = [
  { id: 'overview', label: '行情研判' },
  { id: 'portfolio', label: '模拟持仓', count: () => stock.positions.length },
  { id: 'compare', label: '股票对比', count: () => compareSelection.value.length },
  { id: 'backtest', label: '策略回测' },
  { id: 'financials', label: '财务质量', count: () => stock.financials.length },
  { id: 'notices', label: '公司公告', count: () => stock.notices.length },
  { id: 'journal', label: '研究笔记', count: () => currentAlerts.value.length },
]

const debouncedSearch = debounce(() => {
  if (stock.searchQuery.trim()) stock.searchStocks(stock.searchQuery)
  else stock.clearSearch()
}, 260)

function formatPrice(value: number | string | null | undefined, digits = 2) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '--'
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function hideSearchResults() {
  window.setTimeout(() => {
    stock.showSearchResults = false
  }, 160)
}

async function openStock(code: string) {
  activeKline.value = null
  activePanel.value = 'overview'
  await stock.loadStock(code, activePeriod.value, 250)
  noteDraft.value = stock.getResearchNote(code)
  if (stock.result) alertTarget.value = Number(stock.result.close)
}

async function chooseSearchResult(item: { code: string; name: string; market: string }) {
  stock.searchQuery = ''
  stock.searchResults = []
  stock.showSearchResults = false
  await openStock(item.code)
}

async function runSearch() {
  const raw = stock.searchQuery.trim()
  if (/^\d{6}$/.test(raw)) {
    await openStock(raw)
    stock.searchQuery = ''
    return
  }
  if (stock.searchResults[0]) await chooseSearchResult(stock.searchResults[0])
}

async function changePeriod(period: KlinePeriod) {
  activePeriod.value = period
  activeKline.value = null
  if (stock.stockCode) await openStock(stock.stockCode)
}

async function queryByDate(date: Date | null) {
  if (!date || !stock.stockCode) return
  stock.selectedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  await stock.queryStockByDate()
  activeKline.value = stock.klineResult
}

function onCandleClick(data: KlineData) {
  activeKline.value = data
}

function onWatchlistDrag() {
  stock.reorderFavorites(stock.favoritesData.map((item) => ({ code: item.code, name: item.name })))
}

function saveNote() {
  if (!stock.stockCode) return
  stock.setResearchNote(stock.stockCode, noteDraft.value)
  addToast('success', '研究笔记已保存')
}

function createAlert() {
  if (!stock.result || !alertTarget.value || alertTarget.value <= 0) return
  stock.addAlert({
    code: stock.stockCode,
    name: stock.result.name,
    direction: alertDirection.value,
    target: alertTarget.value,
  })
  addToast('success', '价格提醒已创建，将在刷新行情时检查')
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
  addToast('success', '模拟持仓已保存')
}

function toggleCompare(code: string) {
  if (compareSelection.value.includes(code)) {
    compareSelection.value = compareSelection.value.filter((item) => item !== code)
    return
  }
  if (compareSelection.value.length >= 4) {
    addToast('warning', '最多同时对比 4 只股票')
    return
  }
  compareSelection.value.push(code)
}

async function runComparison() {
  if (compareSelection.value.length < 2) {
    addToast('warning', '请至少选择 2 只股票')
    return
  }
  compareLoading.value = true
  try {
    const rows = await Promise.all(
      compareSelection.value.map(async (code) => ({
        code,
        data: await stock.fetchKlineData(code, 'day', 250),
      })),
    )
    compareSeries.value = rows.map((row) => {
      const item = compareCandidates.value.find((candidate) => candidate.code === row.code)
      return normalizePerformance(row.code, item?.name || row.code, row.data)
    })
    const base = rows[0]
    compareCorrelation.value = Object.fromEntries(
      rows.slice(1).map((row) => [row.code, correlation(base.data, row.data)]),
    )
  } catch (error) {
    addToast('error', error instanceof Error ? error.message : '股票对比加载失败')
  } finally {
    compareLoading.value = false
  }
}

function runBacktest() {
  try {
    backtestResult.value = runMaBacktest(
      stock.klineChartData,
      Number(backtestShort.value),
      Number(backtestLong.value),
      Number(backtestCapital.value),
    )
  } catch (error) {
    addToast('error', error instanceof Error ? error.message : '回测失败')
  }
}

async function copyResearchCard() {
  if (!stock.result) return
  const tech = stock.technicalSnapshot
  const decision = researchDecision.value
  const summary = [
    `${stock.result.name}（${stock.formattedCode}）`,
    `现价：${formatPrice(currentPrice.value)}，涨跌：${formatPercent(changePercent.value)}`,
    tech ? `技术状态：${tech.trendLabel}（${tech.score}/100）` : '',
    tech?.support ? `20日支撑/压力：${tech.support} / ${tech.resistance}` : '',
    latestFinancial.value
      ? `最新财报：营收同比 ${formatPercent(latestFinancial.value.revenueGrowth)}，ROE ${formatPercent(latestFinancial.value.roe)}`
      : '',
    `综合研判：${decision.label}（${decision.score}/100）`,
    `置信度：${decision.confidence}`,
    `数据覆盖率：${decision.dataCoverage}%`,
    decision.missingData.length ? `缺失项：${decision.missingData.join('；')}` : '',
    decision.highlights.length ? `利好要点：${decision.highlights.join('；')}` : '',
    decision.watchItems.length ? `关键触发：${decision.watchItems.join('；')}` : '',
    decision.risks.length ? `风险提示：${decision.risks.join('；')}` : '',
    '数据仅供研究记录，不构成投资建议。',
  ]
    .filter(Boolean)
    .join('\n')
  await navigator.clipboard.writeText(summary)
  addToast('success', '研究卡片已复制')
}

onMounted(() => {
  void Promise.all([stock.fetchMarketOverview(), stock.fetchFavoritesData(), stock.fetchPortfolioData()])
  portfolioRefreshTimer = setInterval(() => void stock.fetchPortfolioData(), 60_000)
})
onUnmounted(() => {
  if (portfolioRefreshTimer) clearInterval(portfolioRefreshTimer)
})
</script>

<template>
  <div
    class="research-page"
    :style="{ '--stock-up': STOCK_COLORS.UP, '--stock-down': STOCK_COLORS.DOWN }"
  >
    <div class="page-glow" aria-hidden="true"><i></i><i></i></div>

    <header class="research-header">
      <div class="header-brand">
        <button type="button" class="back-button" aria-label="返回工作台" @click="router.push('/')">
          ←
        </button>
        <span class="brand-mark">R</span>
        <span>
          <strong>股票研究工作台</strong>
          <small>行情 · 财务 · 公告 · 复盘</small>
        </span>
      </div>
      <div class="header-actions">
        <span class="source-state"><i></i> 腾讯行情 · 东方财富研究数据</span>
        <button type="button" @click="router.push('/stock/knowledge')">知识中心</button>
      </div>
    </header>

    <section class="market-pulse" aria-label="大盘概览">
      <div class="pulse-label">
        <strong>今日大盘</strong>
      </div>
      <div v-if="stock.marketOverview.length" class="index-list">
        <article v-for="item in stock.marketOverview" :key="item.code">
          <span>{{ item.name }}</span>
          <strong>{{ formatPrice(item.price) }}</strong>
          <b :class="Number(item.changePercent) >= 0 ? 'up' : 'down'">
            {{ formatPercent(item.changePercent) }}
          </b>
        </article>
      </div>
      <div v-else class="index-skeleton"><i></i><i></i><i></i></div>
      <small>数据有延迟，仅供研究</small>
    </section>

    <main class="research-shell">
      <aside class="research-sidebar">
        <section class="search-card">
          <h2>股票查询</h2>
          <p>输入名称或 6 位代码</p>
          <div class="stock-search">
            <span>⌕</span>
            <input
              v-model="stock.searchQuery"
              type="search"
              placeholder="贵州茅台 / 600519"
              aria-label="搜索股票"
              @input="debouncedSearch"
              @focus="stock.showSearchResults = true"
              @blur="hideSearchResults"
              @keydown.enter.prevent="runSearch"
            />
            <button type="button" :disabled="stock.isSearching" @mousedown.prevent="runSearch">
              {{ stock.isSearching ? '···' : '查询' }}
            </button>
          </div>
          <div v-if="stock.showSearchResults && stock.searchResults.length" class="search-results">
            <button
              v-for="item in stock.searchResults"
              :key="`${item.market}-${item.code}`"
              type="button"
              @mousedown.prevent="chooseSearchResult(item)"
            >
              <span
                ><strong>{{ item.name }}</strong
                ><small>{{ item.code }}</small></span
              >
              <b>{{ item.market === 'sh' ? '沪' : '深' }}</b>
            </button>
          </div>
        </section>

        <section v-if="stock.recentStocks.length" class="sidebar-card recent-card">
          <div class="sidebar-heading">
            <strong>最近研究</strong><small>{{ stock.recentStocks.length }}</small>
          </div>
          <div class="recent-list">
            <button
              v-for="item in stock.recentStocks"
              :key="item.code"
              type="button"
              :class="{ active: stock.stockCode === item.code }"
              @click="openStock(item.code)"
            >
              <span>{{ item.name }}</span
              ><small>{{ item.code }}</small>
            </button>
          </div>
        </section>

        <section class="sidebar-card watchlist-card">
          <div class="sidebar-heading">
            <strong>自选观察</strong>
            <button type="button" title="刷新自选行情" @click="stock.fetchFavoritesData()">
              ↻
            </button>
          </div>
          <div v-if="stock.isFavoritesLoading" class="watch-loading">正在刷新行情…</div>
          <draggable
            v-else-if="stock.favoritesData.length"
            v-model="stock.favoritesData"
            item-key="code"
            class="watch-list"
            ghost-class="watch-ghost"
            @end="onWatchlistDrag"
          >
            <template #item="{ element: item }">
              <article
                :class="{ active: stock.stockCode === item.code }"
                @click="openStock(item.code)"
              >
                <span class="drag-handle" title="拖动排序">⠿</span>
                <span class="watch-name"
                  ><strong>{{ item.name }}</strong
                  ><small>{{ item.code }}</small></span
                >
                <span class="watch-price">
                  <strong>{{ formatPrice(item.price) }}</strong>
                  <small :class="Number(item.changePercent) >= 0 ? 'up' : 'down'">
                    {{ formatPercent(Number(item.changePercent)) }}
                  </small>
                </span>
                <button
                  type="button"
                  aria-label="移出自选"
                  @click.stop="stock.removeFavorite(item.code)"
                >
                  ×
                </button>
              </article>
            </template>
          </draggable>
          <div v-else class="watch-empty">
            <span>☆</span>
            <p>研究股票后加入自选，持续观察变化。</p>
          </div>
        </section>
      </aside>

      <section class="research-content">
        <div v-if="stock.error" class="status-banner error">
          <span>!</span>
          <p>{{ stock.error }}</p>
          <button @click="stock.error = ''">×</button>
        </div>

        <div v-if="!stock.result && !stock.isLoading" class="welcome-state compact-empty">
          <div class="empty-heading">
            <h2>未选择股票</h2>
            <p>从左侧搜索股票名称或代码。</p>
          </div>
          <div class="empty-feature-grid">
            <article><strong>价格趋势</strong><small>K 线、成交量与均线</small></article>
            <article><strong>技术指标</strong><small>RSI、MACD 与区间位置</small></article>
            <article><strong>财务指标</strong><small>营收、利润与盈利质量</small></article>
            <article><strong>公告记录</strong><small>公司正式披露信息</small></article>
          </div>
          <div v-if="stock.recentStocks.length" class="quick-start">
            <strong>最近研究</strong>
            <button
              v-for="item in stock.recentStocks.slice(0, 4)"
              :key="item.code"
              @click="openStock(item.code)"
            >
              {{ item.name }} <small>{{ item.code }}</small>
            </button>
          </div>
        </div>

        <div v-else-if="stock.isLoading && !stock.result" class="research-loading">
          <span></span><strong>正在加载研究数据</strong>
          <p>行情、K 线、财务和公告</p>
        </div>

        <template v-else-if="stock.result">
          <section class="quote-hero">
            <div class="quote-identity">
              <div class="ticker-badge">{{ stock.result.name.slice(0, 1) }}</div>
              <div>
                <span class="quote-code">{{ stock.formattedCode.toUpperCase() }}</span>
                <h1>{{ stock.result.name }}</h1>
                <small>{{ stock.result.date }} · 最近更新</small>
              </div>
            </div>
            <div class="quote-price" :class="isUp ? 'up' : 'down'">
              <span>¥</span><strong>{{ formatPrice(currentPrice) }}</strong>
              <b>{{ formatPercent(changePercent) }}</b>
            </div>
            <div class="quote-range">
              <span
                ><small>今开</small
                ><strong>{{ formatPrice(quote?.open ?? stock.result.open) }}</strong></span
              >
              <span
                ><small>最高</small
                ><strong>{{ formatPrice(quote?.high ?? stock.result.high) }}</strong></span
              >
              <span
                ><small>最低</small
                ><strong>{{ formatPrice(quote?.low ?? stock.result.low) }}</strong></span
              >
              <span
                ><small>成交额</small><strong>{{ formatLargeNumber(quote?.amount) }}</strong></span
              >
            </div>
            <div class="quote-actions">
              <button
                type="button"
                :class="{ active: stock.isFavorite(stock.stockCode) }"
                @click="stock.toggleFavorite()"
              >
                {{ stock.isFavorite(stock.stockCode) ? '★ 已自选' : '☆ 加入自选' }}
              </button>
              <button type="button" @click="copyResearchCard">复制研究卡片</button>
            </div>
          </section>

          <nav class="research-tabs" aria-label="研究视图">
            <button
              v-for="item in panelItems"
              :key="item.id"
              type="button"
              :class="{ active: activePanel === item.id }"
              @click="activePanel = item.id"
            >
              {{ item.label }} <small v-if="item.count">{{ item.count() }}</small>
            </button>
          </nav>

          <section v-if="activePanel === 'overview'" class="panel-stack">
            <article class="workspace-card chart-card">
              <header class="card-header">
                <div><h2>价格趋势</h2></div>
                <div class="chart-controls">
                  <div class="period-switch">
                    <button
                      v-for="period in ['day', 'week', 'month'] as KlinePeriod[]"
                      :key="period"
                      :class="{ active: activePeriod === period }"
                      @click="changePeriod(period)"
                    >
                      {{ period === 'day' ? '日线' : period === 'week' ? '周线' : '月线' }}
                    </button>
                  </div>
                  <VueDatePicker
                    :model-value="null"
                    :enable-time-picker="false"
                    :max-date="new Date()"
                    placeholder="定位交易日"
                    auto-apply
                    :clearable="false"
                    @update:model-value="queryByDate"
                  />
                </div>
              </header>
              <StockChart
                :data="stock.klineChartData"
                :selected-date="activeKline?.date || ''"
                @candle-click="onCandleClick"
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
                    >{{ formatPrice(displayKline.high) }} /
                    {{ formatPrice(displayKline.low) }}</strong
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
                  <span class="decision-badge" :class="researchDecision.tone">{{ researchDecision.label }}</span>
                </header>
                <div class="decision-score">
                  <strong>{{ researchDecision.score }}</strong><span>/100</span>
                  <small>置信度 {{ researchDecision.confidence }}</small>
                </div>
                <div class="decision-metrics">
                  <span>数据覆盖率：{{ researchDecision.dataCoverage }}%</span>
                  <span v-if="researchDecision.missingData.length">
                    缺失项：{{ researchDecision.missingData.join(' · ') }}
                  </span>
                </div>
                <div v-if="researchDecision.highlights.length" class="decision-highlights">
                  <span v-for="item in researchDecision.highlights" :key="`h-${item}`">{{ item }}</span>
                </div>
                <div v-if="researchDecision.watchItems.length" class="decision-block">
                  <h3>关键触发</h3>
                  <ul>
                    <li v-for="item in researchDecision.watchItems" :key="`w-${item}`">{{ item }}</li>
                  </ul>
                </div>
                <div v-if="researchDecision.risks.length" class="decision-block">
                  <h3>风险提示</h3>
                  <ul>
                    <li v-for="item in researchDecision.risks" :key="`r-${item}`">{{ item }}</li>
                  </ul>
                </div>
                <p class="decision-action">{{ researchDecision.action }}</p>
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
                    ><small>换手率</small
                    ><strong>{{ formatPercent(quote?.turnover) }}</strong></span
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
                    ><small>20 日动量</small
                    ><strong>{{ formatPercent(stock.technicalSnapshot?.momentum20) }}</strong></span
                  >
                  <span
                    ><small>年化波动</small
                    ><strong>{{
                      formatPercent(stock.technicalSnapshot?.volatility20)
                    }}</strong></span
                  >
                </div>
                <div v-if="stock.technicalSnapshot" class="support-bar">
                  <span
                    ><small>20 日支撑</small
                    ><strong>{{ formatPrice(stock.technicalSnapshot.support) }}</strong></span
                  >
                  <i></i>
                  <span
                    ><small>20 日压力</small
                    ><strong>{{ formatPrice(stock.technicalSnapshot.resistance) }}</strong></span
                  >
                </div>
              </article>

              <article v-if="latestFinancial" class="workspace-card finance-preview">
                <header class="card-header">
                  <div><h2>财务质量</h2></div>
                  <button @click="activePanel = 'financials'">查看全部 →</button>
                </header>
                <div class="report-title">
                  <strong>{{ latestFinancial.reportName }}</strong
                  ><small>{{ latestFinancial.reportDate }}</small>
                </div>
                <div class="quality-grid">
                  <span
                    ><small>营业收入</small
                    ><strong>{{ formatLargeNumber(latestFinancial.revenue) }}</strong
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
                    ><small>ROE</small
                    ><strong>{{ formatPercent(latestFinancial.roe) }}</strong></span
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
                  <button @click="activePanel = 'notices'">查看全部 →</button>
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

          <section v-else-if="activePanel === 'portfolio'" class="portfolio-panel">
            <div class="portfolio-summary-grid">
              <article><small>模拟总成本</small><strong>{{ formatLargeNumber(portfolioSummary.cost) }}</strong></article>
              <article><small>当前市值</small><strong>{{ formatLargeNumber(portfolioSummary.marketValue) }}</strong></article>
              <article :class="portfolioSummary.profit >= 0 ? 'up' : 'down'"><small>浮动盈亏</small><strong>{{ formatLargeNumber(portfolioSummary.profit) }}</strong><b>{{ formatPercent(portfolioSummary.profitPercent) }}</b></article>
              <article><small>已获取行情</small><strong>{{ portfolioSummary.priced }}/{{ stock.positions.length }}</strong></article>
            </div>
            <div class="portfolio-layout">
              <article class="workspace-card position-form-card">
                <header class="card-header"><div><h2>记录模拟持仓</h2><p>{{ stock.result.name }} · {{ stock.stockCode }}</p></div></header>
                <label><span>持有数量</span><input v-model.number="positionShares" type="number" min="1" step="100" placeholder="100" /></label>
                <label><span>成本价</span><input v-model.number="positionCost" type="number" min="0.01" step="0.01" :placeholder="formatPrice(currentPrice)" /></label>
                <button type="button" :disabled="!positionShares || !positionCost" @click="savePosition">保存持仓</button>
                <p>仅保存在本机，用于研究和复盘，不连接交易账户。</p>
              </article>
              <article class="workspace-card position-list-card">
                <header class="card-header"><div><h2>持仓明细</h2></div><button @click="stock.fetchPortfolioData">刷新行情</button></header>
                <div v-if="stock.portfolioPositionMetrics.length" class="position-table-wrap">
                  <table class="position-table">
                    <thead><tr><th>股票</th><th>数量</th><th>成本价</th><th>现价</th><th>市值</th><th>盈亏</th><th></th></tr></thead>
                    <tbody><tr v-for="item in stock.portfolioPositionMetrics" :key="item.id">
                      <td><strong>{{ item.name }}</strong><small>{{ item.code }}</small></td><td>{{ item.shares.toLocaleString() }}</td><td>{{ formatPrice(item.costPrice) }}</td><td>{{ formatPrice(item.currentPrice) }}</td><td>{{ formatLargeNumber(item.marketValue) }}</td><td :class="Number(item.profit) >= 0 ? 'up' : 'down'"><strong>{{ formatLargeNumber(item.profit) }}</strong><small>{{ formatPercent(item.profitPercent) }}</small></td><td><button aria-label="删除持仓" @click="stock.removePosition(item.id)">×</button></td>
                    </tr></tbody>
                  </table>
                </div>
                <div v-else class="panel-empty small">还没有模拟持仓</div>
              </article>
            </div>
          </section>

          <section v-else-if="activePanel === 'compare'" class="workspace-card full-panel compare-panel">
            <header class="panel-heading"><div><h2>多股票对比</h2><p>将最近 250 个交易日归一化为 100，比较收益、波动与相关性。</p></div><button :disabled="compareLoading || compareSelection.length < 2" @click="runComparison">{{ compareLoading ? '加载中…' : '开始对比' }}</button></header>
            <div class="compare-picker"><button v-for="item in compareCandidates" :key="item.code" :class="{ active: compareSelection.includes(item.code) }" @click="toggleCompare(item.code)"><strong>{{ item.name }}</strong><small>{{ item.code }}</small></button></div>
            <ResearchLineChart v-if="compareChartSeries.length" :series="compareChartSeries" :height="330" />
            <div v-if="compareSeries.length" class="compare-metrics"><article v-for="(item, index) in compareSeries" :key="item.code"><i :style="{ background: compareChartSeries[index]?.color }"></i><span><strong>{{ item.name }}</strong><small>{{ item.code }}</small></span><span><small>区间收益</small><b :class="item.changePercent >= 0 ? 'up' : 'down'">{{ formatPercent(item.changePercent) }}</b></span><span><small>年化波动</small><b>{{ formatPercent(item.volatility) }}</b></span><span v-if="index > 0"><small>与 {{ compareSeries[0].name }} 相关性</small><b>{{ compareCorrelation[item.code] ?? '--' }}</b></span></article></div>
            <div v-else class="panel-empty">选择 2–4 只自选或最近研究的股票</div>
          </section>

          <section v-else-if="activePanel === 'backtest'" class="workspace-card full-panel backtest-panel">
            <header class="panel-heading"><div><h2>均线策略回测</h2><p>短均线上穿长均线买入、下穿卖出，含双边 0.03% 费用。</p></div></header>
            <div class="backtest-form"><label><span>短均线</span><input v-model.number="backtestShort" type="number" min="2" max="60" /></label><label><span>长均线</span><input v-model.number="backtestLong" type="number" min="3" max="120" /></label><label><span>初始资金</span><input v-model.number="backtestCapital" type="number" min="1000" step="1000" /></label><button @click="runBacktest">运行回测</button></div>
            <template v-if="backtestResult"><div class="backtest-metrics"><article><small>策略收益</small><strong :class="backtestResult.totalReturn >= 0 ? 'up' : 'down'">{{ formatPercent(backtestResult.totalReturn) }}</strong></article><article><small>同期持有</small><strong :class="backtestResult.benchmarkReturn >= 0 ? 'up' : 'down'">{{ formatPercent(backtestResult.benchmarkReturn) }}</strong></article><article><small>最大回撤</small><strong class="down">{{ formatPercent(backtestResult.maxDrawdown) }}</strong></article><article><small>交易胜率</small><strong>{{ formatPercent(backtestResult.winRate) }}</strong></article><article><small>交易次数</small><strong>{{ backtestResult.trades.length }}</strong></article></div><ResearchLineChart :series="backtestChartSeries" :height="300" /><div class="trade-list"><div v-for="trade in backtestResult.trades.slice().reverse().slice(0, 12)" :key="`${trade.buyDate}-${trade.sellDate}`"><span><small>买入</small><strong>{{ trade.buyDate }} · ¥{{ formatPrice(trade.buyPrice) }}</strong></span><span><small>卖出</small><strong>{{ trade.sellDate }} · ¥{{ formatPrice(trade.sellPrice) }}</strong></span><b :class="trade.returnPercent >= 0 ? 'up' : 'down'">{{ formatPercent(trade.returnPercent) }}</b></div></div></template>
            <div v-else class="panel-empty">使用当前股票已加载的 K 线进行回测</div>
            <p class="backtest-note">回测仅验证历史规则表现，不代表未来收益；未计入滑点、涨跌停和无法成交等现实约束。</p>
          </section>

          <section v-else-if="activePanel === 'financials'" class="workspace-card full-panel">
            <header class="panel-heading">
              <div>
                <h2>财务指标时间线</h2>
                <p>对比营收、利润、盈利能力与偿债结构的变化。</p>
              </div>
              <span>数据源：东方财富</span>
            </header>
            <ResearchLineChart v-if="financialChartSeries.some((item) => item.points.length)" :series="financialChartSeries" :height="280" />
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
                  <tr
                    v-for="item in stock.financials"
                    :key="`${item.reportDate}-${item.reportName}`"
                  >
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

          <section v-else-if="activePanel === 'notices'" class="workspace-card full-panel">
            <header class="panel-heading">
              <div>
                <h2>公司公告</h2>
                <p>优先阅读财报、业绩预告、重大事项和治理变化。</p>
              </div>
              <span>{{ stock.notices.length }} 条</span>
            </header>
            <div v-if="stock.notices.length" class="notice-list">
              <a
                v-for="notice in stock.notices"
                :key="notice.id"
                :href="notice.url"
                target="_blank"
                rel="noreferrer"
              >
                <time>{{ notice.date }}</time
                ><b>{{ notice.category }}</b
                ><strong>{{ notice.title }}</strong
                ><span>打开原文 ↗</span>
              </a>
            </div>
            <div v-else class="panel-empty">暂无公告数据</div>
          </section>

          <section v-else class="journal-grid">
            <article class="workspace-card note-card">
              <header class="card-header">
                <div><h2>研究笔记</h2></div>
                <button @click="saveNote">保存笔记</button>
              </header>
              <textarea
                v-model="noteDraft"
                rows="16"
                placeholder="记录投资逻辑、关键假设、证伪条件、计划观察的指标……"
              ></textarea>
              <p>建议写下“为什么关注”和“什么情况说明判断错了”，方便日后复盘。</p>
            </article>
            <article class="workspace-card alert-card">
              <header class="card-header">
                <div><h2>价格提醒</h2></div>
              </header>
              <div class="alert-form">
                <select v-model="alertDirection">
                  <option value="above">价格高于</option>
                  <option value="below">价格低于</option>
                </select>
                <input v-model.number="alertTarget" type="number" min="0.01" step="0.01" />
                <button @click="createAlert">创建提醒</button>
              </div>
              <div v-if="currentAlerts.length" class="alert-list">
                <div
                  v-for="alert in currentAlerts"
                  :key="alert.id"
                  :class="{ triggered: alert.triggeredAt, disabled: !alert.enabled }"
                >
                  <button class="alert-toggle" @click="stock.toggleAlert(alert.id)"><i></i></button>
                  <span
                    ><strong
                      >{{ alert.direction === 'above' ? '突破' : '跌破' }} ¥{{
                        formatPrice(alert.target)
                      }}</strong
                    ><small>{{
                      alert.triggeredAt
                        ? `已于 ${new Date(alert.triggeredAt).toLocaleString()} 触发`
                        : alert.enabled
                          ? '等待刷新行情时检查'
                          : '已暂停'
                    }}</small></span
                  >
                  <button class="alert-remove" @click="stock.removeAlert(alert.id)">×</button>
                </div>
              </div>
              <div v-else class="panel-empty small">还没有价格提醒</div>
            </article>
          </section>

          <p v-if="stock.researchError" class="research-source-error">{{ stock.researchError }}</p>
          <footer class="research-disclaimer">
            技术指标与财务数据仅用于学习和研究记录，不构成任何投资建议。行情可能存在延迟，请以交易所与上市公司正式披露为准。
          </footer>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.research-page {
  position: relative;
  min-height: 100%;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-page) 96%, #0f766e 4%),
    var(--bg-page)
  );
  color: var(--text-primary);
}

.page-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.page-glow i {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  filter: blur(2px);
  opacity: 0.17;
}
.page-glow i:first-child {
  right: -220px;
  top: -260px;
  background: radial-gradient(circle, #14b8a6, transparent 68%);
}
.page-glow i:last-child {
  left: -280px;
  bottom: -320px;
  background: radial-gradient(circle, #6366f1, transparent 68%);
}

.research-header,
.market-pulse,
.research-shell {
  position: relative;
  z-index: 1;
  width: min(1500px, calc(100% - 40px));
  margin-inline: auto;
}

.research-header {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--border-light);
}
.header-brand,
.header-actions,
.quote-identity,
.quote-actions {
  display: flex;
  align-items: center;
}
.header-brand {
  gap: 11px;
}
.back-button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
}
.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: #fff;
  font-weight: 900;
  box-shadow: 0 8px 24px rgba(15, 118, 110, 0.25);
}
.header-brand > span:last-child {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.header-brand strong {
  font-size: 18px;
  letter-spacing: -0.02em;
}
.header-brand small {
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.08em;
  margin-top: 4px;
}
.header-actions {
  gap: 10px;
}
.header-actions button {
  padding: 9px 14px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
}
.source-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
}
.source-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #14b8a6;
  box-shadow: 0 0 0 5px rgba(20, 184, 166, 0.12);
}

.market-pulse {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  margin-top: 16px;
  padding: 14px 18px;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-card) 90%, transparent);
  box-shadow: var(--shadow-sm);
}
.pulse-label {
  display: flex;
  flex-direction: column;
}
.pulse-label span,
.section-eyebrow {
  color: #0f766e;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
}
.pulse-label strong {
  font-size: 14px;
}
.index-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.index-list article {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 5px 12px;
  border-left: 1px solid var(--border-light);
}
.index-list span {
  color: var(--text-secondary);
  font-size: 12px;
}
.index-list strong {
  font-size: 16px;
}
.index-list b {
  font-size: 12px;
}
.market-pulse > small {
  color: var(--text-muted);
  font-size: 10px;
}
.index-skeleton {
  display: flex;
  gap: 12px;
}
.index-skeleton i {
  width: 25%;
  height: 22px;
  border-radius: 8px;
  background: var(--bg-subtle);
  animation: pulse 1s infinite alternate;
}

.research-shell {
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  gap: 18px;
  padding: 18px 0 44px;
}
.research-sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.search-card,
.sidebar-card,
.workspace-card,
.quote-hero,
.welcome-state,
.research-loading {
  border: 1px solid var(--border-light);
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 10px 36px rgba(15, 23, 42, 0.055);
}
.search-card,
.sidebar-card {
  border-radius: 18px;
  padding: 18px;
}
.search-card h2 {
  margin: 4px 0 1px;
  font-size: 19px;
}
.search-card > p {
  color: var(--text-secondary);
  font-size: 12px;
}
.stock-search {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 5px 5px 5px 11px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-page);
}
.stock-search > span {
  color: #0f766e;
  font-size: 20px;
}
.stock-search input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
}
.stock-search button {
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: #fff;
  cursor: pointer;
  font-weight: 800;
}
.search-results {
  position: absolute;
  z-index: 20;
  width: 250px;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
}
.search-results button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.search-results button:hover {
  background: var(--bg-hover);
}
.search-results button span {
  display: flex;
  flex-direction: column;
}
.search-results small {
  color: var(--text-muted);
}
.search-results b {
  color: #0f766e;
}
.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sidebar-heading > strong {
  font-size: 14px;
}
.sidebar-heading > small {
  color: var(--text-muted);
}
.sidebar-heading > button {
  border: 0;
  background: transparent;
  color: #0f766e;
  cursor: pointer;
  font-size: 17px;
}
.recent-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.recent-list button {
  padding: 7px 9px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
}
.recent-list button.active {
  border-color: #0f766e;
  background: color-mix(in srgb, #0f766e 10%, var(--bg-card));
}
.recent-list small {
  color: var(--text-muted);
  margin-left: 4px;
}
.watch-list {
  display: grid;
  gap: 6px;
}
.watch-list article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 10px 7px;
  border-radius: 11px;
  cursor: pointer;
}
.watch-list article:hover,
.watch-list article.active {
  background: var(--bg-hover);
}
.drag-handle {
  color: var(--text-muted);
  cursor: grab;
}
.watch-name,
.watch-price {
  display: flex;
  flex-direction: column;
}
.watch-name small,
.watch-price small {
  color: var(--text-muted);
  font-size: 10px;
}
.watch-price {
  text-align: right;
}
.watch-price strong {
  font-size: 13px;
}
.watch-list article > button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.watch-ghost {
  opacity: 0.35;
}
.watch-empty,
.watch-loading {
  padding: 18px 4px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
.watch-empty span {
  font-size: 25px;
}

.research-content {
  min-width: 0;
}
.status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 11px 13px;
  border-radius: 12px;
}
.status-banner.error {
  border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent);
  background: var(--danger-bg);
  color: var(--danger);
}
.status-banner p {
  flex: 1;
}
.status-banner button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.welcome-state {
  min-height: 650px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  align-items: center;
  gap: 40px;
  padding: 60px;
  border-radius: 26px;
  overflow: hidden;
}
.welcome-copy h1 {
  margin: 12px 0 18px;
  font-size: clamp(36px, 4.5vw, 68px);
  line-height: 1.05;
  letter-spacing: -0.05em;
}
.welcome-copy p {
  max-width: 650px;
  color: var(--text-secondary);
  line-height: 1.9;
}
.welcome-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}
.welcome-chips span {
  padding: 7px 10px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11px;
}
.welcome-state.compact-empty {
  min-height: 520px;
  grid-template-columns: 1fr;
  align-content: center;
  padding: 54px;
}
.empty-heading h2 {
  font-size: 28px;
  letter-spacing: -0.03em;
}
.empty-heading p {
  margin-top: 4px;
  color: var(--text-secondary);
}
.empty-feature-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.empty-feature-grid article {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  justify-content: flex-end;
  padding: 16px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--bg-subtle);
}
.empty-feature-grid small {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 10px;
}
.research-map {
  position: relative;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(15, 118, 110, 0.15), transparent 60%);
}
.research-map::before,
.research-map::after {
  position: absolute;
  inset: 45px;
  border: 1px dashed rgba(15, 118, 110, 0.28);
  border-radius: 50%;
  content: '';
}
.research-map::after {
  inset: 100px;
}
.map-center {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: white;
  font-size: 30px;
  font-weight: 900;
  box-shadow: 0 20px 50px rgba(15, 118, 110, 0.3);
}
.node {
  position: absolute;
  padding: 10px 14px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  font-weight: 800;
  box-shadow: var(--shadow-md);
}
.node.quote {
  top: 24px;
  left: 145px;
}
.node.tech {
  right: 8px;
  top: 155px;
}
.node.finance {
  bottom: 23px;
  left: 142px;
}
.node.notice {
  left: 4px;
  top: 155px;
}
.quick-start {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 9px;
  padding-top: 24px;
  border-top: 1px solid var(--border-light);
}
.quick-start > strong {
  margin-right: auto;
}
.quick-start button {
  padding: 9px 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
}
.quick-start small {
  color: var(--text-muted);
}
.research-loading {
  min-height: 560px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  border-radius: 24px;
  color: var(--text-secondary);
}
.research-loading span {
  width: 52px;
  height: 52px;
  border: 3px solid var(--border-light);
  border-top-color: #0f766e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.quote-hero {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(310px, 1.2fr) auto;
  align-items: center;
  gap: 26px;
  padding: 22px 24px;
  border-radius: 22px;
}
.quote-identity {
  gap: 13px;
}
.ticker-badge {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 16px;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: white;
  font-size: 22px;
  font-weight: 900;
}
.quote-code {
  color: #0f766e;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
}
.quote-identity h1 {
  margin: 1px 0;
  font-size: 24px;
}
.quote-identity small {
  color: var(--text-muted);
  font-size: 10px;
}
.quote-price {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.quote-price > span {
  font-size: 18px;
}
.quote-price > strong {
  font-size: 38px;
  line-height: 1;
}
.quote-price > b {
  margin-left: 8px;
  padding: 4px 7px;
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-size: 12px;
}
.quote-range {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.quote-range span {
  display: flex;
  flex-direction: column;
  padding-left: 12px;
  border-left: 1px solid var(--border-light);
}
.quote-range small {
  color: var(--text-muted);
  font-size: 10px;
}
.quote-range strong {
  font-size: 13px;
}
.quote-actions {
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}
.quote-actions button {
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}
.quote-actions button.active {
  color: #e8a317;
  border-color: rgba(232, 163, 23, 0.35);
}
.research-tabs {
  display: flex;
  gap: 6px;
  margin: 14px 0;
  padding: 5px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
}
.research-tabs button {
  padding: 9px 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 750;
}
.research-tabs button.active {
  background: #0f766e;
  color: #fff;
  box-shadow: 0 5px 16px rgba(15, 118, 110, 0.22);
}
.research-tabs small {
  margin-left: 4px;
  opacity: 0.7;
}
.panel-stack {
  display: grid;
  gap: 14px;
}
.workspace-card {
  border-radius: 20px;
  padding: 20px;
}
.card-header,
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.card-header h2,
.panel-heading h2 {
  margin-top: 3px;
  font-size: 18px;
}
.card-header button {
  border: 0;
  background: transparent;
  color: #0f766e;
  cursor: pointer;
  font-weight: 800;
}
.chart-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.period-switch {
  display: flex;
  padding: 3px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
}
.period-switch button {
  padding: 5px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}
.period-switch button.active {
  background: #0f766e;
  color: #fff;
}
.chart-controls :deep(.dp__main) {
  width: 130px;
}
.chart-controls :deep(.dp__input) {
  height: 34px;
  border-radius: 9px;
  font-size: 11px;
  background: var(--bg-page);
  color: var(--text-primary);
  border-color: var(--border-light);
}
.candle-inspector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-subtle);
}
.candle-inspector span {
  display: flex;
  flex-direction: column;
  padding-left: 10px;
  border-left: 1px solid var(--border-light);
}
.candle-inspector small {
  color: var(--text-muted);
  font-size: 10px;
}
.candle-inspector strong {
  font-size: 12px;
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
  font-size: 26px;
}
.score-ring small {
  color: var(--text-muted);
  font-size: 10px;
}
.trend-copy > strong {
  font-size: 20px;
}
.trend-copy p {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 11px;
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
  padding: 10px;
  border: 1px solid var(--border-light);
  border-radius: 11px;
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
  font-size: 11px;
}
.signal-list small {
  color: var(--text-muted);
  font-size: 9px;
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
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-subtle);
}
.metric-grid small,
.quality-grid small {
  color: var(--text-muted);
  font-size: 9px;
}
.metric-grid strong {
  margin-top: 3px;
  font-size: 15px;
}
.support-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  padding: 11px 14px;
  border: 1px dashed rgba(15, 118, 110, 0.28);
  border-radius: 11px;
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
.support-bar small {
  color: var(--text-muted);
  font-size: 9px;
}
.support-bar strong {
  font-size: 13px;
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
  font-size: 14px;
}
.quality-grid b {
  font-size: 10px;
}
.decision-card .card-header > div p {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 10px;
}
.decision-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--bg-subtle);
  font-size: 12px;
  font-weight: 800;
}
.decision-badge.bullish {
  color: var(--stock-up);
  border: 1px solid color-mix(in srgb, var(--stock-up) 28%, transparent);
}
.decision-badge.neutral {
  color: #e8a317;
  border: 1px solid color-mix(in srgb, #e8a317 28%, transparent);
}
.decision-badge.bearish {
  color: var(--stock-down);
  border: 1px solid color-mix(in srgb, var(--stock-down) 28%, transparent);
}
.decision-score {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 12px 0 10px;
}
.decision-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 10px;
}
.decision-score strong {
  font-size: 28px;
}
.decision-score small {
  color: var(--text-muted);
  font-size: 10px;
}
.decision-highlights {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.decision-highlights span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 10px;
}
.decision-block {
  margin-top: 12px;
}
.decision-block h3 {
  margin-bottom: 6px;
  font-size: 12px;
}
.decision-block ul {
  margin: 0;
  padding: 0 0 0 16px;
  color: var(--text-secondary);
  display: grid;
  gap: 6px;
}
.decision-block li {
  font-size: 11px;
  line-height: 1.6;
}
.decision-action {
  margin-top: 12px;
  padding: 10px 11px;
  border-radius: 10px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 11px;
  line-height: 1.65;
}
.notice-preview a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 4px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
  text-decoration: none;
}
.notice-preview a span {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.notice-preview a b {
  flex: 0 0 auto;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 9px;
}
.notice-preview a strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.notice-preview a small {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 9px;
}
.card-empty {
  padding: 24px;
  color: var(--text-muted);
  text-align: center;
}
.full-panel {
  min-height: 560px;
}
.panel-heading {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-light);
}
.panel-heading p {
  color: var(--text-secondary);
  font-size: 11px;
}
.panel-heading > span {
  color: var(--text-muted);
  font-size: 10px;
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
  font-size: 9px;
  text-align: right;
}
.financial-table th:first-child,
.financial-table td:first-child {
  text-align: left;
}
.financial-table td {
  padding: 13px 10px;
  border-top: 1px solid var(--border-light);
  font-size: 11px;
  text-align: right;
}
.financial-table td:first-child {
  display: flex;
  flex-direction: column;
}
.financial-table small {
  color: var(--text-muted);
}
.notice-list {
  display: grid;
  margin-top: 10px;
}
.notice-list a {
  display: grid;
  grid-template-columns: 90px 110px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 15px 8px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
  text-decoration: none;
}
.notice-list time,
.notice-list span {
  color: var(--text-muted);
  font-size: 10px;
}
.notice-list b {
  color: #0f766e;
  font-size: 10px;
}
.notice-list strong {
  font-size: 12px;
}
.panel-empty {
  display: grid;
  min-height: 300px;
  place-items: center;
  color: var(--text-muted);
}
.panel-empty.small {
  min-height: 120px;
}
.journal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  gap: 14px;
}
.note-card textarea {
  width: 100%;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  outline: 0;
  resize: vertical;
  background: var(--bg-page);
  color: var(--text-primary);
  line-height: 1.8;
}
.note-card textarea:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}
.note-card > p {
  margin-top: 9px;
  color: var(--text-muted);
  font-size: 10px;
}
.alert-form {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 7px;
  margin-top: 18px;
}
.alert-form select,
.alert-form input {
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
}
.alert-form button {
  border: 0;
  border-radius: 9px;
  background: #0f766e;
  color: white;
  font-weight: 800;
  cursor: pointer;
}
.alert-list {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}
.alert-list > div {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px;
  border: 1px solid var(--border-light);
  border-radius: 11px;
}
.alert-list > div span {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.alert-list small {
  color: var(--text-muted);
  font-size: 9px;
}
.alert-toggle {
  width: 28px;
  height: 17px;
  padding: 2px;
  border: 0;
  border-radius: 99px;
  background: #0f766e;
  cursor: pointer;
}
.alert-toggle i {
  display: block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  transform: translateX(11px);
}
.alert-list .disabled .alert-toggle {
  background: var(--border);
}
.alert-list .disabled .alert-toggle i {
  transform: none;
}
.alert-list .triggered {
  border-color: rgba(232, 163, 23, 0.35);
  background: rgba(232, 163, 23, 0.07);
}
.alert-remove {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.portfolio-panel { display: grid; gap: 14px; }
.portfolio-summary-grid,.backtest-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
.portfolio-summary-grid article,.backtest-metrics article { display: flex; min-height: 82px; flex-direction: column; justify-content: center; padding: 14px 16px; border: 1px solid var(--border-light); border-radius: 15px; background: var(--bg-card); box-shadow: var(--shadow-sm); }
.portfolio-summary-grid small,.backtest-metrics small { color: var(--text-muted); font-size: 10px; }.portfolio-summary-grid strong,.backtest-metrics strong { margin-top: 4px; font-size: 20px; }.portfolio-summary-grid b { font-size: 10px; }
.portfolio-layout { display: grid; grid-template-columns: 280px minmax(0,1fr); gap: 14px; }.position-form-card { display: flex; flex-direction: column; gap: 12px; }.position-form-card .card-header p { color: var(--text-muted); font-size: 10px; }.position-form-card label { display: flex; flex-direction: column; gap: 5px; color: var(--text-secondary); font-size: 10px; }.position-form-card input,.backtest-form input { box-sizing: border-box; width: 100%; height: 38px; padding: 0 10px; border: 1px solid var(--border-light); border-radius: 9px; outline: 0; background: var(--bg-page); color: var(--text-primary); }.position-form-card > button,.panel-heading > button,.backtest-form > button { min-height: 38px; border: 0; border-radius: 9px; background: #0f766e; color: #fff; cursor: pointer; font-weight: 800; }.position-form-card > button:disabled,.panel-heading > button:disabled { cursor: not-allowed; opacity: .45; }.position-form-card > p,.backtest-note { color: var(--text-muted); font-size: 9px; line-height: 1.6; }
.position-table-wrap { overflow: auto; margin-top: 12px; }.position-table { width: 100%; border-collapse: collapse; white-space: nowrap; }.position-table th,.position-table td { padding: 11px 9px; border-bottom: 1px solid var(--border-light); text-align: right; font-size: 10px; }.position-table th { color: var(--text-muted); font-size: 9px; }.position-table th:first-child,.position-table td:first-child { text-align: left; }.position-table td:first-child,.position-table td:nth-last-child(2) { display: table-cell; }.position-table td:first-child strong,.position-table td:first-child small,.position-table td:nth-last-child(2) strong,.position-table td:nth-last-child(2) small { display: block; }.position-table small { color: var(--text-muted); }.position-table button { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
.compare-panel .panel-heading button { padding: 8px 14px; }.compare-picker { display: flex; flex-wrap: wrap; gap: 7px; margin: 16px 0 12px; }.compare-picker button { display: flex; flex-direction: column; padding: 8px 11px; border: 1px solid var(--border-light); border-radius: 9px; background: var(--bg-page); color: var(--text-primary); cursor: pointer; text-align: left; }.compare-picker button.active { border-color: #0f766e; background: color-mix(in srgb,#0f766e 10%,var(--bg-card)); }.compare-picker small { color: var(--text-muted); font-size: 9px; }.compare-metrics { display: grid; gap: 7px; margin-top: 10px; }.compare-metrics article { display: grid; grid-template-columns: 6px minmax(120px,1fr) repeat(3,minmax(100px,.6fr)); align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border-light); border-radius: 10px; }.compare-metrics i { width: 6px; height: 34px; border-radius: 99px; }.compare-metrics span { display: flex; flex-direction: column; }.compare-metrics small { color: var(--text-muted); font-size: 9px; }.compare-metrics b { font-size: 12px; }
.backtest-form { display: grid; grid-template-columns: repeat(3,minmax(100px,1fr)) auto; align-items: end; gap: 8px; margin: 16px 0; }.backtest-form label { display: flex; flex-direction: column; gap: 5px; color: var(--text-secondary); font-size: 9px; }.backtest-form > button { padding: 0 16px; }.backtest-metrics { grid-template-columns: repeat(5,minmax(0,1fr)); margin-bottom: 12px; }.trade-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; margin-top: 12px; }.trade-list > div { display: grid; grid-template-columns: 1fr 1fr auto; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--border-light); border-radius: 10px; }.trade-list span { display: flex; flex-direction: column; }.trade-list small { color: var(--text-muted); font-size: 8px; }.trade-list strong,.trade-list b { font-size: 10px; }.backtest-note { margin-top: 12px; text-align: center; }

.research-source-error {
  margin: 12px 0;
  color: var(--warning);
  font-size: 11px;
}
.research-disclaimer {
  margin-top: 14px;
  padding: 13px;
  color: var(--text-muted);
  font-size: 10px;
  text-align: center;
}
.up {
  color: var(--stock-up) !important;
}
.down {
  color: var(--stock-down) !important;
}
.bullish {
  color: var(--stock-up);
}
.bearish {
  color: var(--stock-down);
}
.neutral {
  color: #e8a317;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pulse {
  to {
    opacity: 0.35;
  }
}

@media (max-width: 1180px) {
  .research-shell {
    grid-template-columns: 250px minmax(0, 1fr);
  }
  .quote-hero {
    grid-template-columns: 1fr auto;
  }
  .quote-range {
    grid-column: 1/-1;
  }
  .quote-actions {
    position: absolute;
    right: 24px;
    top: 24px;
  }
  .welcome-state {
    grid-template-columns: 1fr;
  }
  .research-map {
    display: none;
  }
  .analysis-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 820px) {
  .research-header,
  .market-pulse,
  .research-shell {
    width: min(100% - 24px, 1500px);
  }
  .source-state {
    display: none;
  }
  .market-pulse {
    grid-template-columns: 1fr;
  }
  .market-pulse > small {
    display: none;
  }
  .index-list {
    grid-template-columns: 1fr;
  }
  .research-shell {
    grid-template-columns: 1fr;
  }
  .research-sidebar {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .search-card {
    grid-column: 1/-1;
  }
  .watchlist-card {
    grid-column: 1/-1;
  }
  .search-results {
    width: calc(100% - 36px);
  }
  .welcome-state {
    min-height: 520px;
    padding: 32px;
  }
  .quote-hero {
    grid-template-columns: 1fr;
  }
  .quote-price {
    margin-top: 6px;
  }
  .quote-range {
    grid-template-columns: repeat(2, 1fr);
  }
  .quote-actions {
    position: static;
    justify-content: flex-start;
  }
  .research-tabs {
    overflow: auto;
  }
  .research-tabs button {
    flex: 0 0 auto;
  }
  .journal-grid {
    grid-template-columns: 1fr;
  }
  .portfolio-summary-grid,.backtest-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .portfolio-layout { grid-template-columns: 1fr; }
  .backtest-form { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .backtest-form > button { min-height: 38px; }
  .compare-metrics { overflow-x: auto; }
  .compare-metrics article { min-width: 660px; }
  .trade-list { grid-template-columns: 1fr; }
  .candle-inspector {
    grid-template-columns: repeat(2, 1fr);
  }
  .metric-grid,
  .quality-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .notice-list a {
    grid-template-columns: 80px minmax(0, 1fr) auto;
  }
  .notice-list b {
    display: none;
  }
}
@media (max-width: 520px) {
  .research-header {
    min-height: 64px;
  }
  .header-brand small,
  .header-actions {
    display: none;
  }
  .market-pulse {
    margin-top: 10px;
  }
  .research-sidebar {
    grid-template-columns: 1fr;
  }
  .recent-card {
    display: none;
  }
  .welcome-copy h1 {
    font-size: 38px;
  }
  .quick-start {
    overflow: auto;
  }
  .quick-start > strong {
    display: none;
  }
  .chart-controls {
    align-items: flex-end;
    flex-direction: column;
  }
  .analysis-grid {
    gap: 10px;
  }
  .workspace-card {
    padding: 15px;
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
  .quote-range {
    gap: 5px;
  }
  .quote-range span {
    padding: 8px;
    border: 1px solid var(--border-light);
    border-radius: 9px;
  }
  .financial-table {
    min-width: 820px;
  }
  .alert-form {
    grid-template-columns: 1fr 1fr;
  }
  .alert-form button {
    grid-column: 1/-1;
    padding: 10px;
  }
  .portfolio-summary-grid,.backtest-metrics { grid-template-columns: 1fr 1fr; }
  .backtest-form { grid-template-columns: 1fr; }
}

@media (max-width: 820px) {
  .empty-feature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .welcome-state.compact-empty {
    min-height: 420px;
    padding: 28px;
  }
}
</style>
