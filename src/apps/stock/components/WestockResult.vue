<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import type { WestockResult, WestockTableRow } from '@/stores/westock'
import type { KlineData } from '@/stores/stock'
import { hasMorePages, parseResultPage, pickRowCode, pickRowName } from '../westock-discover'

const StockChart = defineAsyncComponent(() => import('./StockChart.vue'))

const props = defineProps<{
  result: WestockResult | null
  loading?: boolean
  error?: string | null
  unauthorized?: boolean
  /** 代码是否已在自选里，用于行内 ☆ 的状态。传入该函数才渲染自选按钮。 */
  isFavorite?: (code: string) => boolean
  /** 有下一页。父级显式传入时以其为准，否则回落到从 meta 推断。 */
  canLoadMore?: boolean
  loadingMore?: boolean
}>()

const emit = defineEmits<{
  /** 点击行：进入该股票的研究视图。 */
  pick: [code: string]
  /** 点击行内 ☆：切换自选，附带从表格里取到的名称（取不到时为空串）。 */
  toggleFavorite: [code: string, name: string]
  loadMore: []
}>()

const isKline = computed(() => {
  if (!props.result || props.result.kind !== 'json') return false
  const data = props.result.data
  if (!Array.isArray(data) || data.length === 0) return false
  const sample = data[0] as Record<string, unknown>
  return (
    'date' in sample &&
    'open' in sample &&
    ('last' in sample || 'close' in sample) &&
    'high' in sample &&
    'low' in sample
  )
})

const klineData = computed<KlineData[]>(() => {
  if (!isKline.value) return []
  const arr = props.result!.data as Array<Record<string, unknown>>
  return arr
    .map((b) => ({
      date: String(b.date),
      open: String(b.open),
      close: String(b.last ?? b.close),
      high: String(b.high),
      low: String(b.low),
      volume: String(b.volume ?? ''),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
})

const columns = computed<string[]>(() => props.result?.columns ?? [])
const rows = computed<WestockTableRow[]>(() => props.result?.rows ?? [])
const meta = computed(() => props.result?.meta ?? '')
const titleText = computed(() => props.result?.title ?? '')

const page = computed(() => parseResultPage(meta.value, rows.value.length))
// 父级显式传 canLoadMore 时以父级为准（它知道是否还有下一页），
// 否则回落到从 meta 推断，兼容个股深度面板等未接分页的调用方。
const showLoadMore = computed(() => props.canLoadMore ?? hasMorePages(page.value))

/** 每行能否点开：认得出 6 位代码才行，认不出就保持纯文本。 */
const rowCodes = computed<Array<string | null>>(() =>
  rows.value.map((row) => pickRowCode(row as Record<string, string>)),
)
/** 表里存在可点行时才提示「点行进研究」，避免在无代码的表上给无效指引。 */
const hasClickableRow = computed(() => rowCodes.value.some(Boolean))

function cellNumeric(value: string): boolean {
  if (value == null) return false
  const s = String(value).replace(/[,%\s]/g, '')
  return s !== '' && Number.isFinite(Number(s))
}
function isChangeColumn(name: string): boolean {
  return /涨|跌|change|幅|变动|增减|升贴|盈亏/i.test(name)
}
function changeSign(value: string): number {
  const n = Number(String(value).replace(/[,%\s]/g, ''))
  if (!Number.isFinite(n)) return 0
  return n > 0 ? 1 : n < 0 ? -1 : 0
}
function cellClass(col: string, value: string): string {
  const cls: string[] = []
  if (cellNumeric(value)) cls.push('num')
  if (isChangeColumn(col)) {
    const sign = changeSign(value)
    if (sign > 0) cls.push('up')
    else if (sign < 0) cls.push('down')
  }
  return cls.join(' ')
}

function selectRow(index: number) {
  const code = rowCodes.value[index]
  if (code) emit('pick', code)
}

function toggleStar(index: number) {
  const code = rowCodes.value[index]
  if (!code) return
  const row = rows.value[index] as Record<string, string>
  emit('toggleFavorite', code, pickRowName(row, code))
}

async function copyRaw() {
  if (!props.result) return
  const text =
    props.result.kind === 'json'
      ? JSON.stringify(props.result.data, null, 2)
      : props.result.text ||
        [titleText.value, meta.value, ...rows.value.map((r) => columns.value.map((c) => r[c]).join('\t'))].join('\n')
  await navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="ws-result">
    <div v-if="loading" class="ws-state">
      <span class="ws-spinner"></span>
      <p>正在向腾讯 westock 网关请求数据…</p>
    </div>

    <div v-else-if="error" class="ws-state error">
      <span>!</span>
      <p>{{ error }}</p>
      <RouterLink v-if="unauthorized" class="ws-login" to="/login">去登录</RouterLink>
    </div>

    <div v-else-if="!result" class="ws-state">
      <p>选一个条件，或直接点上面的常用策略，结果会显示在这里。</p>
    </div>

    <template v-else>
      <div v-if="isKline" class="ws-chart">
        <StockChart :data="klineData" selected-date="" />
      </div>

      <template v-else-if="result.kind === 'table'">
        <div v-if="!rows.length" class="ws-state">
          <p>该查询暂无数据（可能当天无信号或参数不匹配）。</p>
        </div>
        <div v-else class="ws-table-wrap">
          <div v-if="titleText || meta" class="ws-table-meta">
            <strong v-if="titleText">{{ titleText }}</strong>
            <small v-if="meta">{{ meta }}</small>
          </div>
          <div class="ws-table-scroll">
            <table class="ws-table">
              <thead>
                <tr>
                  <th v-for="col in columns" :key="col" :class="{ num: false }">{{ col }}</th>
                  <th v-if="isFavorite" class="ws-star-col" aria-label="自选"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in rows"
                  :key="i"
                  :class="{ clickable: !!rowCodes[i] }"
                  @click="selectRow(i)"
                >
                  <td
                    v-for="col in columns"
                    :key="col"
                    :class="cellClass(col, row[col] ?? '')"
                    :title="row[col] ?? ''"
                  >
                    {{ row[col] ?? '' }}
                  </td>
                  <td v-if="isFavorite" class="ws-star-col">
                    <button
                      v-if="rowCodes[i]"
                      type="button"
                      class="ws-row-star"
                      :class="{ on: isFavorite(rowCodes[i]!) }"
                      :aria-label="isFavorite(rowCodes[i]!) ? '移出自选' : '加入自选'"
                      @click.stop="toggleStar(i)"
                    >
                      {{ isFavorite(rowCodes[i]!) ? '★' : '☆' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ws-table-foot">
            <small class="ws-count">
              已显示 {{ rows.length }} 条<template v-if="page.total"> / 共 {{ page.total }} 只</template>
            </small>
            <button
              v-if="showLoadMore"
              type="button"
              class="ws-more"
              :disabled="loadingMore"
              @click="emit('loadMore')"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
          </div>
          <p v-if="hasClickableRow" class="ws-hint">点击任意一行，直接进入该股票的行情、财务与公告研究。</p>
        </div>
      </template>

      <div v-else-if="result.kind === 'json'" class="ws-pre-wrap">
        <pre class="ws-pre">{{ JSON.stringify(result.data, null, 2) }}</pre>
      </div>

      <pre v-else class="ws-pre">{{ result.text }}</pre>

      <button type="button" class="ws-copy" @click="copyRaw">复制原始数据</button>
    </template>
  </div>
</template>

<style scoped>
.ws-result {
  position: relative;
  min-height: 120px;
}
.ws-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  min-height: 160px;
  padding: 24px;
  border: 1px dashed var(--border-light);
  border-radius: 16px;
  color: var(--text-muted);
  text-align: center;
  font-size: var(--font-size-small);
}
.ws-state.error {
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  background: var(--danger-bg);
  color: var(--danger);
}
.ws-state span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-subtle);
  font-weight: 900;
}
.ws-login {
  padding: 6px 16px;
  border-radius: 9px;
  background: #0f766e;
  color: #fff;
  font-size: var(--font-size-caption);
  font-weight: 700;
  text-decoration: none;
}
.ws-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-light);
  border-top-color: #0f766e;
  border-radius: 50%;
  animation: ws-spin 0.8s linear infinite;
}
@keyframes ws-spin {
  to {
    transform: rotate(360deg);
  }
}
.ws-chart {
  border: 1px solid var(--border-light);
  border-radius: 18px;
  overflow: hidden;
  background: var(--bg-card);
}
.ws-table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 16px;
  padding: 14px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
}
.ws-table-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}
.ws-table-meta strong {
  font-size: var(--font-size-body);
}
.ws-table-meta small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.ws-table-scroll {
  overflow: auto;
  max-height: 520px;
}
.ws-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-meta);
  /* 固定列宽：auto 布局下字重变化会重新计算列宽，鼠标划过时整行会左右抖动。
     列宽在下面的 nth-child 规则里逐列给定。 */
  table-layout: fixed;
}
.ws-table th,
.ws-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* table-layout:fixed 下必须给每列宽度，否则全挤在第一列。
   首列（代码）给足，其余列均分剩余宽度。 */
