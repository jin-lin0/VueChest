<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MarkdownView, Skeleton } from '@/components'
import type {
  KnowledgeAtom,
  IndexData,
  TagItem,
  GraphNode,
  GraphEdge,
  KnowledgeBundle,
} from './types'
import { loadKnowledge } from './loader'

// 运行时从 R2 拉取，不再静态打包
const atoms = ref<KnowledgeAtom[]>([])
const indexData = ref<IndexData>({
  total: 0,
  generatedAt: '',
  byCategory: [],
  byTag: [],
  avgConfidence: 0,
})
const graphData = ref<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] })
const loading = ref(true)
const error = ref('')

const router = useRouter()
// 知识中心仅从「股票查询」进入，返回即回到股票页
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/stock')
}

onMounted(async () => {
  try {
    const bundle: KnowledgeBundle = await loadKnowledge()
    atoms.value = bundle.atoms
    indexData.value = bundle.indexData
    graphData.value = bundle.graphData
  } catch (e) {
    error.value = e instanceof Error ? e.message : '知识库加载失败'
  } finally {
    loading.value = false
  }
})

const CATEGORY_COLORS: Record<string, string> = {
  基础知识: '#64748b',
  交易制度: '#0ea5e9',
  市场规律: '#14b8a6',
  交易体系: '#8b5cf6',
  情绪周期: '#ef4444',
  盘口: '#f59e0b',
  竞价: '#f97316',
  龙头战法: '#ec4899',
  资金流: '#06b6d4',
  游资: '#d946ef',
  机构: '#3b82f6',
  板块: '#22c55e',
  案例: '#e11d48',
  统计: '#0891b2',
  风险: '#dc2626',
  心理: '#db2777',
  术语: '#6b7280',
  FAQ: '#0d9488',
  经验: '#a16207',
  观点: '#7c3aed',
  待验证: '#94a3b8',
}
const colorOf = (c: string) => CATEGORY_COLORS[c] || '#64748b'

const query = ref('')
const activeCategory = ref('')
const activeTags = ref<string[]>([])
const sortByConfidence = ref(false)
const selectedId = ref('')
const view = ref<'list' | 'graph'>('list')
const focusId = ref('')

