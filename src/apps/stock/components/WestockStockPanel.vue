<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useStockStore } from '@/stores/stock'
import { westockCommand } from '@/stores/westock'
import type { WestockResult as WestockResultData } from '@/stores/westock'
import WestockResult from './WestockResult.vue'

defineOptions({ name: 'WestockStockPanel' })

const stock = useStockStore()

interface Selector {
  key: string
  label: string
  options: Array<{ value: string; label: string }>
  default: string
}
interface StockCmd {
  id: string
  label: string
  needsCode?: boolean
  selectors?: Selector[]
}

const STOCK_CMDS: StockCmd[] = [
  { id: 'quote', label: '实时行情', needsCode: true },
  { id: 'minute', label: '分时', needsCode: true },
  {
    id: 'kline',
    label: 'K线',
    needsCode: true,
    selectors: [
      {
        key: 'period',
        label: '周期',
        default: 'day',
        options: [
          { value: 'day', label: '日线' },
          { value: 'week', label: '周线' },
          { value: 'month', label: '月线' },
        ],
      },
      {
        key: 'fq',
        label: '复权',
        default: 'qfq',
        options: [
          { value: 'qfq', label: '前复权' },
          { value: 'hfq', label: '后复权' },
          { value: 'bfq', label: '不复权' },
        ],
      },
    ],
  },
  {
    id: 'technical',
    label: '技术指标',
    needsCode: true,
    selectors: [
      {
        key: 'group',
        label: '指标组',
        default: 'all',
        options: [
          { value: 'all', label: '全部' },
          { value: 'macd', label: 'MACD' },
          { value: 'rsi', label: 'RSI' },
          { value: 'kdj', label: 'KDJ' },
          { value: 'boll', label: 'BOLL' },
          { value: 'ma', label: '均线' },
        ],
      },
    ],
  },
  { id: 'chip', label: '筹码成本', needsCode: true },
  {
    id: 'finance',
    label: '财务数据',
    needsCode: true,
    selectors: [
      {
        key: 'type',
        label: '报表',
        default: 'main',
        options: [
          { value: 'main', label: '主要指标' },
          { value: 'lrb', label: '利润表' },
          { value: 'zcfz', label: '资产负债表' },
          { value: 'xjll', label: '现金流量表' },
          { value: 'zhsy', label: '综合损益' },
        ],
      },
    ],
  },
  { id: 'score', label: '股票评分', needsCode: true },
  { id: 'report', label: '研报', needsCode: true },
  { id: 'dehydrated', label: '脱水研报' },
  { id: 'notice', label: '公司公告', needsCode: true },
  { id: 'shareholder', label: '股东研究', needsCode: true },
  { id: 'dividend', label: '历史分红', needsCode: true },
  { id: 'buyback', label: '公司回购', needsCode: true },
  { id: 'profile', label: '股票简况', needsCode: true },
  {
    id: 'fund',
    label: '资金流向',
    needsCode: true,
    selectors: [
      {
        key: 'sub',
        label: '类别',
        default: 'flow',
        options: [
          { value: 'flow', label: '主力流向' },
          { value: 'short', label: '卖空' },
          { value: 'margin', label: '融资融券' },
          { value: 'block', label: '大宗交易' },
        ],
      },
    ],
  },
  { id: 'rating', label: '机构评级', needsCode: true },
  { id: 'consensus', label: '一致预期', needsCode: true },
  { id: 'disclosure', label: '披露日历', needsCode: true },
]

const activeTab = ref(STOCK_CMDS[0].id)
const selState = reactive<Record<string, string>>({})
const result = ref<WestockResultData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const code = computed(() => stock.formattedCode)
const activeCmd = computed(() => STOCK_CMDS.find((c) => c.id === activeTab.value)!)

function resetSelectors(cmd: StockCmd) {
  for (const s of cmd.selectors ?? []) selState[s.key] = s.default
}

