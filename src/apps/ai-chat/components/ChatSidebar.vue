<script setup lang="ts">
import { EmptyState } from '@/components'

defineProps<{
  showSidebar: boolean
  sessions: any[]
  currentId: string | null
}>()

const emit = defineEmits<{
  back: []
  new: []
  select: [id: string]
  delete: [id: string]
}>()
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
      <div
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === currentId }"
        @click="emit('select', session.id)"
      >
        <div class="session-title">{{ session.title }}</div>
        <button
          class="btn-delete"
          @click.stop="emit('delete', session.id)"
          title="删除对话（仅本地）"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <EmptyState v-if="sessions.length === 0" title="暂无对话" />
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

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  opacity: 0;
  transition:
    opacity 0.2s,
    color 0.2s;
}

.session-item:hover .btn-delete {
  opacity: 1;
}

.btn-delete:hover {
  color: var(--danger);
}

</style>
