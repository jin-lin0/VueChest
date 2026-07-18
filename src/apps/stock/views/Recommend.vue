<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/request'

interface EnvData {
  regime: string
  sentimentScore: number
  activityScore: number
  breadth: number
  up: number
  down: number
  limitUp: number
  limitDown: number
  avgChange: number
  totalAmountYi: number
  totalMainInflowYi: number | null
  recommendCount: number
  description: string
}

interface StockItem {
  code: string
  name: string
  patternType: string
  capitalBehavior: string
  techScore: number
  volumeScore: number
  combined: number
  level: string
  reason: string
  price: number
  changePct: number
  totalMvYi: number
  turnoverRate: number
  mainNetInflowYi: number
}

interface RecommendData {
  marketEnv: EnvData
  totalMatched: number
  count: number
  scanned: number
  stocks: StockItem[]
  updatedAt: string
}

const router = useRouter()
const loading = ref(false)
const error = ref('')
const data = ref<RecommendData | null>(null)
const filter = ref<string>('全部')

const patternTypes = ['全部', '放量长上影', '一进二', '强势回调']

const filteredStocks = computed(() => {
  if (!data.value) return []
  if (filter.value === '全部') return data.value.stocks
  return data.value.stocks.filter((s) => s.patternType === filter.value)
})

const regimeText = computed(() => {
  const map: Record<string, string> = {
    strong: '强势',
    normal: '中性',
    weak: '偏弱',
    extreme_weak: '极端弱势',
    unknown: '未知',
  }
  return data.value ? map[data.value.marketEnv.regime] || data.value.marketEnv.regime : ''
})

async function load(refresh = false) {
  loading.value = true
  error.value = ''
  try {
    const params: string[] = []
    if (refresh) params.push('refresh=1')
    const url = '/api/stock/recommend' + (params.length ? '?' + params.join('&') : '')
    const res = await api.get<{ data: RecommendData }>(url)
    data.value = res.data
  } catch (e: any) {
    error.value = e?.message || '获取荐股数据失败'
  } finally {
    loading.value = false
  }
}

function levelClass(level: string) {
  return {
    高: 'lv-high',
    中: 'lv-mid',
    低: 'lv-low',
  }[level] || 'lv-low'
}

function patternClass(type: string) {
  return {
    放量长上影: 'pt-shadow',
    一进二: 'pt-first2',
    强势回调: 'pt-pullback',
  }[type] || 'pt-default'
}

function goBack() {
  router.push('/stock')
}

function fmt(n: number, d = 2) {
  return n.toFixed(d)
}

onMounted(() => load())
</script>

