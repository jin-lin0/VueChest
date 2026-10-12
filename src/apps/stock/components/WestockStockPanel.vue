<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CustomSelect, type SelectOption } from '@/components'
import { useStockStore } from '@/stores/stock'
import { isWestockAuthError, westockCommand } from '@/stores/westock'
import type { WestockResult as WestockResultData } from '@/stores/westock'
import WestockResult from './WestockResult.vue'

defineOptions({ name: 'WestockStockPanel' })
const props = defineProps<{ mode: 'research' | 'finance' | 'notice' }>()

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
  category?: string
  needsCode?: boolean
  selectors?: Selector[]
}

const STOCK_CMDS: StockCmd[] = [
  { id: 'quote', label: '实时行情', category: '行情数据', needsCode: true },
  { id: 'minute', label: '分时', category: '行情数据', needsCode: true },
  {
    id: 'kline',
    label: 'K线',
    category: '行情数据',
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
    category: '技术分析',
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
  { id: 'chip', label: '筹码成本', category: '技术分析', needsCode: true },
  {
    id: 'finance',
    label: '财务数据',
    needsCode: true,
    selectors: [
      {
        key: 'type',
        label: '报表类型',
        default: 'lrb',
        options: [
          { value: 'lrb', label: '利润表' },
          { value: 'zcfz', label: '资产负债表' },
          { value: 'xjll', label: '现金流量表' },
        ],
      },
      {
        key: 'num',
        label: '期数',
        default: '4',
        options: [
          { value: '1', label: '最近 1 期' },
          { value: '4', label: '最近 4 期' },
          { value: '8', label: '最近 8 期' },
        ],
      },
    ],
  },
  { id: 'score', label: '股票评分', category: '技术分析', needsCode: true },
  { id: 'report', label: '研报', category: '机构观点', needsCode: true },
  { id: 'dehydrated', label: '脱水研报', category: '机构观点' },
  { id: 'notice', label: '公司公告', needsCode: true },
  { id: 'shareholder', label: '股东研究', category: '公司研究', needsCode: true },
  { id: 'dividend', label: '历史分红', category: '公司研究', needsCode: true },
  { id: 'buyback', label: '公司回购', category: '公司研究', needsCode: true },
  { id: 'profile', label: '股票简况', category: '公司研究', needsCode: true },
  {
    id: 'fund',
    label: '资金流向',
    category: '资金研究',
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
  { id: 'rating', label: '机构评级', category: '机构观点', needsCode: true },
  { id: 'consensus', label: '一致预期', category: '机构观点', needsCode: true },
  { id: 'disclosure', label: '披露日历', category: '公司研究', needsCode: true },
]

const researchCommand = ref('technical')
const selState = reactive<Record<string, string>>({})
const result = ref<WestockResultData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const unauthorized = ref(false)
let requestId = 0

const code = computed(() => stock.formattedCode)
const activeCmd = computed(
  () =>
    STOCK_CMDS.find(
      (c) => c.id === (props.mode === 'research' ? researchCommand.value : props.mode),
    )!,
)
const researchOptions = computed<SelectOption[]>(() =>
  STOCK_CMDS.filter((cmd) => cmd.category).map((cmd) => ({
    value: cmd.id,
    label: `${cmd.category} · ${cmd.label}`,
    disabled: cmd.needsCode && !code.value,
  })),
)
const title = computed(() => (props.mode === 'finance' ? '财务报表' : activeCmd.value.label))
const description = computed(() => {
  if (props.mode === 'finance') return '按报表类型和报告期查看上市公司的财务数据。'
  if (props.mode === 'notice') return '查看当前公司的最新披露，追踪经营与重大事项。'
  return '选择研究项目，从行情、技术、资金和机构观点等维度查看数据。'
})
const targetName = computed(() => {
  const name = stock.selectedInstrument?.name
  return name && name !== stock.selectedInstrument?.code ? name : code.value
})
const displayResult = computed(() => {
  if (props.mode !== 'finance' || result.value?.kind !== 'table') return result.value
  const reportLabel = activeCmd.value.selectors?.[0]?.options.find(
    (option) => option.value === selState.type,
  )?.label
  return {
    ...result.value,
    title: reportLabel,
    meta: `${result.value.rows?.length ?? 0} 期报表记录`,
  }
})
const financeHint = computed(() => {
  const type = stock.selectedInstrument?.type
  if (activeCmd.value.id !== 'finance' || !type || type === 'stock') return ''
  return type === 'fund'
    ? '当前标的是基金。此入口查询上市公司财务报表，基金财务信息请查阅基金定期报告。'
    : '当前标的是指数。指数不对应单家上市公司的财务报表，请选择成分股查看公司财务。'
})

function resetSelectors(cmd: StockCmd) {
  for (const key of Object.keys(selState)) delete selState[key]
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
      p.type = selState.type || 'lrb'
      p.num = selState.num || '4'
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
  const currentRequest = ++requestId
  const cmd = activeCmd.value
  const params = buildParams(cmd)
  const targetCode = code.value
  if ((cmd.needsCode && !code.value) || financeHint.value) {
    loading.value = false
    error.value = null
    result.value = null
    unauthorized.value = false
    return
  }
  loading.value = true
  result.value = null
  error.value = null
  unauthorized.value = false
  try {
    const res = await westockCommand(cmd.id, params)
    if (currentRequest !== requestId || (cmd.needsCode && code.value !== targetCode)) return
    result.value = res
    if (!res.success) error.value = res.error || '请求未成功'
  } catch (e) {
    if (currentRequest !== requestId) return
    unauthorized.value = isWestockAuthError(e)
    error.value = e instanceof Error ? e.message : '请求失败'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function selectResearch(value: string | number) {
  const id = String(value)
  if (!researchOptions.value.some((option) => option.value === id && !option.disabled)) return
  researchCommand.value = id
  resetSelectors(activeCmd.value)
  void run()
}

function changeSelector(key: string, value: string | number) {
  selState[key] = String(value)
  void run()
}

resetSelectors(activeCmd.value)
void run()
watch(
  () => props.mode,
  () => {
    resetSelectors(activeCmd.value)
    void run()
  },
)

watch(
  () => stock.formattedCode,
  () => {
    if (activeCmd.value.needsCode) void run()
  },
)
</script>

<template>
  <section class="ws-stock">
    <header class="ws-stock-head">
      <div>
        <span class="ws-eyebrow">{{ mode === 'research' ? '深度研究' : '公司研究' }}</span>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <div class="ws-target" :class="{ empty: activeCmd.needsCode && !code }">
        <small>{{ activeCmd.needsCode ? '当前标的' : '研究范围' }}</small>
        <strong>{{ activeCmd.needsCode ? targetName || '未选择标的' : '全市场' }}</strong>
        <span v-if="activeCmd.needsCode && code && targetName !== code">{{ code }}</span>
      </div>
    </header>

    <p v-if="financeHint" class="ws-finance-hint" role="status">{{ financeHint }}</p>

    <div v-else class="ws-toolbar">
      <div v-if="mode === 'research'" class="ws-field ws-project">
        <span>研究项目</span>
        <CustomSelect
          :model-value="researchCommand"
          :options="researchOptions"
          aria-label="研究项目"
          searchable
          block
          @change="selectResearch"
        />
      </div>
      <div v-for="s in activeCmd.selectors" :key="s.key" class="ws-field ws-filter">
        <span>{{ s.label }}</span>
        <CustomSelect
          :model-value="selState[s.key]"
          :options="s.options"
          :aria-label="s.label"
          :disabled="activeCmd.needsCode && !code"
          block
          @change="changeSelector(s.key, $event)"
        />
      </div>
      <button
        type="button"
        class="ws-run"
        :disabled="loading || (activeCmd.needsCode && !code)"
        @click="run()"
      >
        {{ loading ? '查询中…' : '刷新数据' }}
      </button>
    </div>

    <p v-if="activeCmd.needsCode && !code" class="ws-finance-hint" role="status">
      请先通过股票查询选择标的，再查看{{ title }}。
    </p>
    <WestockResult
      v-else-if="!financeHint"
      :result="displayResult"
      :can-load-more="false"
      :loading="loading"
      :error="error"
      :unauthorized="unauthorized"
    />
  </section>
</template>

<style scoped>
.ws-stock {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 16px;
}
.ws-finance-hint {
  padding: 24px;
  border: 1px dashed var(--border-light);
  border-radius: 16px;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.6;
}
.ws-stock-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.ws-eyebrow {
  color: #0f766e;
  font-size: var(--font-size-caption);
  font-weight: 700;
}
.ws-stock-head h2 {
  margin: 4px 0 2px;
  font-size: var(--font-size-heading);
}
.ws-stock-head p {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.6;
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
.ws-target span {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.ws-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: var(--bg-card);
}
.ws-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.ws-field > span {
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 600;
}
.ws-project {
  flex: 0 1 260px;
}
.ws-filter {
  flex: 0 1 164px;
}
.ws-run {
  height: 42px;
  margin-left: auto;
  padding: 0 18px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-size-small);
  font-weight: 600;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.ws-run:hover:not(:disabled) {
  border-color: var(--text-muted);
  background: var(--bg-hover);
}
.ws-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ws-run:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 3px;
}
@media (max-width: 760px) {
  .ws-stock-head {
    gap: 12px;
  }
  .ws-stock-head > div:first-child {
    flex: 1 1 220px;
  }
  .ws-target {
    align-items: flex-start;
  }
  .ws-toolbar {
    gap: 12px;
    padding: 14px;
  }
  .ws-project {
    flex: 1 1 100%;
  }
  .ws-filter {
    flex: 1 1 130px;
  }
}
</style>
