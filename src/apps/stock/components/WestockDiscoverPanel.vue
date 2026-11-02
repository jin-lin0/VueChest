<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { isWestockAuthError, westockCommand, westockExec } from '@/stores/westock'
import type { WestockResult as WestockResultData } from '@/stores/westock'
import { useStockStore } from '@/stores/stock'
import { getStorage, setStorage } from '@/lib/storage'
import { STORAGE_KEYS } from '@/config'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { useToast } from '@/composables/useToast'
import {
  CATALOG_SPECS,
  DISCOVER_SECTIONS,
  HOT_ITEMS,
  flattenOptions,
  groupCatalog,
  hasMorePages,
  isRangeValid,
  parseCatalog,
  parseResultPage,
  sanitizeDiscoverFormState,
  sectionSupportsDate,
  sectionSupportsRange,
  type CatalogGroup,
  type DiscoverSection,
} from '../westock-discover'
import { clearCatalogCache, readCatalogCache, writeCatalogCache } from '../westock-catalog-cache'
import WestockResult from './WestockResult.vue'

defineOptions({ name: 'WestockDiscoverPanel' })

const emit = defineEmits<{
  /** 选中一只股票，交给父级切到研究视图。 */
  openStock: [code: string]
}>()

const { addToast } = useToast()
const stock = useStockStore()
const route = useRoute()

const activeSection = ref<DiscoverSection>('strategy')

/** 路由带来的预选条件：?preset=<id>，由 App.vue 的空态快捷入口写入。 */
const preset = computed(() => {
  const raw = route.query.preset
  return typeof raw === 'string' ? raw : ''
})

const catalogs = reactive<Record<string, CatalogGroup[]>>({})
const catalogLoading = ref(true)
const catalogError = ref<string | null>(null)
const catalogUnauthorized = ref(false)
/** 本次目录来自缓存（而非实时请求），用于在界面上说明并提供刷新入口。 */
const catalogFromCache = ref(false)

const result = ref<WestockResultData | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const unauthorized = ref(false)
let requestId = 0

// 通用筛选项
const commonDate = ref('')
/** 区间起止，仅 strategy / label 会用到（其余分类 CLI 只接受单日）。 */
const dateStart = ref('')
const dateEnd = ref('')
const asset = ref<'stock' | 'etf'>('stock')
const market = ref<'hs' | 'hk' | 'us'>('hs')

// 各 section 的当前选择
const sel = reactive<Record<string, string>>({
  strategy: '',
  ranking: '',
  filter: '',
  label: '',
  event: '',
  search: '',
})

// 翻页：CLI 用 --offset，配合 limit 递增
const PAGE_SIZE = 20
const offset = ref(0)
const canLoadMore = computed(() =>
  hasMorePages(parseResultPage(result.value?.meta ?? '', result.value?.rows?.length ?? 0)),
)

const sectionMeta = computed(() => DISCOVER_SECTIONS.find((s) => s.id === activeSection.value)!)

/** 当前 section 的完整目录（分组结构）。 */
const currentGroups = computed<CatalogGroup[]>(() => catalogs[activeSection.value] ?? [])

/**
 * 拍平后的可搜索选项。label 带「分组 · 名称」，
 * 这样 CustomSelect 搜「技术面」「金叉」「ROE」都能命中。
 */
const currentOptions = computed<SelectOption[]>(() => flattenOptions(currentGroups.value))

/** 首屏常用项，目录还没加载完也能点。 */
const hotItems = computed(
  () => HOT_ITEMS[activeSection.value as Exclude<DiscoverSection, 'search'>] ?? [],
)

const hasOptions = computed(() => currentOptions.value.length > 0)

const assetOptions: SelectOption[] = [
  { value: 'stock', label: '股票' },
  { value: 'etf', label: 'ETF' },
]
const marketOptions: SelectOption[] = [
  { value: 'hs', label: '沪深' },
  { value: 'hk', label: '港股' },
  { value: 'us', label: '美股' },
]
const orderOptions: SelectOption[] = [
  { value: 'desc', label: '从高到低' },
  { value: 'asc', label: '从低到高' },
]
const order = ref<string | number>('desc')

