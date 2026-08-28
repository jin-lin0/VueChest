<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStockStore, type KlinePeriod } from '@/stores/stock'
import { STOCK_COLORS } from './config'
import { debounce } from '@/utils/common'
import { formatLargeNumber } from './research'
import { buildResearchDecision, extractNoticeSignals, type DecisionSummary } from './decision'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'StockResearchWorkspace' })

type ResearchPanel =
  | 'overview'
  | 'portfolio'
  | 'compare'
  | 'backtest'
  | 'financials'
  | 'notices'
  | 'journal'
const router = useRouter()
const route = useRoute()
const stock = useStockStore()
const { addToast } = useToast()
const Draggable = defineAsyncComponent(() => import('vuedraggable'))
const OverviewPanel = defineAsyncComponent(() => import('./components/OverviewPanel.vue'))
const PortfolioPanel = defineAsyncComponent(() => import('./components/PortfolioPanel.vue'))
const ComparePanel = defineAsyncComponent(() => import('./components/ComparePanel.vue'))
const BacktestPanel = defineAsyncComponent(() => import('./components/BacktestPanel.vue'))
const FinancialsPanel = defineAsyncComponent(() => import('./components/FinancialsPanel.vue'))
const NoticesPanel = defineAsyncComponent(() => import('./components/NoticesPanel.vue'))
const JournalPanel = defineAsyncComponent(() => import('./components/JournalPanel.vue'))

const activePanel = ref<ResearchPanel>('overview')
const activePeriod = ref<KlinePeriod>('day')
let portfolioRefreshTimer: ReturnType<typeof setInterval> | null = null

const quote = computed(() => stock.researchSummary)
const currentPrice = computed(() => quote.value?.price ?? Number(stock.result?.close || 0))
const changePercent = computed(() => quote.value?.changePercent ?? 0)
const isUp = computed(() => changePercent.value >= 0)
const latestFinancial = computed(() => stock.financials[0] ?? null)
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

const panelItems: Array<{ id: ResearchPanel; label: string; count?: () => number }> = [
  { id: 'overview', label: '行情研判' },
  { id: 'portfolio', label: '模拟持仓', count: () => stock.positions.length },
  { id: 'compare', label: '股票对比' },
  { id: 'backtest', label: '策略回测' },
  { id: 'financials', label: '财务质量', count: () => stock.financials.length },
  { id: 'notices', label: '公司公告', count: () => stock.notices.length },
  {
    id: 'journal',
    label: '研究笔记',
    count: () => stock.alerts.filter((item) => item.code === stock.stockCode).length,
  },
]
const panelNeedsStock = (panel: ResearchPanel) => panel !== 'overview' && panel !== 'portfolio'
const panelIds = new Set<ResearchPanel>(panelItems.map((item) => item.id))

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

async function openStock(code: string, preservePanel = activePanel.value === 'portfolio') {
  if (!preservePanel) activePanel.value = 'overview'
  await stock.loadStock(code, activePeriod.value)
}

async function openPositionResearch(code: string) {
  await openStock(code, false)
}

let routeCommandsReady = false
let handledRouteCommand = ''
async function applyRouteCommand() {
  if (!routeCommandsReady) return
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const requestedPanel =
    typeof route.query.panel === 'string' && panelIds.has(route.query.panel as ResearchPanel)
      ? (route.query.panel as ResearchPanel)
      : null
  const commandKey = `${code}|${requestedPanel || ''}|${String(route.query.command || '')}`
  if ((!code && !requestedPanel) || commandKey === handledRouteCommand) return
  handledRouteCommand = commandKey

  if (/^\d{6}$/.test(code)) {
    await openStock(code, requestedPanel === 'portfolio')
  }
  if (requestedPanel && (!panelNeedsStock(requestedPanel) || stock.result)) {
    activePanel.value = requestedPanel
  }
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

function onWatchlistDrag() {
  stock.reorderFavorites(stock.favoritesData.map((item) => ({ code: item.code, name: item.name })))
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

onMounted(async () => {
  await Promise.all([
    stock.fetchMarketOverview(),
    stock.fetchFavoritesData(),
    stock.fetchPortfolioData(),
  ])
  routeCommandsReady = true
  await applyRouteCommand()
  portfolioRefreshTimer = setInterval(() => void stock.fetchPortfolioData(), 60_000)
})
onUnmounted(() => {
  if (portfolioRefreshTimer) clearInterval(portfolioRefreshTimer)
})

watch(
  () => [route.query.code, route.query.panel, route.query.command],
  () => void applyRouteCommand(),
)
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
          <Draggable
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
          </Draggable>
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

        <nav class="research-tabs workspace-tabs" aria-label="工作台视图">
          <button
            v-for="item in panelItems"
            :key="item.id"
            type="button"
            :class="{ active: activePanel === item.id }"
            :disabled="panelNeedsStock(item.id) && !stock.result"
            :title="panelNeedsStock(item.id) && !stock.result ? '请先选择一只股票' : ''"
            @click="activePanel = item.id"
          >
            {{ item.label }} <small v-if="item.count">{{ item.count() }}</small>
          </button>
        </nav>

        <PortfolioPanel v-if="activePanel === 'portfolio'" @open-stock="openPositionResearch" />

        <div v-else-if="!stock.result && !stock.isLoading" class="welcome-state compact-empty">
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

          <OverviewPanel
            v-if="activePanel === 'overview'"
            v-model:period="activePeriod"
            :decision="researchDecision"
            @open-panel="activePanel = $event"
          />

          <ComparePanel v-else-if="activePanel === 'compare'" />

          <BacktestPanel v-else-if="activePanel === 'backtest'" />

          <FinancialsPanel v-else-if="activePanel === 'financials'" />

          <NoticesPanel v-else-if="activePanel === 'notices'" />

          <JournalPanel v-else />

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
.research-tabs button:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.research-tabs small {
  margin-left: 4px;
  opacity: 0.7;
}
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
  .quote-range {
    gap: 5px;
  }
  .quote-range span {
    padding: 8px;
    border: 1px solid var(--border-light);
    border-radius: 9px;
  }
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