function buildParams(cmd: StockCmd): Record<string, string> {
  const p: Record<string, string> = {}
  if (cmd.needsCode && code.value) p.code = code.value
  switch (cmd.id) {
    case 'kline':
      p.period = selState.period || 'day'
      p.fq = selState.fq || 'qfq'
      p.limit = '120'
      break
    case 'technical':
      p.group = selState.group || 'all'
      break
    case 'finance':
      p.type = selState.type || 'main'
      p.num = '4'
      break
    case 'fund':
      p.sub = selState.sub || 'flow'
      break
    case 'report':
      p.limit = '10'
      break
    case 'notice':
      p.sub = 'list'
      p.limit = '10'
      break
    case 'dividend':
      p.years = '5'
      break
    case 'minute':
      p.days = '1'
      break
    case 'dehydrated':
      p.limit = '10'
      break
  }
  return p
}

async function run() {
  const cmd = activeCmd.value
  if (cmd.needsCode && !code.value) {
    error.value = null
    result.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    const res = await westockCommand(cmd.id, buildParams(cmd))
    result.value = res
    if (!res.success) error.value = res.error || '请求未成功'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '请求失败'
  } finally {
    loading.value = false
  }
}

function selectTab(id: string) {
  activeTab.value = id
  resetSelectors(activeCmd.value)
  void run()
}

resetSelectors(STOCK_CMDS[0])
void run()

watch(
  () => stock.stockCode,
  () => {
    if (activeCmd.value.needsCode) void run()
  },
)
</script>

<template>
  <section class="ws-stock">
    <header class="ws-stock-head">
      <div>
        <span class="ws-eyebrow">WESTOCK · 个股深度</span>
        <h2>腾讯 westock 数据</h2>
        <p>由当前选中标的驱动，覆盖行情 / 财务 / 股东 / 资金 / 研报等维度。</p>
      </div>
      <div class="ws-target" :class="{ empty: !code }">
        <small>当前标的</small>
        <strong>{{ code || '未选择股票' }}</strong>
      </div>
    </header>

    <nav class="ws-tabs" aria-label="个股能力">
      <button
        v-for="cmd in STOCK_CMDS"
        :key="cmd.id"
        type="button"
        :class="{ active: activeTab === cmd.id }"
        :disabled="cmd.needsCode && !code"
        :title="cmd.needsCode && !code ? '请先选择一只股票' : ''"
        @click="selectTab(cmd.id)"
      >
        {{ cmd.label }}
      </button>
    </nav>

    <div v-if="activeCmd.selectors?.length" class="ws-selectors">
      <label v-for="s in activeCmd.selectors" :key="s.key">
        <span>{{ s.label }}</span>
        <select v-model="selState[s.key]" @change="run()">
          <option v-for="opt in s.options" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <button type="button" class="ws-run" @click="run()">刷新</button>
    </div>

    <WestockResult :result="result" :loading="loading" :error="error" />

    <p class="ws-foot">
      数据来自腾讯 westock 网关，仅供研究学习，不构成投资建议。
    </p>
  </section>
</template>

<style scoped>
.ws-stock {
  display: grid;
  gap: 14px;
}
.ws-stock-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.ws-eyebrow {
  color: #0f766e;
  font-size: var(--font-size-caption);
  font-weight: 900;
  letter-spacing: 0.15em;
}
.ws-stock-head h2 {
  margin: 4px 0 2px;
  font-size: var(--font-size-heading);
}
.ws-stock-head p {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}
.ws-target {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 8px 14px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: color-mix(in srgb, #0f766e 6%, var(--bg-card));
}
.ws-target.empty {
  opacity: 0.6;
}
.ws-target small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.ws-target strong {
  font-size: var(--font-size-title);
  color: #0f766e;
}
.ws-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 5px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
}
.ws-tabs button {
  flex: none;
  padding: 8px 13px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-meta);
  font-weight: 700;
  white-space: nowrap;
}
.ws-tabs button.active {
  background: #0f766e;
  color: #fff;
  box-shadow: 0 5px 16px rgba(15, 118, 110, 0.22);
}
.ws-tabs button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.ws-selectors {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.ws-selectors label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-caption);
  color: var(--text-muted);
}
.ws-selectors select {
  height: 36px;
  min-width: 120px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}
.ws-run {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
}
.ws-foot {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  text-align: center;
}
</style>