// ── 条件记忆 ─────────────────────────────────────────────────
// 面板被切走就会卸载，原先每次回来条件都回到默认值，用户得重新翻下拉框。
// 这里记住分类、条件与筛选器；只恢复表单，不自动发请求，避免白白消耗一次查询。
const savedForm = sanitizeDiscoverFormState(
  getStorage<unknown>(STORAGE_KEYS.STOCK_DISCOVER_STATE, null),
)
if (savedForm) {
  activeSection.value = savedForm.section
  Object.assign(sel, savedForm.sel)
  commonDate.value = savedForm.commonDate
  dateStart.value = savedForm.dateStart
  dateEnd.value = savedForm.dateEnd
  asset.value = savedForm.asset
  market.value = savedForm.market
  order.value = savedForm.order
}
const restoredFromStorage = ref(!!savedForm)

/** 某个分类的默认选项：优先热门项，其次目录第一项。 */
function defaultSelection(key: 'strategy' | 'ranking' | 'filter' | 'event' | 'label'): string {
  const hot = HOT_ITEMS[key]?.find((it) =>
    catalogs[key]?.some((g) => g.items.some((i) => i.id === it.id)),
  )
  return hot?.id || catalogs[key]?.[0]?.items[0]?.id || ''
}

/** 存储里记的条件可能已被上游下架，目录到位后把它收敛回可用值。 */
function reconcileSavedSelections() {
  for (const key of ['strategy', 'ranking', 'filter', 'event', 'label'] as const) {
    if (!catalogs[key]?.length || !sel[key]) continue
    if (!catalogs[key].some((g) => g.items.some((i) => i.id === sel[key]))) {
      sel[key] = defaultSelection(key)
    }
  }
}

/**
 * 当前表单是不是「什么都没改」的初始状态。
 * 目录就绪后会自动补上热门项，如果照抄落盘，用户明明没动过条件，
 * 下次进来也会看到「已恢复上次条件」。所以只有真正偏离默认值才保存。
 * 关键词输入属于临时动作，不参与判断。
 */
function isPristineConditions(state: {
  section: DiscoverSection
  sel: Record<string, string>
  commonDate: string
  dateStart: string
  dateEnd: string
  asset: 'stock' | 'etf'
  market: 'hs' | 'hk' | 'us'
  order: string | number
}): boolean {
  if (state.section !== 'strategy') return false
  if (state.commonDate || state.dateStart || state.dateEnd) return false
  if (state.asset !== 'stock' || state.market !== 'hs' || state.order !== 'desc') return false
  return (['strategy', 'ranking', 'filter', 'event', 'label'] as const).every(
    (key) => !state.sel[key] || state.sel[key] === defaultSelection(key),
  )
}

watch(
  () => ({
    section: activeSection.value,
    sel: { ...sel },
    commonDate: commonDate.value,
    dateStart: dateStart.value,
    dateEnd: dateEnd.value,
    asset: asset.value,
    market: market.value,
    order: order.value,
  }),
  (state) => {
    setStorage(STORAGE_KEYS.STOCK_DISCOVER_STATE, isPristineConditions(state) ? null : state)
  },
  { deep: true },
)

/** 恢复默认：分类与筛选条件一起回到初始状态。 */
function resetConditions() {
  activeSection.value = 'strategy'
  for (const key of Object.keys(sel)) sel[key] = ''
  for (const key of ['strategy', 'ranking', 'filter', 'event', 'label'] as const) {
    sel[key] = defaultSelection(key)
  }
  commonDate.value = ''
  dateStart.value = ''
  dateEnd.value = ''
  asset.value = 'stock'
  market.value = 'hs'
  order.value = 'desc'
  restoredFromStorage.value = false
  setStorage(STORAGE_KEYS.STOCK_DISCOVER_STATE, null)
}