.ws-table th:nth-child(1),
.ws-table td:nth-child(1) {
  width: 108px;
}
.ws-table th:not(:first-child):not(.ws-star-col),
.ws-table td:not(:first-child):not(.ws-star-col) {
  width: 116px;
}
.ws-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 800;
  border-bottom: 1px solid var(--border);
}
.ws-table tbody tr:hover {
  background: var(--bg-hover);
}
/* 认得出代码的行才是可点的，用光标提示可交互 */
.ws-table tbody tr.clickable {
  cursor: pointer;
}
/* 加粗是常态而不是 hover 态：hover 时才加粗会撑宽单元格，把整行往右推，
   鼠标移动时列就跟着抖。字重固定后，hover 只换颜色，不动布局。 */
.ws-table tbody tr.clickable td:first-child {
  color: #0f766e;
  font-weight: 700;
}
.ws-table tbody tr.clickable:hover td:first-child {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ws-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ws-table td.up {
  color: var(--stock-up);
  font-weight: 700;
}
.ws-table td.down {
  color: var(--stock-down);
  font-weight: 700;
}
.ws-star-col {
  width: 34px;
  padding-inline: 4px !important;
  text-align: center !important;
}
.ws-row-star {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-size-body);
  line-height: 1;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
}
.ws-row-star:hover {
  background: var(--bg-hover);
  color: #e8a317;
}
.ws-row-star.on {
  color: #e8a317;
}
.ws-table-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}
.ws-count {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.ws-more {
  padding: 6px 14px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
  font-weight: 700;
  cursor: pointer;
}
.ws-more:hover:not(:disabled) {
  border-color: #0f766e;
  color: #0f766e;
}
.ws-more:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ws-hint {
  margin-top: 8px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  text-align: center;
}
.ws-pre-wrap,
.ws-pre {
  margin: 0;
}
.ws-pre {
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 14px;
  background: var(--bg-page);
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 520px;
  overflow: auto;
}
.ws-copy {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 10px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  cursor: pointer;
  opacity: 0.85;
}
.ws-copy:hover {
  opacity: 1;
  color: #0f766e;
}
</style>
