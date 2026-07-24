<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick, reactive, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { helpSections, knowledgeSections, flattenDocs, firstLeafIdOf, containsId } from '../docs'
import type { DocItem } from '../docs/types'
import { useTheme } from '../composables/useTheme'
import { renderMarkdown, extractToc } from '@/lib/markdown'
import { DonatePanel, DonorsWall, DocNavTree, DOC_EXPANDED_KEY } from '@/components'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const contentRef = ref<HTMLElement | null>(null)
// 真正的滚动容器是 .app-main（App.vue 中 overflow-y:auto），不是 window
const scroller = ref<HTMLElement | null>(null)

// ---- 侧边栏文件夹展开状态：提升到 Docs.vue 统一管理（共享响应式表） ----
const expandedMap = reactive<Record<string, boolean>>({})
provide(DOC_EXPANDED_KEY, expandedMap)

// 当前 Tab 下所有文件夹 id（含 section 主文件夹与嵌套子目录）
function allFolderIds(): string[] {
  const ids: string[] = []
  currentSections.value.forEach((s) => {
    // section 自身成为可折叠主文件夹
    ids.push(s.id)
    const walk = (list: DocItem[]) =>
      list.forEach((n) => {
        if (n.children?.length) {
          ids.push(n.id)
          walk(n.children)
        }
      })
    walk(s.items)
  })
  return ids
}
// 仅打开「包含激活文档」的文件夹路径；不动其它文件夹的状态（修复：切文档时其它文件夹被收起）
function ensureAncestorsOpen(active: string) {
  currentSections.value.forEach((s) => {
    // 激活文档在本 section 内时，展开该主文件夹
    if (containsId(s.items, active)) expandedMap[s.id] = true
    const walk = (list: DocItem[]) =>
      list.forEach((n) => {
        if (n.children?.length) {
          if (containsId(n.children, active)) expandedMap[n.id] = true
          walk(n.children)
        }
      })
    walk(s.items)
  })
}
// 全量展开 / 收起。收起时保留激活路径，确保当前文档仍可见
const allFoldersOpen = computed(() => {
  const ids = allFolderIds()
  return ids.length > 0 && ids.every((id) => expandedMap[id])
})
function toggleAllFolders() {
  const ids = allFolderIds()
  const target = !allFoldersOpen.value
  if (!target) {
    // 收起：保留激活路径（含 section 主文件夹及其下的激活路径）
    const keep = new Set<string>()
    const active = activeDoc.value?.id ?? ''
    currentSections.value.forEach((s) => {
      const onSection = containsId(s.items, active)
      if (onSection) keep.add(s.id)
      const mark = (list: DocItem[], onPath: boolean) =>
        list.forEach((n) => {
          if (n.children?.length) {
            const on = onPath || containsId(n.children, active)
            if (on) keep.add(n.id)
            mark(n.children, on)
          }
        })
      mark(s.items, onSection)
    })
    ids.forEach((id) => (expandedMap[id] = keep.has(id)))
  } else {
    ids.forEach((id) => (expandedMap[id] = true))
  }
}

// 移动端目录抽屉开关
const tocOpen = ref(false)

// ---- 顶部 Tab：帮助中心 / 知识库 ----
type DocTab = 'help' | 'kb'
const kbAllDocs = computed(() => flattenDocs(knowledgeSections.flatMap((s) => s.items)))
const activeTab = computed<DocTab>(() =>
  route.query.doc && kbAllDocs.value.some((d) => d.id === route.query.doc) ? 'kb' : 'help',
)
const currentSections = computed(() =>
  activeTab.value === 'kb' ? knowledgeSections : helpSections,
)
const currentAllDocs = computed(() => flattenDocs(currentSections.value.flatMap((s) => s.items)))

function firstDocIdOf(tab: DocTab): string | undefined {
  const sections = tab === 'kb' ? knowledgeSections : helpSections
  return firstLeafIdOf(sections)
}

function selectTab(tab: DocTab) {
  const id = firstDocIdOf(tab)
  if (id) selectDoc(id)
}

const activeDoc = computed(() => {
  const found = currentAllDocs.value.find((d) => d.id === route.query.doc && d.content)
  return found ?? currentAllDocs.value.find((d) => d.content) ?? currentAllDocs.value[0]
})

const html = computed(() => {
  const doc = activeDoc.value
  if (!doc?.content) return ''
  return renderMarkdown(doc.content, { tocLevels: [2, 3] })
})

// ---- 本页目录（TOC）：从二级/三级标题提取 ----
const toc = computed(() =>
  activeDoc.value?.content ? extractToc(activeDoc.value.content, [2, 3]) : [],
)
const activeHeading = ref('')