async function loadCatalogs() {
  catalogLoading.value = true
  catalogError.value = null
  catalogUnauthorized.value = false
  catalogFromCache.value = false

  // 命中缓存直接铺目录，跳过 5 次 spawn。这是切 tab 卡顿的主因：
  // 面板每次挂载都要重新取一遍，而目录内容在一次会话里几乎不变。
  const cached = readCatalogCache()
  if (cached) {
    Object.assign(catalogs, cached)
    reconcileSavedSelections()
    catalogFromCache.value = true
    catalogLoading.value = false
    return
  }

  const failures: string[] = []
  const fetched: Record<string, CatalogGroup[]> = {}
  try {
    // 串行加载：每次 exec 都会在服务端 spawn 一个子进程，5 个并发会直接占满
    // 服务端的并发闸门，拖慢首屏并挤掉用户主动发起的查询。
    for (const spec of CATALOG_SPECS) {
      try {
        const r = await westockExec('screen', spec.args)
        const text = r.kind === 'text' ? (r.text ?? '') : JSON.stringify(r.data ?? '')
        const groups = groupCatalog(parseCatalog(text, spec.mode))
        catalogs[spec.key] = groups
        if (r.success) {
          fetched[spec.key] = groups
        } else {
          failures.push(spec.key)
        }
      } catch (e) {
        // 未登录时后续请求也必然失败，直接停下并给出登录入口。
        if (isWestockAuthError(e)) {
          catalogUnauthorized.value = true
          catalogError.value = e instanceof Error ? e.message : '请先登录后使用'
          return
        }
        // 单个目录取不到不该拖垮其余目录（例如某类策略当天无返回）。
        failures.push(spec.key)
      }
    }
    if (failures.length === CATALOG_SPECS.length) {
      catalogError.value = '目录加载失败，请稍后重试'
    } else if (!failures.length) {
      // 只有全部成功才写缓存：半套目录进了缓存，下次命中会让人以为某类没有可选项
      writeCatalogCache(fetched)
    }
  } finally {
    reconcileSavedSelections()
    catalogLoading.value = false
  }
}

/** 手动刷新目录：先清缓存再重取，用于怀疑选项过期时。 */
async function refreshCatalogs() {
  clearCatalogCache()
  await loadCatalogs()
}

// 目录到位后给每种类型一个合理默认值：优先热门项（含义直白），否则取第一项。
watch(
  () => catalogs,
  () => {
    for (const key of ['strategy', 'ranking', 'filter', 'event', 'label'] as const) {
      if (sel[key]) continue
      sel[key] = defaultSelection(key)
    }
  },
  { deep: true },
)