const atomById = computed(() => {
  const m = new Map<string, KnowledgeAtom>()
  atoms.value.forEach((a) => m.set(a.id, a))
  return m
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  let list = atoms.value.filter((a) => {
    if (activeCategory.value && a.category !== activeCategory.value) return false
    if (activeTags.value.length && !activeTags.value.every((t) => a.tags.includes(t))) return false
    if (q) {
      const hay = (
        a.title +
        a.summary +
        a.tags.join(' ') +
        a.keywords.join(' ') +
        a.body
      ).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  if (sortByConfidence.value) list = [...list].sort((x, y) => y.confidence - x.confidence)
  return list
})

const selected = computed(() =>
  selectedId.value ? atomById.value.get(selectedId.value) || null : null,
)

const relatedAtoms = computed(() => {
  if (!selected.value) return []
  const ids = new Set<string>(selected.value.related)
  // 补充同标签邻居（取前 6 个共享标签最多的）
  const tagSet = new Set(selected.value.tags)
  const scored = atoms.value
    .filter((a) => a.id !== selected.value!.id)
    .map((a) => ({ a, shared: a.tags.filter((t) => tagSet.has(t)).length }))
    .filter((x) => x.shared > 0)
    .sort((x, y) => y.shared - x.shared)
    .slice(0, 8)
  scored.forEach((s) => ids.add(s.a.id))
  return [...ids].map((id) => atomById.value.get(id)).filter(Boolean) as KnowledgeAtom[]
})

function toggleTag(t: string) {
  const i = activeTags.value.indexOf(t)
  if (i >= 0) activeTags.value.splice(i, 1)
  else activeTags.value.push(t)
}
function selectAtom(id: string) {
  selectedId.value = id
  focusId.value = id
  if (view.value === 'graph') focusId.value = id
}
function clearFilters() {
  query.value = ''
  activeCategory.value = ''
  activeTags.value = []
}
function randomAtom() {
  if (!atoms.value.length) return
  const a = atoms.value[Math.floor(Math.random() * atoms.value.length)]
  selectAtom(a.id)
}

// ---------- 知识图谱 ----------
const adjacency = computed(() => {
  const m = new Map<string, Set<string>>()
  graphData.value.nodes.forEach((n) => m.set(n.id, new Set()))
  graphData.value.edges.forEach((e) => {
    m.get(e.source)?.add(e.target)
    m.get(e.target)?.add(e.source)
  })
  return m
})
const focusNode = computed(
  () => graphData.value.nodes.find((n) => n.id === focusId.value) || graphData.value.nodes[0],
)
const graphLayout = computed(() => {
  const focus = focusNode.value
  if (!focus)
    return {
      nodes: [] as { x: number; y: number; n: GraphNode }[],
      edges: [] as { x1: number; y1: number; x2: number; y2: number; kind: string }[],
    }
  const neighbors = [...(adjacency.value.get(focus.id) || [])]
    .map((id) => graphData.value.nodes.find((n) => n.id === id))
    .filter(Boolean)
    .slice(0, 36) as GraphNode[]
  const cx = 460
  const cy = 320
  const R = 230
  const pts = [{ x: cx, y: cy, n: focus }]
  neighbors.forEach((n, i) => {
    const ang = (i / neighbors.length) * Math.PI * 2
    pts.push({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R, n })
  })
  const pos = new Map<string, { x: number; y: number }>()
  pts.forEach((p) => pos.set(p.n.id, { x: p.x, y: p.y }))
  const edges = neighbors.map((n) => ({
    x1: cx,
    y1: cy,
    x2: pos.get(n.id)!.x,
    y2: pos.get(n.id)!.y,
    kind: 'link',
  }))
  return { nodes: pts, edges }
})
function focusOn(id: string) {
  focusId.value = id
  selectedId.value = id
}
// 在图谱中点「查看完整详情」：切到列表视图，右侧详情面板即可展示
function openDetail() {
  view.value = 'list'
}

const confidenceLabel = (c: number) => {
  if (c >= 90) return '官方/强统计'
  if (c >= 75) return '经典体系'
  if (c >= 55) return '部分支撑'
  if (c >= 35) return '经验观点'
  return '待验证'
}
</script>

<template>
  <div class="kb">
    <header class="kb-header">
      <button class="kb-back" @click="goBack" title="返回股票查询">← 返回</button>
      <div class="kb-title">
        <span class="kb-logo">🧠</span>
        <div>
          <h1>A 股短线交易 · 知识中心</h1>
          <p class="kb-sub">
            共 <b>{{ indexData.total }}</b> 个知识原子 ｜ 平均可信度
            <b>{{ indexData.avgConfidence }}</b> ｜ 分类 {{ indexData.byCategory.length }} ｜ 标签
            {{ indexData.byTag.length }}
          </p>
        </div>
      </div>
      <div class="kb-actions">
        <input
          v-model="query"
          class="kb-search"
          placeholder="全文搜索：龙头 / 情绪 / 止损 / 竞价 ..."
        />
        <button class="kb-btn" @click="randomAtom">🎲 随机</button>
        <div class="kb-viewtoggle">
          <button :class="{ on: view === 'list' }" @click="view = 'list'">📋 列表</button>
          <button :class="{ on: view === 'graph' }" @click="view = 'graph'">🕸️ 图谱</button>
        </div>
      </div>
    </header>

    <div v-if="loading" class="kb-state kb-loading-skel">
      <div class="kb-skel-wrap">
        <Skeleton :width="260" :height="18" text />
        <Skeleton :width="200" :height="14" text />
        <Skeleton :width="220" :height="14" text />
        <Skeleton :width="180" :height="14" text />
      </div>
    </div>
    <div v-else-if="error" class="kb-state err">⚠️ {{ error }}</div>
    <div v-else class="kb-body">
      <aside class="kb-side">
        <div class="kb-side-sec">
          <div class="kb-side-h">分类</div>
          <button
            class="kb-cat"
            :class="{ on: activeCategory === '' }"
            @click="activeCategory = ''"
          >
            全部 <span>{{ indexData.total }}</span>
          </button>
          <button
            v-for="c in indexData.byCategory"
            :key="c.category"
            class="kb-cat"
            :class="{ on: activeCategory === c.category }"
            @click="activeCategory = activeCategory === c.category ? '' : c.category"
          >
            <i class="dot" :style="{ background: colorOf(c.category) }"></i>
            {{ c.category }} <span>{{ c.count }}</span>
          </button>
        </div>
        <div class="kb-side-sec">
          <div class="kb-side-h">热门标签</div>
          <div class="kb-tags">
            <button
              v-for="t in indexData.byTag.slice(0, 40)"
              :key="t.tag"
              class="kb-tag"
              :class="{ on: activeTags.includes(t.tag) }"
              @click="toggleTag(t.tag)"
            >
              #{{ t.tag }} <em>{{ t.count }}</em>
            </button>
          </div>
        </div>
      </aside>

      <main class="kb-main">
        <div v-if="view === 'list'" class="kb-list">
          <div class="kb-toolbar">
            <span
              >匹配 <b>{{ filtered.length }}</b> 条</span
            >
            <label class="kb-sort"
              ><input type="checkbox" v-model="sortByConfidence" /> 按可信度排序</label
            >
            <button
              v-if="activeCategory || activeTags.length || query"
              class="kb-btn ghost"
              @click="clearFilters"
            >
              清除筛选
            </button>
          </div>
          <div class="kb-cards">
            <button
              v-for="a in filtered"
              :key="a.id"
              class="kb-card"
              :class="{ on: selectedId === a.id }"
              @click="selectAtom(a.id)"
            >
              <div class="kb-card-top">
                <span class="kb-badge" :style="{ background: colorOf(a.category) }">{{
                  a.category
                }}</span>
                <span
                  class="kb-conf"
                  :class="
                    'lv' +
                    (a.confidence >= 90
                      ? 5
                      : a.confidence >= 75
                        ? 4
                        : a.confidence >= 55
                          ? 3
                          : a.confidence >= 35
                            ? 2
                            : 1)
                  "
                >
                  {{ a.confidence }} · {{ confidenceLabel(a.confidence) }}
                </span>
              </div>
              <h3>{{ a.title }}</h3>
              <p class="kb-summary">{{ a.summary }}</p>
              <div class="kb-card-tags">
                <span v-for="t in a.tags.slice(0, 4)" :key="t" class="kb-ctag">#{{ t }}</span>
              </div>
            </button>
          </div>
        </div>

        <div v-else class="kb-graph">
          <div class="kb-graph-bar">
            聚焦：<b>{{ focusNode?.title }}</b>
            <span class="muted">（点击节点切换焦点，圆点颜色=分类，连线=关联/共标签）</span>
          </div>
          <svg class="kb-svg" viewBox="0 0 920 640">
            <line
              v-for="(e, i) in graphLayout.edges"
              :key="'e' + i"
              :x1="e.x1"
              :y1="e.y1"
              :x2="e.x2"
              :y2="e.y2"
              class="kb-edge"
            />
            <g
              v-for="p in graphLayout.nodes"
              :key="p.n.id"
              class="kb-node"
              :class="{ focus: p.n.id === focusId, sel: p.n.id === selectedId }"
              @click="focusOn(p.n.id)"
            >
              <circle class="kb-hit" :cx="p.x" :cy="p.y" r="22" />
              <circle
                :cx="p.x"
                :cy="p.y"
                :r="p.n.id === focusId ? 16 : 10"
                :fill="colorOf(p.n.category)"
              />
              <text :x="p.x" :y="p.y - 22" class="kb-node-label">{{ p.n.title.slice(0, 10) }}</text>
            </g>
          </svg>
          <div v-if="focusNode" class="kb-graph-info">
            <div class="kb-gi-head">
              <span class="kb-badge" :style="{ background: colorOf(focusNode.category) }">{{
                focusNode.category
              }}</span>
              <span
                class="kb-conf"
                :class="
                  'lv' +
                  (focusNode.confidence >= 90
                    ? 5
                    : focusNode.confidence >= 75
                      ? 4
                      : focusNode.confidence >= 55
                        ? 3
                        : focusNode.confidence >= 35
                          ? 2
                          : 1)
                "
                >{{ focusNode.confidence }}</span
              >
            </div>
            <div class="kb-gi-title">{{ focusNode.title }}</div>
            <p class="kb-gi-sum">{{ atomById.get(focusNode.id)?.summary }}</p>
            <button class="kb-btn" @click="openDetail">查看完整详情 →</button>
          </div>
        </div>
      </main>

      <transition name="slide">
        <section v-if="selected && view === 'list'" class="kb-detail">
          <div class="kb-detail-head">
            <div>
              <span class="kb-badge" :style="{ background: colorOf(selected.category) }">{{
                selected.category
              }}</span>
              <span
                class="kb-conf"
                :class="
                  'lv' +
                  (selected.confidence >= 90
                    ? 5
                    : selected.confidence >= 75
                      ? 4
                      : selected.confidence >= 55
                        ? 3
                        : selected.confidence >= 35
                          ? 2
                          : 1)
                "
              >
                {{ selected.confidence }} · {{ confidenceLabel(selected.confidence) }}
              </span>
            </div>
            <button class="kb-x" @click="selectedId = ''">✕</button>
          </div>
          <h2 class="kb-detail-title">{{ selected.title }}</h2>
          <p class="kb-detail-sum">{{ selected.summary }}</p>
          <div class="kb-meta">
            <span>更新：{{ selected.updatedAt }}</span>
            <span>状态：{{ selected.status }}</span>
            <span v-if="selected.caseType"
              >类型：{{ selected.caseType === 'failure' ? '失败案例' : '成功案例' }}</span
            >
          </div>
          <div class="kb-tagsrow">
            <span v-for="t in selected.tags" :key="t" class="kb-ctag">#{{ t }}</span>
          </div>
          <div class="kb-detail-body">
            <MarkdownView :content="selected.body" :toc-level="2" />
          </div>
          <div v-if="selected.citations.length" class="kb-cits">
            <div class="kb-h">引用来源</div>
            <ul>
              <li v-for="(c, i) in selected.citations" :key="i">
                <b>{{ c.source }}</b>
                <span v-if="c.detail">《{{ c.detail }}》</span>
                <a v-if="c.url" :href="c.url" target="_blank" rel="noopener">🔗</a>
              </li>
            </ul>
          </div>
          <div v-if="relatedAtoms.length" class="kb-rel">
            <div class="kb-h">关联知识</div>
            <div class="kb-rel-list">
              <button
                v-for="r in relatedAtoms"
                :key="r.id"
                class="kb-rel-item"
                @click="selectAtom(r.id)"
              >
                <i class="dot" :style="{ background: colorOf(r.category) }"></i>
                {{ r.title }}
              </button>
            </div>
          </div>
          <div v-if="selected.futureResearch.length" class="kb-future">
            <div class="kb-h">未来研究方向</div>
            <ul>
              <li v-for="(f, i) in selected.futureResearch" :key="i">· {{ f }}</li>
            </ul>
          </div>
        </section>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.kb {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: 14px;
}
.kb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-wrap: wrap;
}
.kb-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.kb-back {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.kb-back:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.kb-logo {
  font-size: 28px;
}
.kb-title h1 {
  font-size: 18px;
  margin: 0;
}
.kb-sub {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}
.kb-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.kb-search {
  width: 320px;
  max-width: 50vw;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-page);
  color: var(--text-primary);
  outline: none;
}
.kb-search:focus {
  border-color: var(--accent);
}
.kb-btn {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
}
.kb-btn:hover {
  border-color: var(--accent);
}
.kb-btn.ghost {
  background: transparent;
}
.kb-viewtoggle {
  display: flex;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
}
.kb-viewtoggle button {
  padding: 8px 12px;
  border: none;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
}
.kb-viewtoggle button.on {
  background: var(--accent);
  color: var(--text-inverse);
}

.kb-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}
.kb-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  padding: 40px;
  text-align: center;
}
.kb-loading-skel {
  flex-direction: column;
}
.kb-skel-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, 80%);
}
.kb-state.err {
  color: var(--danger);
}
.kb-side {
  width: 230px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border-light);
  overflow-y: auto;
  padding: 14px;
}
.kb-side-sec {
  margin-bottom: 18px;
}
.kb-side-h {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
  font-weight: 600;
}
.kb-cat {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 7px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.kb-cat:hover {
  background: var(--bg-page);
}
.kb-cat.on {
  background: var(--accent);
  color: var(--text-inverse);
}
.kb-cat .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.kb-cat span {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.7;
}
.kb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.kb-tag {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 20px;
  border: 1px solid var(--border-light);
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
}
.kb-tag.on {
  background: var(--accent);
  color: var(--text-inverse);
  border-color: var(--accent);
}
.kb-tag em {
  font-style: normal;
  opacity: 0.6;
  margin-left: 3px;
}

.kb-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.kb-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.kb-sort {
  cursor: pointer;
}
.kb-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.kb-card {
  text-align: left;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: 0.15s;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kb-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.kb-card.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.2);
}
.kb-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kb-badge {
  color: var(--text-inverse);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
}
.kb-conf {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-page);
  color: var(--text-muted);
}
.kb-conf.lv5 {
  color: var(--success);
}
.kb-conf.lv4 {
  color: var(--info);
}
.kb-conf.lv3 {
  color: var(--warning);
}
.kb-conf.lv2 {
  color: var(--danger);
}
.kb-conf.lv1 {
  color: var(--text-muted);
}
.kb-card h3 {
  margin: 0;
  font-size: 15px;
}
.kb-summary {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.kb-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.kb-ctag {
  font-size: 11px;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.08);
  padding: 1px 6px;
  border-radius: 4px;
}