function scrollToHeading(id: string) {
  const el = contentRef.value?.querySelector(`#${CSS.escape(id)}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

let headingEls: HTMLElement[] = []
function collectHeadings() {
  const root = contentRef.value
  headingEls = root ? (Array.from(root.querySelectorAll('h2, h3')) as HTMLElement[]) : []
  onScroll()
}
function onScroll() {
  if (!headingEls.length) return
  const offset = 88 // 顶栏高度 + 余量
  let current = headingEls[0].id
  for (const el of headingEls) {
    if (el.getBoundingClientRect().top - offset <= 0) current = el.id
    else break
  }
  activeHeading.value = current
}

watch(
  () => activeDoc.value?.id,
  (id) => {
    activeHeading.value = ''
    // 切换文档时只打开其所属路径的文件夹，不收起其它文件夹
    if (id) ensureAncestorsOpen(id)
    nextTick(collectHeadings)
  },
)
onMounted(() => {
  // 初始化展开表：默认全部展开，再确保当前激活文档所在路径展开（已经是 true，保持幂等）
  allFolderIds().forEach((id) => (expandedMap[id] = true))
  ensureAncestorsOpen(activeDoc.value?.id ?? '')
  // 挂到真正的滚动容器 .app-main（而非 window）
  scroller.value = document.querySelector('.app-main')
  scroller.value?.addEventListener('scroll', onScroll, { passive: true })
  nextTick(collectHeadings)
})
onUnmounted(() => scroller.value?.removeEventListener('scroll', onScroll))

function selectDoc(id: string) {
  router.push({ path: '/docs', query: { doc: id } })
  nextTick(() => scroller.value?.scrollTo({ top: 0 }))
  tocOpen.value = false
}

// 将文档内的相对 .md 链接（如 ./market-upload.md）在站内导航，而非发起文件请求
function onContentClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  const match = href.match(/\.\/([\w-]+)\.md/)
  if (match) {
    e.preventDefault()
    selectDoc(match[1])
  }
}
</script>

<template>
  <div class="docs-page">
    <header class="docs-header">
      <div class="docs-header-left">
        <button class="docs-back" @click="router.push('/')" title="返回首页" aria-label="返回首页">
          <svg
            class="docs-back-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button class="docs-toc-toggle" @click="tocOpen = true" title="目录" aria-label="打开目录">
          <svg
            class="docs-toc-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div class="docs-brand" @click="router.push('/')">
          <span class="docs-logo">⚡</span>
          <span class="docs-title">VueChest 文档中心</span>
        </div>
      </div>
      <nav class="docs-tabs">
        <button
          class="docs-tab"
          :class="{ active: activeTab === 'help' }"
          @click="selectTab('help')"
        >
          帮助中心
        </button>
        <button class="docs-tab" :class="{ active: activeTab === 'kb' }" @click="selectTab('kb')">
          知识库
        </button>
      </nav>
      <div class="docs-header-actions">
        <button
          class="docs-theme"
          @click="toggleTheme"
          :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
        >
          {{ isDark ? '☀️' : '🌙' }}
        </button>
      </div>
    </header>

    <div class="docs-drawer-backdrop" :class="{ open: tocOpen }" @click="tocOpen = false"></div>

    <div class="docs-body">
      <aside class="docs-sidebar" :class="{ 'is-open': tocOpen }">
        <div class="docs-drawer-header">
          <span>目录</span>
          <button class="docs-drawer-close" @click="tocOpen = false" aria-label="关闭目录">
            ✕
          </button>
        </div>
        <nav>
          <section v-for="section in currentSections" :key="section.id" class="docs-nav-section">
            <!-- 每个 section 本身作为可折叠的主文件夹；展开后才是里面的子目录/文档 -->
            <DocNavTree
              :nodes="[{ id: section.id, title: section.title, children: section.items }]"
              :active-id="activeDoc?.id ?? ''"
              @select="selectDoc"
            />
          </section>
        </nav>
        <button
          class="docs-header-btn docs-fab"
          @click="toggleAllFolders"
          :title="allFoldersOpen ? '收起全部目录' : '展开全部目录'"
          :aria-label="allFoldersOpen ? '收起全部目录' : '展开全部目录'"
        >
          <svg
            v-if="allFoldersOpen"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="7 11 12 6 17 11" />
            <polyline points="7 18 12 13 17 18" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="7 13 12 18 17 13" />
            <polyline points="7 6 12 11 17 6" />
          </svg>
        </button>
      </aside>

      <main class="docs-content-wrap">
        <DonatePanel
          v-if="activeDoc?.id === 'site-donate'"
          :show-wall="false"
          class="docs-donate"
        />

        <article
          class="docs-content"
          ref="contentRef"
          v-html="html"
          @click="onContentClick"
        ></article>

        <DonorsWall v-if="activeDoc?.id === 'site-donate'" class="docs-donate" />
      </main>

      <!-- 本页目录（右侧大纲） -->
      <aside v-if="toc.length" class="docs-toc">
        <div class="docs-toc-inner">
          <h4 class="docs-toc-title">本页目录</h4>
          <ul class="docs-toc-list">
            <li
              v-for="item in toc"
              :key="item.id"
              class="docs-toc-item"
              :class="[`lv-${item.depth}`, { active: item.id === activeHeading }]"
            >
              <button class="docs-toc-link" @click="scrollToHeading(item.id)">
                {{ item.text }}
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.docs-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  color: var(--text-body);
}

/* ---------- 顶栏 ---------- */
.docs-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-6);
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-light);
}

.docs-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}
.docs-logo {
  font-size: 22px;
}
.docs-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

/* ---------- 顶部 Tab（帮助中心 / 知识库） ---------- */
.docs-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--bg-glass-soft);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-pill);
  padding: 3px;
}
.docs-tab {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-fast);
  white-space: nowrap;
}
.docs-tab:hover {
  color: var(--text-primary);
}
.docs-tab.active {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-sm);
}

.docs-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.docs-back,
.docs-theme {
  border: 1px solid var(--border);
  background: var(--bg-glass-soft);
  color: var(--text-body);
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition);
}
.docs-back:hover,
.docs-theme:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.docs-header-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  background: var(--bg-glass-soft);
  color: var(--text-body);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
}
.docs-header-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.docs-header-btn svg {
  display: block;
}
.docs-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
/* 移动端才出现的元素，桌面端默认隐藏 */
.docs-toc-toggle,
.docs-drawer-backdrop,
.docs-drawer-header {
  display: none;
}
.docs-back {
  width: 38px;
  height: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.docs-back-icon {
  display: block;
}
.docs-theme {
  width: 38px;
  padding: 0;
  height: 34px;
  font-size: 15px;
}

/* ---------- 主体三栏：侧边栏 / 内容 / 本页目录 ---------- */
.docs-body {
  flex: 1;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 240px;
  align-items: stretch;
}

.docs-sidebar {
  border-right: 1px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-5) var(--space-3);
  position: sticky;
  top: 57px;
  align-self: start;
  height: calc(100vh - 57px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
/* 侧边栏右下角的悬浮折叠按钮：sticky 吸底，不随目录列表滚动而移动 */
.docs-fab {
  position: sticky;
  bottom: 0;
  align-self: flex-end;
  margin-top: auto;
  flex-shrink: 0;
  z-index: 2;
}

.docs-nav-section + .docs-nav-section {
  margin-top: var(--space-5);
}

/* ---------- 本页目录（右侧大纲） ---------- */
.docs-toc {
  border-left: 1px solid var(--border-light);
  background: var(--bg-card);
  padding: var(--space-5) var(--space-4);
  position: sticky;
  top: 57px;
  align-self: start;
  height: calc(100vh - 57px);
  overflow-y: auto;
}
.docs-toc-inner {
  position: sticky;
  top: 0;
}
.docs-toc-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  margin: 0 0 var(--space-3);
}
.docs-toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-left: 2px solid var(--border-light);
}
.docs-toc-item {
  margin: 0;
  padding-left: var(--space-3);
  margin-left: -2px;
  border-left: 2px solid transparent;
  transition: border-color var(--transition-fast);
}
.docs-toc-item.lv-3 {
  padding-left: var(--space-6);
}
.docs-toc-item.active {
  border-left-color: var(--accent);
}
.docs-toc-link {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  transition: var(--transition-fast);
}
.docs-toc-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.docs-toc-item.active .docs-toc-link {
  color: var(--accent);
  font-weight: 600;
}

/* ---------- 内容区 ---------- */
.docs-content-wrap {
  padding: var(--space-8) var(--space-8);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
}
.docs-donate {
  width: 100%;
  max-width: 820px;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  box-shadow: var(--shadow-sm);
}
.docs-content {
  width: 100%;
  max-width: 820px;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-8) var(--space-8);
  box-shadow: var(--shadow-sm);
  line-height: 1.75;
  font-size: 15px;
  color: var(--text-body);
  overflow-x: auto;
  overflow-wrap: break-word;
  word-break: break-word;
  scroll-margin-top: 72px;
}

/* ---------- Markdown 正文样式（作用于 v-html 内部） ---------- */
.docs-content :deep(h1) {
  font-size: 28px;
  color: var(--text-primary);
  margin: 0 0 var(--space-5);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-light);
  scroll-margin-top: 72px;
}
.docs-content :deep(h2) {
  font-size: 21px;
  color: var(--text-primary);
  margin: var(--space-7) 0 var(--space-3);
  scroll-margin-top: 72px;
}
.docs-content :deep(h3) {
  font-size: 17px;
  color: var(--text-primary);
  margin: var(--space-5) 0 var(--space-2);
  scroll-margin-top: 72px;
}
.docs-content :deep(p) {
  margin: var(--space-3) 0;
}
.docs-content :deep(ul),
.docs-content :deep(ol) {
  margin: var(--space-3) 0;
  padding-left: var(--space-6);
}
.docs-content :deep(li) {
  margin: var(--space-1) 0;
}
.docs-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: var(--transition-fast);
}
.docs-content :deep(a:hover) {
  border-bottom-color: var(--accent);
}
.docs-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 700;
}

/* 表格 */
.docs-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--space-4) 0;
  font-size: 14px;
}
.docs-content :deep(th),
.docs-content :deep(td) {
  border: 1px solid var(--border-light);
  padding: var(--space-2) var(--space-3);
  text-align: left;
  overflow-wrap: break-word;
  word-break: break-word;
}
.docs-content :deep(th) {
  background: var(--bg-subtle);
  color: var(--text-primary);
  font-weight: 600;
}
.docs-content :deep(tr:nth-child(even) td) {
  background: var(--bg-hover);
}

/* 引用块（注意 / 提示） */
.docs-content :deep(blockquote) {
  margin: var(--space-4) 0;
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid var(--accent);
  background: var(--accent-bg);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-body);
}
.docs-content :deep(blockquote p) {
  margin: var(--space-1) 0;
}

/* 行内代码 */
.docs-content :deep(code) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.88em;
  background: var(--bg-subtle);
  color: var(--accent-strong);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}
/* 代码块：固定深色面板，适配亮/暗两种主题 */
.docs-content :deep(pre) {
  margin: var(--space-4) 0;
  background: #0d1117;
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-x: auto;
  border: 1px solid #1f2937;
}
.docs-content :deep(pre code) {
  background: transparent;
  color: #e6edf3;
  padding: 0;
  font-size: 13.5px;
  line-height: 1.6;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  /* 中屏隐藏右侧本页目录，避免三栏过挤 */
  .docs-body {
    grid-template-columns: 248px minmax(0, 1fr);
  }
  .docs-toc {
    display: none;
  }
}
@media (max-width: 768px) {
  .docs-header {
    padding: var(--space-3) var(--space-4);
  }
  /* 移动端隐藏品牌文字，仅保留返回与目录图标 */
  .docs-brand {
    display: none;
  }
  /* 移动端目录按钮（汉堡图标） */
  .docs-toc-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg-glass-soft);
    color: var(--text-body);
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: var(--transition);
  }
  .docs-toc-toggle:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .docs-toc-icon {
    display: block;
  }
  .docs-body {
    grid-template-columns: 1fr;
  }
  /* 侧拉抽屉：默认移出视口左侧，打开时滑入 */
  .docs-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 280px;
    max-width: 82vw;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    border-right: 1px solid var(--border-light);
    box-shadow: var(--shadow-lg);
    padding-top: 0;
  }
  .docs-sidebar.is-open {
    transform: translateX(0);
  }
  /* 抽屉标题栏（含关闭按钮） */
  .docs-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--border-light);
    position: sticky;
    top: 0;
    background: var(--bg-card);
  }
  .docs-drawer-header span {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .docs-drawer-close {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    transition: var(--transition-fast);
  }
  .docs-drawer-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  /* 抽屉遮罩 */
  .docs-drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.25s ease,
      visibility 0.25s ease;
    z-index: 40;
  }
  .docs-drawer-backdrop.open {
    opacity: 1;
    visibility: visible;
  }
  .docs-content-wrap {
    padding: var(--space-5) var(--space-4);
  }
  .docs-content {
    padding: var(--space-5) var(--space-4);
  }
  /* 宽表格在窄屏允许横向滚动，避免撑破布局（长路径列） */
  .docs-content :deep(table) {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

@media (max-width: 480px) {
  .docs-content {
    padding: var(--space-4);
    font-size: 14px;
  }
  .docs-title {
    font-size: 15px;
  }
}
</style>