async function run(cmd: DiscoverSection | 'advanced', extra: Record<string, string> = {}) {
  const currentRequest = ++requestId
  loading.value = true
  loadingMore.value = false
  result.value = null
  error.value = null
  unauthorized.value = false
  offset.value = 0
  try {
    const res = await westockCommand(cmd, extra)
    if (currentRequest !== requestId) return
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

/** 合法日期区间优先，否则回退到单日参数，避免同时传递两种日期模式。 */
/** 区间填了一半或首尾颠倒时给出提示，而不是静默按单日跑。 */
const showRangeHint = computed(() => {
  if (!sectionSupportsRange(activeSection.value)) return false
  const touched = dateStart.value || dateEnd.value
  return touched && !isRangeValid(dateStart.value, dateEnd.value)
})

function clearDateRange() {
  dateStart.value = ''
  dateEnd.value = ''
}

function dateParams(): Record<string, string> {
  const section = activeSection.value
  if (sectionSupportsRange(section) && isRangeValid(dateStart.value, dateEnd.value)) {
    return { start: dateStart.value, end: dateEnd.value }
  }
  return commonDate.value ? { date: commonDate.value } : {}
}

function buildParams(): Record<string, string> | null {
  switch (activeSection.value) {
    case 'strategy': {
      if (!sel.strategy) return null
      return { id: sel.strategy, limit: String(PAGE_SIZE), ...dateParams() }
    }
    case 'ranking': {
      if (!sel.ranking) return null
      const p: Record<string, string> = {
        metric: sel.ranking,
        asset: asset.value,
        limit: String(PAGE_SIZE),
        ...dateParams(),
      }
      if (order.value === 'asc') p.asc = '1'
      return p
    }
    case 'filter': {
      if (!sel.filter) return null
      return { preset: sel.filter, market: market.value, ...dateParams() }
    }
    case 'label': {
      if (!sel.label) return null
      return { id: sel.label, asset: asset.value, ...dateParams() }
    }
    case 'event': {
      if (!sel.event) return null
      return { id: sel.event, limit: String(PAGE_SIZE), ...dateParams() }
    }
    case 'search': {
      const q = sel.search.trim()
      if (!q) return null
      return { q, limit: '10' }
    }
  }
}

/** 只把改动的那一项作为 v-model 绑定，避免一个 reactive 大对象在模板里难追踪。 */
const activeValue = computed<string | number>({
  get: () => sel[activeSection.value] || '',
  set: (v) => {
    sel[activeSection.value] = String(v)
  },
})

/** 换类型就清掉旧结果，否则上一类的表格会挂在新条件下误导用户。 */
function switchSection(id: DiscoverSection) {
  if (activeSection.value === id) return
  activeSection.value = id
  ++requestId
  loading.value = false
  loadingMore.value = false
  result.value = null
  error.value = null
  unauthorized.value = false
  offset.value = 0
}

function runCurrent() {
  if (activeSection.value === 'search') return runSearch()
  const p = buildParams()
  if (!p) return
  void run(activeSection.value, p)
}

function runSearch() {
  const p = buildParams()
  if (!p) {
    addToast('error', '请输入名称或代码')
    return
  }
  void run('search', p)
}

function selectHot(id: string) {
  sel[activeSection.value] = id
  runCurrent()
}

/** 点结果行 / 从结果加自选后，直接切到个股研究。 */
function openStock(code: string) {
  emit('openStock', code)
}

function toggleFavorite(code: string, name: string) {
  if (stock.isFavorite(code)) {
    stock.removeFavorite(code)
    addToast('success', '已移出自选')
    return
  }
  // 自选列表要显示名称，取不到时退回代码，不让用户看到一条无名项
  stock.addFavorite(code, name || code)
  addToast('success', '已加入自选')
}

async function loadMore() {
  if (loadingMore.value) return
  const p = buildParams()
  if (!p) return
  const currentRequest = requestId
  const section = activeSection.value
  loadingMore.value = true
  try {
    const next = offset.value + PAGE_SIZE
    const res = await westockCommand(section, { ...p, offset: String(next) })
    if (currentRequest !== requestId || section !== activeSection.value) return
    if (!res.success) {
      addToast('error', res.error || '加载更多失败')
      return
    }
    // 追加而非替换：CLI 每次都从 offset 起返回，不带累计语义。
    const prevRows = result.value?.rows ?? []
    const merged = [...prevRows, ...(res.rows ?? [])]
    result.value = { ...res, rows: merged }
    offset.value = next
  } catch (e) {
    if (currentRequest !== requestId) return
    addToast('error', e instanceof Error ? e.message : '加载更多失败')
  } finally {
    if (currentRequest === requestId) loadingMore.value = false
  }
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
  const currentRequest = ++requestId
  loading.value = true
  loadingMore.value = false
  result.value = null
  error.value = null
  unauthorized.value = false
  try {
    const res = await westockExec(advEngine.value, args)
    if (currentRequest !== requestId) return
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

/**
 * preset 反查所属分类。空态快捷入口只给了 id（「MACD金叉」属于策略、
 * 「综合评分TOP」属于排行榜），这里用 HOT_ITEMS 做一次归属判定，
 * 不在常用项里就按目录实际收录情况兜底判断。
 */
function resolveSectionOf(id: string): DiscoverSection | null {
  if (!id) return null
  for (const [section, items] of Object.entries(HOT_ITEMS)) {
    if (items.some((it) => it.id === id)) return section as DiscoverSection
  }
  for (const [key, groups] of Object.entries(catalogs)) {
    if (groups.some((g) => g.items.some((it) => it.id === id))) return key as DiscoverSection
  }
  return null
}

/** 目录到位后消费一次 preset：切到对应分类、预选条件并直接跑。 */
let presetHandled = ''
function applyPreset() {
  if (!preset.value || presetHandled === preset.value) return
  const section = resolveSectionOf(preset.value)
  if (!section) return
  presetHandled = preset.value
  activeSection.value = section
  sel[section] = preset.value
  restoredFromStorage.value = false
  runCurrent()
}

onMounted(loadCatalogs)

// 目录就绪后再消费 preset。
// 首次挂载时 preset 已经在 URL 里，普通 watch 不会触发；而目录加载期间 preset
// 变化时也必须等目录到位，否则 resolveSectionOf 找不到归属，快捷入口会没反应。
watch(
  [catalogLoading, preset],
  () => {
    if (catalogLoading.value) return
    applyPreset()
  },
  { immediate: true },
)
</script>

<template>
  <section class="ws-discover">
    <header class="ws-disc-head">
      <span class="ws-eyebrow">选股发现</span>
      <h2>从条件直接筛出候选股票</h2>
      <p>{{ sectionMeta.hint }}。点结果任意一行即可进入该股票的行情、财务与公告研究。</p>
      <p v-if="restoredFromStorage" class="ws-restored">
        已恢复上次使用的分类与筛选条件
        <button type="button" @click="resetConditions">恢复默认</button>
      </p>
    </header>

    <nav class="ws-tabs" aria-label="发现类型">
      <button
        v-for="s in DISCOVER_SECTIONS"
        :key="s.id"
        type="button"
        :class="{ active: activeSection === s.id }"
        @click="switchSection(s.id)"
      >
        {{ s.label }}
      </button>
      <button
        class="ws-refresh"
        type="button"
        title="重新从服务端拉取策略 / 指标目录"
        @click="refreshCatalogs"
      >
        ↻ 刷新目录
      </button>
    </nav>

    <div v-if="catalogLoading" class="ws-state">
      <span class="ws-spinner"></span>
      <p>正在加载可选策略 / 指标目录…</p>
    </div>
    <div v-else-if="catalogError" class="ws-state error">
      <span>!</span>
      <p>{{ catalogError }}</p>
      <RouterLink v-if="catalogUnauthorized" class="ws-login" to="/login">去登录</RouterLink>
      <button v-else type="button" @click="loadCatalogs">重试</button>
    </div>

    <template v-else>
      <!-- 搜索类型：只有一个输入框，不套用目录选择器 -->
      <div v-if="activeSection === 'search'" class="ws-controls">
        <label class="ws-field grow">
          <span>名称 / 代码</span>
          <input
            v-model="sel.search"
            placeholder="如 贵州茅台 或 600519"
            @keyup.enter="runSearch"
          />
        </label>
        <button type="button" class="ws-run" @click="runSearch">搜索</button>
      </div>

      <div v-else class="ws-controls">
        <label class="ws-field grow">
          <span>{{
            activeSection === 'filter'
              ? '预设条件'
              : activeSection === 'label'
                ? '标签'
                : activeSection === 'ranking'
                  ? '排行指标'
                  : activeSection === 'event'
                    ? '事件'
                    : '策略'
          }}</span>
          <CustomSelect
            v-model="activeValue"
            :options="currentOptions"
            searchable
            block
            :placeholder="hasOptions ? '搜索名称或分组…' : '暂无可选项'"
            @change="runCurrent"
          />
        </label>

        <label v-if="activeSection === 'filter'" class="ws-field">
          <span>市场</span>
          <CustomSelect v-model="market" :options="marketOptions" @change="runCurrent" />
        </label>

        <label v-if="activeSection === 'ranking'" class="ws-field">
          <span>资产</span>
          <CustomSelect v-model="asset" :options="assetOptions" @change="runCurrent" />
        </label>

        <label v-if="activeSection === 'ranking'" class="ws-field">
          <span>排序</span>
          <CustomSelect v-model="order" :options="orderOptions" @change="runCurrent" />
        </label>

        <!-- 日期：支持区间的分类给起止两格，仅支持单日的给一个 date -->
        <template v-if="sectionSupportsRange(activeSection)">
          <label class="ws-field">
            <span>起始日期</span>
            <input v-model="dateStart" type="date" @change="runCurrent" />
          </label>
          <label class="ws-field">
            <span>结束日期</span>
            <input v-model="dateEnd" type="date" :min="dateStart" @change="runCurrent" />
          </label>
          <button
            v-if="dateStart || dateEnd"
            type="button"
            class="ws-clear"
            title="清除日期区间"
            @click="clearDateRange"
          >
            清除
          </button>
        </template>
        <label v-else-if="sectionSupportsDate(activeSection)" class="ws-field">
          <span>日期（可选）</span>
          <input v-model="commonDate" type="date" @change="runCurrent" />
        </label>

        <button type="button" class="ws-run" :disabled="!sel[activeSection]" @click="runCurrent">
          {{ activeSection === 'ranking' ? '查看排行' : '开始选股' }}
        </button>
      </div>

      <p v-if="showRangeHint" class="ws-date-hint">
        区间模式下会列出区间内每个命中日的信号；只想看某一天请清空区间。
      </p>

      <!-- 常用项：省掉翻下拉框，尤其是策略/标签这类上百项的目录 -->
      <div v-if="hotItems.length" class="ws-hot">
        <span class="ws-hot-label">常用</span>
        <div class="ws-hot-list">
          <button
            v-for="item in hotItems"
            :key="item.id"
            type="button"
            :class="{ active: sel[activeSection] === item.id }"
            :title="item.id"
            @click="selectHot(item.id)"
          >
            {{ item.name }}
          </button>
        </div>
      </div>

      <p v-else-if="!hasOptions && activeSection !== 'search'" class="ws-empty-hint">
        该分类暂无可用选项，换一个分类试试。
      </p>

      <WestockResult
        :result="result"
        :can-load-more="canLoadMore"
        :allow-stock-navigation="!(activeSection === 'filter' && market !== 'hs')"
        :loading="loading"
        :loading-more="loadingMore"
        :error="error"
        :unauthorized="unauthorized"
        :is-favorite="(code: string) => stock.isFavorite(code)"
        @pick="openStock"
        @toggle-favorite="toggleFavorite"
        @load-more="loadMore"
      />

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
.ws-restored {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 4px 8px 4px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, #0f766e 8%, transparent);
  color: #0f766e;
  font-size: var(--font-size-caption);
}
.ws-restored button {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, #0f766e 30%, transparent);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: inherit;
}
.ws-restored button:hover {
  background: color-mix(in srgb, #0f766e 12%, transparent);
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
/* 刷新目录：贴右排，低调处理，不与分类切换抢注意力 */
.ws-tabs .ws-refresh {
  margin-left: auto;
  padding-inline: 10px;
  color: var(--text-muted);
  font-weight: 600;
}
.ws-tabs .ws-refresh:hover {
  color: #0f766e;
  background: var(--bg-hover);
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
  flex: 1 1 260px;
  min-width: 0;
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
.ws-field.grow input {
  width: 100%;
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
  white-space: nowrap;
}
.ws-run:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.ws-clear {
  height: 36px;
  padding: 0 10px;
  border: 1px dashed var(--border-light);
  border-radius: 9px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  cursor: pointer;
}
.ws-clear:hover {
  border-color: #0f766e;
  color: #0f766e;
}
.ws-date-hint {
  margin: -4px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}
.ws-hot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
}
.ws-hot-label {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  font-weight: 800;
  white-space: nowrap;
}
.ws-hot-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.ws-hot-list button {
  padding: 6px 11px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: var(--font-size-meta);
  font-weight: 700;
  cursor: pointer;
}
.ws-hot-list button:hover {
  border-color: #0f766e;
  color: #0f766e;
}
.ws-hot-list button.active {
  border-color: #0f766e;
  background: color-mix(in srgb, #0f766e 12%, var(--bg-card));
  color: #0f766e;
}
.ws-empty-hint {
  padding: 14px;
  border: 1px dashed var(--border-light);
  border-radius: 14px;
  color: var(--text-muted);
  font-size: var(--font-size-small);
  text-align: center;
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
  color: var(--danger-text);
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
</style>
