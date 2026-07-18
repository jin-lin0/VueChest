<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { docSections, allDocs, findDoc } from '../docs'
import { useTheme } from '../composables/useTheme'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const contentRef = ref<HTMLElement | null>(null)

const activeDoc = computed(() => findDoc(route.query.doc as string | undefined) ?? allDocs[0])

const html = computed(() => {
  const doc = activeDoc.value
  if (!doc) return ''
  return marked.parse(doc.content, { async: false }) as string
})

function selectDoc(id: string) {
  router.push({ path: '/docs', query: { doc: id } })
  if (contentRef.value) contentRef.value.scrollTop = 0
}

function highlight() {
  nextTick(() => {
    const el = contentRef.value
    if (!el) return
    el.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block as HTMLElement)
    })
  })
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

watch(html, highlight)
onMounted(highlight)
</script>

<template>
  <div class="docs-page">
    <header class="docs-header">
      <div class="docs-brand" @click="router.push('/')">
        <span class="docs-logo">⚡</span>
        <span class="docs-title">VueChest 帮助文档</span>
      </div>
      <div class="docs-header-actions">
        <button class="docs-link" @click="router.push('/')">← 返回首页</button>
        <button
          class="docs-theme"
          @click="toggleTheme"
          :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
        >
          {{ isDark ? '☀️' : '🌙' }}
        </button>
      </div>
    </header>

    <div class="docs-body">
      <aside class="docs-sidebar">
        <nav>
          <section
            v-for="section in docSections"
            :key="section.id"
            class="docs-nav-section"
          >
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
        <article
          class="docs-content"
          ref="contentRef"
          v-html="html"
          @click="onContentClick"
        ></article>
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

.docs-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.docs-link,
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
.docs-link:hover,
.docs-theme:hover {
  border-color: var(--accent);
  color: var(--accent);
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
  justify-content: center;
}
.docs-content {
  width: 100%;
  max-width: 820px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-8) var(--space-8);
  box-shadow: var(--shadow-sm);
  line-height: 1.75;
  font-size: 15px;
  color: var(--text-body);
  overflow-x: auto;
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
  .docs-body {
    grid-template-columns: 1fr;
  }
  .docs-sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-light);
  }
  .docs-nav-list {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .docs-content-wrap {
    padding: var(--space-5) var(--space-4);
  }
  .docs-content {
    padding: var(--space-5);
  }
}
</style>