.kb-detail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 460px;
  max-width: 92%;
  background: var(--bg-card);
  border-left: 1px solid var(--border-light);
  overflow-y: auto;
  padding: 18px;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
.kb-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.kb-x {
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--text-muted);
  cursor: pointer;
}
.kb-detail-title {
  margin: 10px 0 4px;
  font-size: 18px;
}
.kb-detail-sum {
  margin: 0 0 10px;
  color: var(--text-muted);
}
.kb-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.kb-tagsrow {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}
.kb-detail-body {
  border-top: 1px solid var(--border-light);
  padding-top: 12px;
}
.kb-h {
  font-size: 13px;
  font-weight: 600;
  margin: 14px 0 6px;
}
.kb-cits ul,
.kb-future ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-muted);
}
.kb-cits li {
  margin-bottom: 4px;
}
.kb-rel-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kb-rel-item {
  text-align: left;
  border: 1px solid var(--border-light);
  background: var(--bg-page);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.kb-rel-item:hover {
  border-color: var(--accent);
}
.kb-rel-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.kb-graph {
  padding: 8px;
  position: relative;
}
.kb-graph-bar {
  color: var(--text-muted);
  font-size: 13px;
  margin-bottom: 6px;
}
.kb-graph-bar b {
  color: var(--text-primary);
}
.kb-svg {
  width: 100%;
  height: calc(100vh - 160px);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  touch-action: manipulation;
}
.kb-edge {
  stroke: var(--border-light);
  stroke-width: 1;
}
.kb-node {
  cursor: pointer;
  pointer-events: all;
}
.kb-hit {
  fill: transparent;
}
.kb-node circle:not(.kb-hit) {
  stroke: var(--bg-card);
  stroke-width: 2;
  transition: 0.15s;
}
.kb-node:hover circle:not(.kb-hit) {
  stroke: var(--accent);
}
.kb-node.focus circle:not(.kb-hit) {
  stroke: var(--accent);
  stroke-width: 3;
}
.kb-node.sel circle:not(.kb-hit) {
  stroke: var(--warning);
  stroke-width: 3;
}
.kb-node-label {
  font-size: 10px;
  fill: var(--text-primary);
  text-anchor: middle;
  pointer-events: none;
}
.kb-graph-info {
  position: absolute;
  left: 16px;
  bottom: 16px;
  max-width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}
.kb-gi-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.kb-gi-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.kb-gi-sum {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.muted {
  color: var(--text-muted);
}

/* ===== 移动端适配（≤768px 手机/小平板） ===== */
@media (max-width: 768px) {
  .kb {
    height: 100vh;
    height: 100dvh;
  }
  .kb-header {
    gap: 10px;
    padding: 10px 12px;
  }
  .kb-title {
    gap: 8px;
  }
  .kb-logo {
    font-size: 22px;
  }
  .kb-title h1 {
    font-size: 16px;
  }
  .kb-actions {
    width: 100%;
  }
  .kb-search {
    width: 100%;
    max-width: none;
    flex: 1;
    min-width: 0;
  }
  /* 主体改为纵向：侧栏置顶，主内容在下 */
  .kb-body {
    flex-direction: column;
  }
  /* 左侧栏移到顶部，分类/标签改为横向滚动，节省纵向空间 */
  .kb-side {
    width: 100%;
    flex-shrink: 0;
    border-right: none;
    border-bottom: 1px solid var(--border-light);
    padding: 10px 12px;
    max-height: none;
  }
  .kb-side-sec {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 10px;
    padding-bottom: 2px;
  }
  .kb-side-sec:last-child {
    margin-bottom: 0;
  }
  .kb-side-h {
    flex-shrink: 0;
    margin-bottom: 0;
    white-space: nowrap;
  }
  .kb-cat {
    width: auto;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .kb-cat span {
    margin-left: 6px;
  }
  .kb-tags {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;
    min-width: 0;
    padding-bottom: 2px;
  }
  .kb-main {
    padding: 12px;
  }
  .kb-cards {
    grid-template-columns: 1fr;
  }
  /* 详情面板移动端全屏覆盖 */
  .kb-detail {
    width: 100%;
    max-width: 100%;
    padding: 14px;
  }
  .kb-svg {
    height: calc(100dvh - 230px);
    min-height: 300px;
  }
  /* 移动端 SVG 受容器宽度限制被等比缩放（约 0.4 倍），viewBox 内字号会缩到 ~4px；
     放大 viewBox 单位的字号与节点半径，使缩放后实际像素接近桌面可读尺寸 */
  .kb-node-label {
    font-size: 22px;
  }
  .kb-node circle:not(.kb-hit) {
    r: 14;
  }
  .kb-node.focus circle:not(.kb-hit) {
    r: 18;
  }
  .kb-hit {
    r: 26;
  }
  .kb-graph-info {
    left: 12px;
    right: 12px;
    max-width: none;
  }
}

/* 小屏手机（≤480px）微调 */
@media (max-width: 480px) {
  .kb-logo {
    font-size: 20px;
  }
  .kb-title h1 {
    font-size: 15px;
  }
  .kb-sub {
    display: none;
  }
  .kb-actions {
    gap: 8px;
  }
  .kb-svg {
    height: calc(100dvh - 260px);
  }
}
</style>
