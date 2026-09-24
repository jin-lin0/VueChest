<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import type { WestockResult, WestockTableRow } from '@/stores/westock'
import type { KlineData } from '@/stores/stock'

const StockChart = defineAsyncComponent(() => import('./StockChart.vue'))

const props = defineProps<{
  result: WestockResult | null
  loading?: boolean
  error?: string | null
  unauthorized?: boolean
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
      <p>选择一个能力并运行，结果会显示在这里。</p>
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
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in rows" :key="i">
                  <td
                    v-for="col in columns"
                    :key="col"
                    :class="cellClass(col, row[col] ?? '')"
                  >
                    {{ row[col] ?? '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <small class="ws-count">共 {{ rows.length }} 条</small>
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
}
.ws-table th,
.ws-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
  white-space: nowrap;
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
.ws-count {
  display: block;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
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
