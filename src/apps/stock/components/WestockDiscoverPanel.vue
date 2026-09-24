<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { westockCommand, westockExec } from '@/stores/westock'
import type { WestockResult as WestockResultData } from '@/stores/westock'
import { useToast } from '@/composables/useToast'
import WestockResult from './WestockResult.vue'

defineOptions({ name: 'WestockDiscoverPanel' })

const { addToast } = useToast()

interface CatItem {
  group: string
  id: string
  name: string
}
type Section = 'strategy' | 'ranking' | 'filter' | 'label' | 'event' | 'search'

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'strategy', label: '策略选股' },
  { id: 'ranking', label: '排行榜' },
  { id: 'filter', label: '高级筛选' },
  { id: 'label', label: '标签选股' },
  { id: 'event', label: '事件选股' },
  { id: 'search', label: '全局搜索' },
]

const activeSection = ref<Section>('strategy')

const catalogs = reactive<Record<string, CatItem[]>>({})
const catalogLoading = ref(true)
const catalogError = ref<string | null>(null)

const result = ref<WestockResultData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// 通用筛选项
const commonDate = ref('')
const asset = ref<'stock' | 'etf'>('stock')
const market = ref<'hs' | 'hk' | 'us'>('hs')
const asc = ref(false)

// 各 section 的当前选择
const sel = reactive<Record<string, string>>({
  strategy: '',
  ranking: '',
  filter: '',
  label: '',
  event: '',
  search: '',
})

function parseList(text: string, mode: 'strategy' | 'label' | 'event' | 'ranking' | 'filter'): CatItem[] {
  const items: CatItem[] = []
  let group = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, ' ')
    if (mode === 'filter') {
      const m = line.match(/^\s{2}([A-Za-z]\w*)\s*$/)
      if (m) items.push({ group: '', id: m[1], name: m[1] })
      continue
    }
    if (line.startsWith('# ')) {
      group = line.slice(2).trim()
      continue
    }
    if (mode === 'ranking') {
      const mg = line.match(/^【(.+?)】/)
      if (mg) {
        group = mg[1]
        continue
      }
      const m = line.match(/^\s{4}(\S+)\s+(.+?)\s*$/)
      if (m) items.push({ group, id: m[1], name: m[2] })
      continue
    }
    const m = line.match(/^\s{2}(\S+)\s+(.+?)\s*$/)
    if (m) items.push({ group, id: m[1], name: m[2] })
  }
  return items
}

function grouped(items: CatItem[]): Array<{ group: string; items: CatItem[] }> {
  const map = new Map<string, CatItem[]>()
  for (const it of items) {
    if (!map.has(it.group)) map.set(it.group, [])
    map.get(it.group)!.push(it)
  }
  return [...map.entries()].map(([group, its]) => ({ group, items: its }))
}

const strategyGroups = computed(() => grouped(catalogs.strategy ?? []))
const rankingGroups = computed(() => grouped(catalogs.ranking ?? []))
const labelGroups = computed(() => grouped(catalogs.label ?? []))
const eventGroups = computed(() => grouped(catalogs.event ?? []))
const filterPresets = computed(() => catalogs.filter ?? [])

async function loadCatalogs() {
  catalogLoading.value = true
  catalogError.value = null
  const tasks: Array<[string, Section | 'filter', string[]]> = [
    ['strategy', 'strategy', ['strategy', '--list']],
    ['ranking', 'ranking', ['ranking', '--list']],
    ['label', 'label', ['label', '--list']],
    ['event', 'event', ['event', '--list']],
    ['filter', 'filter', ['filter', '--list-presets']],
  ]
  try {
    const results = await Promise.all(
      tasks.map(([key, , args]) => westockExec('screen', args).then((r) => [key, r] as const)),
    )
    for (const [key, r] of results) {
      const text = r.kind === 'text' ? r.text ?? '' : JSON.stringify(r.data ?? '')
      catalogs[key] = parseList(text, key as 'strategy' | 'label' | 'event' | 'ranking' | 'filter')
    }
    if (!sel.strategy && catalogs.strategy?.length) sel.strategy = catalogs.strategy[0].id
    if (!sel.ranking && catalogs.ranking?.length) sel.ranking = catalogs.ranking[0].id
    if (!sel.filter && catalogs.filter?.length) sel.filter = catalogs.filter[0].id
    if (!sel.event && catalogs.event?.length) sel.event = catalogs.event[0].id
  } catch (e) {
    catalogError.value = e instanceof Error ? e.message : '目录加载失败'
  } finally {
    catalogLoading.value = false
  }
}