<template>
  <div class="rec-container">
    <header class="rec-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>短线荐股</h1>
      <nav class="module-tabs">
        <RouterLink to="/stock" exact-active-class="active">行情分析</RouterLink>
        <RouterLink to="/stock/recommend" active-class="active">短线荐股</RouterLink>
      </nav>
    </header>

    <p class="disclaimer">仅基于量价与资金行为做短线形态筛选，用于研究与学习，不构成任何投资建议。</p>

    <div v-if="loading" class="state-box">
      <div class="spinner"></div>
      <p>正在扫描全市场（主板）、计算量价与资金特征…（首次较慢，结果按自然日缓存）</p>
    </div>

    <div v-else-if="error" class="state-box error">
      <p>⚠️ {{ error }}</p>
      <button class="refresh-btn" @click="load(true)">重试</button>
    </div>

    <template v-else-if="data">
      <!-- 市场环境 -->
      <section class="env-card" :class="'env-' + data.marketEnv.regime">
        <div class="env-left">
          <div class="env-regime">{{ regimeText }}</div>
          <div class="env-desc">{{ data.marketEnv.description }}</div>
        </div>
        <div class="env-right">
          <div class="env-metric"><span>涨跌家数</span><b>{{ data.marketEnv.up }} / {{ data.marketEnv.down }}</b></div>
          <div class="env-metric"><span>涨停 / 跌停</span><b>{{ data.marketEnv.limitUp }} / {{ data.marketEnv.limitDown }}</b></div>
          <div class="env-metric"><span>平均涨跌幅</span><b :class="data.marketEnv.avgChange >= 0 ? 'up' : 'down'">{{ fmt(data.marketEnv.avgChange) }}%</b></div>
          <div class="env-metric"><span>总成交额</span><b>{{ data.marketEnv.totalAmountYi }} 亿</b></div>
          <div class="env-metric"><span>主力净流入</span><b>{{ data.marketEnv.totalMainInflowYi == null ? '—' : fmt(data.marketEnv.totalMainInflowYi) + ' 亿' }}</b></div>
          <div class="env-metric"><span>情绪 / 活跃</span><b>{{ data.marketEnv.sentimentScore }} / {{ data.marketEnv.activityScore }}</b></div>
        </div>
      </section>

      <div class="toolbar">
        <div class="chips">
          <button
            v-for="t in patternTypes"
            :key="t"
            class="chip"
            :class="{ active: filter === t }"
            @click="filter = t"
          >
            {{ t }}
          </button>
        </div>
        <div class="meta">
          扫描 {{ data.scanned }} 只 · 命中 {{ data.totalMatched }} 只 · 推荐 {{ data.count }} 只
          <button class="refresh-btn" @click="load(true)">重新扫描</button>
        </div>
      </div>

      <div v-if="filteredStocks.length === 0" class="state-box">
        <p>当前筛选条件下暂无符合形态的股票。</p>
      </div>

      <div class="card-grid">
        <article v-for="s in filteredStocks" :key="s.code" class="stock-card">
          <div class="card-top">
            <div class="code-name">
              <span class="code">{{ s.code }}</span>
              <span class="name">{{ s.name }}</span>
            </div>
            <span class="level" :class="levelClass(s.level)">{{ s.level }}关注</span>
          </div>

          <div class="badges">
            <span class="pt-badge" :class="patternClass(s.patternType)">{{ s.patternType }}</span>
            <span class="price">¥{{ fmt(s.price) }} <i :class="s.changePct >= 0 ? 'up' : 'down'">{{ s.changePct >= 0 ? '+' : '' }}{{ fmt(s.changePct) }}%</i></span>
            <span class="mv">市值 {{ s.totalMvYi }}亿</span>
          </div>

          <div class="scores">
            <div class="score-bar">
              <span>技术形态</span>
              <div class="bar"><i :style="{ width: s.techScore + '%' }" class="bar-tech"></i></div>
              <b>{{ s.techScore }}</b>
            </div>
            <div class="score-bar">
              <span>量价</span>
              <div class="bar"><i :style="{ width: s.volumeScore + '%' }" class="bar-vol"></i></div>
              <b>{{ s.volumeScore }}</b>
            </div>
            <div class="score-bar">
              <span>综合</span>
              <div class="bar"><i :style="{ width: s.combined + '%' }" class="bar-comb"></i></div>
              <b>{{ s.combined }}</b>
            </div>
          </div>

          <p class="capital"><b>资金行为：</b>{{ s.capitalBehavior }}</p>
          <p class="reason"><b>入选原因：</b>{{ s.reason }}</p>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rec-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  min-height: 100vh;
  color: #1f2933;
}
.rec-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
}
.rec-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.back-button {
  background-color: var(--info, #3498db);
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 0.9rem;
}
.disclaimer {
  font-size: 0.8rem;
  color: #8a94a6;
  margin: 0 0 1rem;
}
.module-tabs {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}
.module-tabs a {
  padding: 0.45rem 1rem;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.9rem;
  color: #555;
  background: #f1f3f5;
  border: 1px solid #e0e0e0;
}
.module-tabs a.active {
  color: #fff;
  background: var(--info, #3498db);
  border-color: var(--info, #3498db);
}
.state-box {
  text-align: center;
  padding: 3rem 1rem;
  color: #667;
}
.state-box.error {
  color: #c0392b;
}
.spinner {
  width: 38px;
  height: 38px;
  border: 4px solid #dfe3e8;
  border-top-color: var(--info, #3498db);
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.refresh-btn {
  margin-left: 0.75rem;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--info, #3498db);
  background: #fff;
  color: var(--info, #3498db);
  border-radius: 5px;
  cursor: pointer;
}
/* 市场环境卡片 */
.env-card {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e6e9ee;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  margin-bottom: 1rem;
}
.env-card.env-strong {
  border-left: 5px solid #e74c3c;
}
.env-card.env-normal {
  border-left: 5px solid #f39c12;
}
.env-card.env-weak {
  border-left: 5px solid #3498db;
}
.env-card.env-extreme_weak {
  border-left: 5px solid #7f8c8d;
}
.env-left {
  min-width: 180px;
}
.env-regime {
  font-size: 1.25rem;
  font-weight: 700;
}
.env-desc {
  font-size: 0.82rem;
  color: #7a8595;
  margin-top: 0.3rem;
}
.env-right {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.4rem;
  align-items: center;
}
.env-metric {
  display: flex;
  flex-direction: column;
  font-size: 0.78rem;
  color: #8a94a6;
}
.env-metric b {
  font-size: 1rem;
  color: #1f2933;
}
.up {
  color: #e74c3c;
}
.down {
  color: #27ae60;
}
/* 工具栏 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.chips {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.chip {
  padding: 0.4rem 0.9rem;
  border: 1px solid #d8dde3;
  background: #fff;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #555;
}
.chip.active {
  background: var(--info, #3498db);
  color: #fff;
  border-color: var(--info, #3498db);
}
.meta {
  font-size: 0.82rem;
  color: #7a8595;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}
/* 卡片网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1rem;
}
.stock-card {
  background: #fff;
  border: 1px solid #e6e9ee;
  border-radius: 10px;
  padding: 1rem 1.1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.12s, box-shadow 0.12s;
}
.stock-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}
.code-name .code {
  font-weight: 700;
  font-size: 1.05rem;
  margin-right: 0.5rem;
}
.code-name .name {
  color: #445;
  font-size: 0.95rem;
}
.level {
  padding: 0.2rem 0.6rem;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #fff;
}
.lv-high {
  background: #e74c3c;
}
.lv-mid {
  background: #f39c12;
}
.lv-low {
  background: #95a5a6;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.7rem;
}
.pt-badge {
  padding: 0.18rem 0.55rem;
  border-radius: 4px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #fff;
}
.pt-shadow {
  background: #8e44ad;
}
.pt-first2 {
  background: #2980b9;
}
.pt-pullback {
  background: #16a085;
}
.pt-default {
  background: #7f8c8d;
}
.price {
  font-size: 0.85rem;
  color: #445;
}
.mv {
  font-size: 0.8rem;
  color: #8a94a6;
}
.scores {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.7rem;
}
.score-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: #667;
}
.score-bar > span {
  width: 56px;
  flex-shrink: 0;
}
.score-bar b {
  width: 28px;
  text-align: right;
  color: #1f2933;
}
.bar {
  flex: 1;
  height: 8px;
  background: #eef1f4;
  border-radius: 5px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
}
.bar-tech {
  background: #8e44ad;
}
.bar-vol {
  background: #2980b9;
}
.bar-comb {
  background: #e67e22;
}
.capital,
.reason {
  font-size: 0.82rem;
  line-height: 1.5;
  color: #4a5568;
  margin: 0.4rem 0 0;
}
.capital b,
.reason b {
  color: #1f2933;
}
</style>
