<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { helpSections } from '../docs'
import { knowledgeSections } from '../docs/knowledge'
import { useTheme } from '../composables/useTheme'
import { renderMarkdown } from '@/lib/markdown'
import { DonatePanel, DonorsWall } from '@/components'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const contentRef = ref<HTMLElement | null>(null)

// 移动端目录抽屉开关
const tocOpen = ref(false)

// ---- 顶部 Tab：帮助中心 / 知识库 ----
type DocTab = 'help' | 'kb'
const kbAllDocs = computed(() => knowledgeSections.flatMap((s) => s.items))
const activeTab = computed<DocTab>(() =>
  route.query.doc && kbAllDocs.value.some((d) => d.id === route.query.doc) ? 'kb' : 'help',
)
const currentSections = computed(() =>
  activeTab.value === 'kb' ? knowledgeSections : helpSections,
)
const currentAllDocs = computed(() => currentSections.value.flatMap((s) => s.items))

function firstDocIdOf(tab: DocTab): string | undefined {
  const sections = tab === 'kb' ? knowledgeSections : helpSections
  return sections[0]?.items[0]?.id
}

function selectTab(tab: DocTab) {
  const id = firstDocIdOf(tab)
  if (id) selectDoc(id)
}

const activeDoc = computed(() => {
  const found = currentAllDocs.value.find((d) => d.id === route.query.doc)
  return found ?? currentAllDocs.value[0]
})

const html = computed(() => {
  const doc = activeDoc.value
  if (!doc) return ''
  return renderMarkdown(doc.content)
})

function selectDoc(id: string) {
  router.push({ path: '/docs', query: { doc: id } })
  if (contentRef.value) contentRef.value.scrollTop = 0
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
            <h3 class="docs-nav-title">{{ section.title }}</h3>
            <ul class="docs-nav-list">
              <li v-for="item in section.items" :key="item.id">
                <button
                  class="docs-nav-item"
                  :class="{ active: item.id === activeDoc.id }"
                  @click="selectDoc(item.id)"
                >
                  {{ item.title }}
                </button>
              </li>
            </ul>
          </section>
        </nav>
      </aside>

      <main class="docs-content-wrap">
        <DonatePanel v-if="activeDoc.id === 'site-donate'" :show-wall="false" class="docs-donate" />

        <article
          class="docs-content"
          ref="contentRef"
          v-html="html"
          @click="onContentClick"
        ></article>

        <DonorsWall v-if="activeDoc.id === 'site-donate'" class="docs-donate" />
      </main>
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

/* ---------- 主体两栏 ---------- */
.docs-body {
  flex: 1;
  display: grid;
  grid-template-columns: 248px 1fr;
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
}

.docs-nav-section + .docs-nav-section {
  margin-top: var(--space-5);
}
.docs-nav-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  margin: 0 0 var(--space-2) var(--space-2);
}
.docs-nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.docs-nav-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: var(--transition-fast);
  border-left: 3px solid transparent;
}
.docs-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.docs-nav-item.active {
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 600;
  border-left-color: var(--accent);
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
}

/* ---------- Markdown 正文样式（作用于 v-html 内部） ---------- */
.docs-content :deep(h1) {
  font-size: 28px;
  color: var(--text-primary);
  margin: 0 0 var(--space-5);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-light);
}
.docs-content :deep(h2) {
  font-size: 21px;
  color: var(--text-primary);
  margin: var(--space-7) 0 var(--space-3);
}
.docs-content :deep(h3) {
  font-size: 17px;
  color: var(--text-primary);
  margin: var(--space-5) 0 var(--space-2);
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
  .docs-nav-list {
    flex-direction: column;
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
