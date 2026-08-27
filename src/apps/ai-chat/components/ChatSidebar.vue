<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { EmptyState } from '@/components'
import type { ConversationSummary } from '../config'

defineProps<{
  showSidebar: boolean
  sessions: ConversationSummary[]
  currentId: string | null
  loading?: boolean
  hasMore?: boolean
}>()

const emit = defineEmits<{
  back: []
  new: []
  select: [id: string]
  delete: [id: string]
  rename: [id: string, title: string]
  search: [query: string]
  loadMore: []
}>()

const query = ref('')
const editingId = ref<string | null>(null)
const editingTitle = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => emit('search', value.trim()), 250)
})

function startRename(session: ConversationSummary) {
  editingId.value = session.id
  editingTitle.value = session.title
}

function saveRename() {
  const title = editingTitle.value.trim()
  if (editingId.value && title) emit('rename', editingId.value, title)
  editingId.value = null
}

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <div class="chat-sidebar">
    <div class="sidebar-header">
      <button class="btn-icon" @click="emit('back')" title="返回首页">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h3 v-if="showSidebar">AI 对话</h3>
      <button class="btn-icon" @click="emit('new')" title="新对话">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
    <div v-if="showSidebar" class="session-list">
      <input
        v-model="query"
        class="session-search"
        type="search"
        placeholder="搜索会话"
        aria-label="搜索会话"
      />
      <div
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === currentId }"
        role="button"
        tabindex="0"
        @click="emit('select', session.id)"
        @keydown.enter="emit('select', session.id)"
        @keydown.space.prevent="emit('select', session.id)"
      >
        <input
          v-if="editingId === session.id"
          v-model="editingTitle"
          class="rename-input"
          maxlength="60"
          aria-label="修改会话标题"
          @click.stop
          @keydown.enter.stop.prevent="saveRename"
          @keydown.esc.stop="editingId = null"
          @blur="saveRename"
        />
        <div v-else class="session-title">{{ session.title }}</div>
        <div v-if="editingId !== session.id" class="session-actions">
          <button class="session-action" title="重命名" @click.stop="startRename(session)">
            ✎
          </button>
          <button
            class="session-action danger"
            title="删除对话"
            @click.stop="emit('delete', session.id)"
          >
            ×
          </button>
        </div>
      </div>
      <button v-if="hasMore" class="load-more" :disabled="loading" @click="emit('loadMore')">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
      <EmptyState v-if="!loading && sessions.length === 0" title="没有匹配的会话" />
    </div>
  </div>
</template>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
}

.sidebar-header h3 {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.btn-icon {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: var(--bg-hover);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
}

.session-search,
.rename-input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: 7px;
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
}

.session-search {
  margin-bottom: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.session-search:focus,
.rename-input:focus {
  border-color: var(--accent);
}

.session-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
  transition: background 0.2s;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: rgba(var(--accent-rgb), 0.3);
}

.session-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 4px;
}

.rename-input {
  padding: 4px 6px;
  font-size: 12px;
}

.session-actions {
  display: flex;
  opacity: 0;
  transition: opacity 0.2s;
}

.session-action {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 14px;
}

.session-item:hover .session-actions,
.session-item:focus-within .session-actions {
  opacity: 1;
}

.session-action:hover {
  color: var(--accent);
}

.session-action.danger:hover {
  color: var(--danger);
}

.load-more {
  width: 100%;
  margin-top: 6px;
  padding: 7px;
  border: 0;
  border-radius: 7px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
}
</style>