async function run(cmd: Section | 'advanced', extra: Record<string, string> = {}) {
  loading.value = true
  error.value = null
  try {
    const res = await westockCommand(cmd, extra)
    result.value = res
    if (!res.success) error.value = res.error || '请求未成功'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '请求失败'
  } finally {
    loading.value = false
  }
}

function runStrategy() {
  if (!sel.strategy) return
  const p: Record<string, string> = { id: sel.strategy }
  if (commonDate.value) p.date = commonDate.value
  void run('strategy', p)
}
function runRanking() {
  if (!sel.ranking) return
  const p: Record<string, string> = {
    metric: sel.ranking,
    asset: asset.value,
    limit: '20',
  }
  if (asc.value) p.asc = '1'
  void run('ranking', p)
}
function runFilter() {
  if (!sel.filter) return
  const p: Record<string, string> = { preset: sel.filter, market: market.value }
  if (commonDate.value) p.date = commonDate.value
  void run('filter', p)
}
function runLabel() {
  if (!sel.label) return
  const id = sel.label.trim().split(/\s|\(/)[0]
  const p: Record<string, string> = { id, asset: asset.value }
  if (commonDate.value) p.date = commonDate.value
  void run('label', p)
}
function runEvent() {
  if (!sel.event) return
  void run('event', { id: sel.event, limit: '20' })
}
function runSearch() {
  if (!sel.search.trim()) return
  void run('search', { q: sel.search.trim(), limit: '10' })
}

// 高级模式：直接拼接参数
const advEngine = ref<'data' | 'screen'>('data')
const advArgs = ref('')

async function runAdvanced() {
  const args = advArgs.value.trim().split(/\s+/).filter(Boolean)
  if (!args.length) {
    addToast('error', '请输入命令参数')
    return
  }
  loading.value = true
  error.value = null
  try {
    const res = await westockExec(advEngine.value, args)
    result.value = res
    if (!res.success) error.value = res.error || '请求未成功'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '请求失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadCatalogs)
</script>

<template>
  <section class="ws-discover">
    <header class="ws-disc-head">
      <span class="ws-eyebrow">WESTOCK · 数据发现</span>
      <h2>选股与发现</h2>
      <p>从策略、排行、筛选、标签、事件中挑选条件，结果由腾讯 westock 网关实时返回。</p>
    </header>

    <nav class="ws-tabs" aria-label="发现类型">
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        type="button"
        :class="{ active: activeSection === s.id }"
        @click="activeSection = s.id"
      >
        {{ s.label }}
      </button>
    </nav>

    <div v-if="catalogLoading" class="ws-state">
      <span class="ws-spinner"></span>
      <p>正在加载可选策略 / 指标目录…</p>
    </div>
    <div v-else-if="catalogError" class="ws-state error">
      <span>!</span>
      <p>{{ catalogError }}</p>
      <button type="button" @click="loadCatalogs">重试</button>
    </div>

    <template v-else>
      <!-- 策略选股 -->
      <div v-if="activeSection === 'strategy'" class="ws-controls">
        <label class="ws-field grow">
          <span>策略</span>
          <select v-model="sel.strategy" @change="runStrategy">
            <optgroup v-for="g in strategyGroups" :key="g.group" :label="g.group">
              <option v-for="it in g.items" :key="it.id" :value="it.id">
                {{ it.name }}（{{ it.id }}）
              </option>
            </optgroup>
          </select>
        </label>
        <label class="ws-field">
          <span>日期（可选）</span>
          <input v-model="commonDate" type="date" @change="runStrategy" />
        </label>
        <button type="button" class="ws-run" @click="runStrategy">运行选股</button>
      </div>

      <!-- 排行榜 -->
      <div v-else-if="activeSection === 'ranking'" class="ws-controls">
        <label class="ws-field grow">
          <span>排行指标</span>
          <select v-model="sel.ranking" @change="runRanking">
            <optgroup v-for="g in rankingGroups" :key="g.group" :label="g.group">
              <option v-for="it in g.items" :key="it.id" :value="it.id">
                {{ it.name }}（{{ it.id }}）
              </option>
            </optgroup>
          </select>
        </label>
        <label class="ws-field">
          <span>资产</span>
          <select v-model="asset" @change="runRanking">
            <option value="stock">股票</option>
            <option value="etf">ETF</option>
          </select>
        </label>
        <label class="ws-field ws-check">
          <input v-model="asc" type="checkbox" @change="runRanking" />
          <span>升序</span>
        </label>
        <button type="button" class="ws-run" @click="runRanking">运行排行</button>
      </div>

      <!-- 高级筛选 -->
      <div v-else-if="activeSection === 'filter'" class="ws-controls">
        <label class="ws-field grow">
          <span>预设条件</span>
          <select v-model="sel.filter" @change="runFilter">
            <option v-for="it in filterPresets" :key="it.id" :value="it.id">
              {{ it.name }}
            </option>
          </select>
        </label>
        <label class="ws-field">
          <span>市场</span>
          <select v-model="market" @change="runFilter">
            <option value="hs">沪深</option>
            <option value="hk">港股</option>
            <option value="us">美股</option>
          </select>
        </label>
        <label class="ws-field">
          <span>日期（可选）</span>
          <input v-model="commonDate" type="date" @change="runFilter" />
        </label>
        <button type="button" class="ws-run" @click="runFilter">运行筛选</button>
      </div>

      <!-- 标签选股 -->
      <div v-else-if="activeSection === 'label'" class="ws-controls">
        <label class="ws-field grow">
          <span>标签（输入可搜索，如 valuation_lowpb）</span>
          <input v-model="sel.label" list="label-list" placeholder="输入或选择标签" @change="runLabel" />
          <datalist id="label-list">
            <option v-for="it in catalogs.label" :key="it.id" :value="it.id">
              {{ it.name }}
            </option>
          </datalist>
        </label>
        <label class="ws-field">
          <span>资产</span>
          <select v-model="asset" @change="runLabel">
            <option value="stock">股票</option>
            <option value="etf">ETF</option>
          </select>
        </label>
        <label class="ws-field">
          <span>日期（可选）</span>
          <input v-model="commonDate" type="date" @change="runLabel" />
        </label>
        <button type="button" class="ws-run" @click="runLabel">运行</button>
      </div>

      <!-- 事件选股 -->
      <div v-else-if="activeSection === 'event'" class="ws-controls">
        <label class="ws-field grow">
          <span>事件</span>
          <select v-model="sel.event" @change="runEvent">
            <optgroup v-for="g in eventGroups" :key="g.group" :label="g.group">
              <option v-for="it in g.items" :key="it.id" :value="it.id">
                {{ it.name }}（{{ it.id }}）
              </option>
            </optgroup>
          </select>
        </label>
        <button type="button" class="ws-run" @click="runEvent">运行</button>
      </div>

      <!-- 全局搜索 -->
      <div v-else-if="activeSection === 'search'" class="ws-controls">
        <label class="ws-field grow">
          <span>关键词 / 代码</span>
          <input v-model="sel.search" placeholder="如 茅台 / 600519" @keyup.enter="runSearch" />
        </label>
        <button type="button" class="ws-run" @click="runSearch">搜索</button>
      </div>

      <WestockResult :result="result" :loading="loading" :error="error" />

      <details class="ws-advanced">
        <summary>高级模式（直接拼接 westock 参数）</summary>
        <div class="ws-adv-body">
          <label class="ws-field">
            <span>引擎</span>
            <select v-model="advEngine">
              <option value="data">data</option>
              <option value="screen">screen</option>
            </select>
          </label>
          <label class="ws-field grow">
            <span>参数（空格分隔）</span>
            <input v-model="advArgs" placeholder="如 kline sh600519 --period day --limit 10" />
          </label>
          <button type="button" class="ws-run" @click="runAdvanced">执行</button>
        </div>
      </details>
    </template>

    <p class="ws-foot">数据来自腾讯 westock 网关，仅供研究学习，不构成投资建议。</p>
  </section>
</template>

<style scoped>
.ws-discover {
  display: grid;
  gap: 14px;
}
.ws-eyebrow {
  color: #0f766e;
  font-size: var(--font-size-caption);
  font-weight: 900;
  letter-spacing: 0.15em;
}
.ws-disc-head h2 {
  margin: 4px 0 2px;
  font-size: var(--font-size-heading);
}
.ws-disc-head p {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
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
.ws-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
}
.ws-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-caption);
  color: var(--text-muted);
}
.ws-field.grow {
  flex: 1 1 240px;
}
.ws-field select,
.ws-field input {
  height: 36px;
  min-width: 140px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
}
.ws-field.grow input,
.ws-field.grow select {
  width: 100%;
}
.ws-check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-bottom: 9px;
}
.ws-run {
  height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  color: #fff;
  cursor: pointer;
  font-weight: 800;
}
.ws-advanced {
  border: 1px dashed var(--border-light);
  border-radius: 14px;
  padding: 10px 14px;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}
.ws-advanced summary {
  cursor: pointer;
  font-weight: 700;
}
.ws-adv-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-top: 10px;
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
.ws-state button {
  padding: 6px 14px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
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
.ws-foot {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  text-align: center;
}
</style>
