<template>
  <div class="knowledge-docs">
    <header class="docs-header">
      <button class="back-button" @click="goBack">← 返回题库</button>
      <h1>📖 知识文档</h1>
      <p class="subtitle">按知识点系统整理的面试复习资料</p>
    </header>

    <div class="docs-body">
      <aside class="docs-sidebar">
        <div class="doc-switcher">
          <button
            v-for="doc in docs"
            :key="doc.id"
            class="doc-tab"
            :class="{ active: doc.id === activeDocId }"
            @click="switchDoc(doc.id)"
          >
            <span class="doc-tab-icon">{{ doc.icon }}</span>
            <span class="doc-tab-text">
              <span class="doc-tab-name">{{ doc.name }}</span>
              <span class="doc-tab-desc">{{ doc.description }}</span>
            </span>
          </button>
        </div>

        <nav class="doc-toc" v-if="toc.length">
          <div class="toc-title">目录</div>
          <a
            v-for="item in toc"
            :key="item.id"
            class="toc-item"
            :class="{ active: item.id === activeSection }"
            @click="scrollToSection(item.id)"
          >
            {{ item.text }}
          </a>
        </nav>
      </aside>

      <article class="docs-content" ref="contentRef">
        <MarkdownView :content="currentDoc.content" :toc-level="2" />
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MarkdownView } from '@/components'
import { knowledgeDocs as docs } from '../knowledge'
import { extractToc, type TocItem } from '@/lib/markdown'

const router = useRouter()
const route = useRoute()

const initialDoc = (route.query.doc as string) ?? ''
const activeDocId = ref(
  initialDoc && docs.some((d) => d.id === initialDoc) ? initialDoc : (docs[0]?.id ?? ''),
)
const activeSection = ref('')
const contentRef = ref<HTMLElement | null>(null)

const currentDoc = computed(() => docs.find((d) => d.id === activeDocId.value) ?? docs[0])

// 从 markdown 提取二级标题作为目录（跳过代码块内的 ```）
const toc = computed<TocItem[]>(() => extractToc(currentDoc.value?.content ?? '', 2))

const goBack = () => router.push('/interview')

// 切换文档：更新状态 + 同步 URL 深链 + 回到顶部
const selectDoc = (id: string, opts: { pushUrl?: boolean; smooth?: boolean } = {}) => {
  if (!docs.some((d) => d.id === id)) return
  activeDocId.value = id
  activeSection.value = ''
  if (opts.pushUrl) router.push({ path: '/interview/docs', query: { doc: id } })
  nextTick(() => contentRef.value?.scrollTo({ top: 0, behavior: opts.smooth ? 'smooth' : 'auto' }))
}

const switchDoc = (id: string) => selectDoc(id, { pushUrl: true, smooth: true })

// 深链：URL ?doc= 变化时同步（支持分享/直达某篇）
watch(
  () => route.query.doc,
  (doc) => {
    if (doc && doc !== activeDocId.value) selectDoc(doc as string)
  },
)

const scrollToSection = (id: string) => {
  activeSection.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 滚动时高亮当前所在章节
const onScroll = () => {
  let current = ''
  for (const id of toc.value.map((t) => t.id)) {
    const el = document.getElementById(id)
    if (el && el.getBoundingClientRect().top <= 140) current = id
  }
  if (current) activeSection.value = current
}

onMounted(() => {
  contentRef.value?.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  contentRef.value?.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.knowledge-docs {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.docs-header {
  text-align: center;
  margin-bottom: 24px;
  position: relative;
}

.back-button {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  background-color: var(--accent);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.back-button:hover {
  background-color: var(--accent-strong);
  transform: translateY(-50%) translateX(-2px);
}

.docs-header h1 {
  font-size: 2.2rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 1.05rem;
}

.docs-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  align-items: start;
}

/* 侧边栏 */
.docs-sidebar {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.doc-switcher {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.doc-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 2px solid var(--border-light);
  background: var(--bg-card);
  cursor: pointer;
  text-align: left;
  transition: all 0.25s ease;
}

.doc-tab:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.doc-tab.active {
  background: var(--gradient-primary);
  border-color: transparent;
  box-shadow: 0 4px 15px rgba(var(--accent-rgb), 0.3);
}

.doc-tab-icon {
  font-size: 1.6rem;
  flex-shrink: 0;
}

.doc-tab-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-tab-name {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-primary);
}

.doc-tab-desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.doc-tab.active .doc-tab-name,
.doc-tab.active .doc-tab-desc {
  color: white;
}

.doc-tab.active .doc-tab-desc {
  opacity: 0.85;
}

/* 目录 */
.doc-toc {
  background: var(--bg-card);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  max-height: calc(100vh - 280px);
  overflow-y: auto;
}

.toc-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.toc-item {
  display: block;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 0.9rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.toc-item:hover {
  background: var(--accent-bg);
  color: var(--accent);
}

.toc-item.active {
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 600;
  border-left-color: var(--accent);
}

/* 内容区 */
.docs-content {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 32px 40px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}

/* 响应式 */
@media (max-width: 900px) {
  .docs-body {
    grid-template-columns: 1fr;
  }

  .docs-sidebar {
    position: static;
  }

  .doc-switcher {
    flex-direction: row;
  }

  .doc-tab {
    flex: 1;
  }

  .doc-toc {
    display: none;
  }

  .docs-content {
    max-height: none;
    padding: 24px 20px;
  }
}

@media (max-width: 768px) {
  .docs-header {
    padding-top: 50px;
  }

  .back-button {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin-bottom: 10px;
  }

  .back-button:hover {
    transform: translateX(-2px);
  }
}
</style>
