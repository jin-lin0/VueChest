<template>
  <div v-if="loading" class="loading-state">
    <div class="vc-loading-spinner"></div>
    <span>加载中...</span>
  </div>
  <EmptyState
    v-else-if="rows.length === 0"
    :icon="emptyIcon"
    :title="emptyTitle"
    :description="emptyDescription"
  />
  <template v-else>
    <div class="table-wrapper">
      <table class="record-table">
        <thead>
          <tr>
            <th>{{ dateLabel }}</th>
            <th>站点</th>
            <template v-if="variant === 'execution'">
              <th>结果</th>
              <th>耗时</th>
              <th>摘要</th>
            </template>
            <th v-else>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="col-date">{{ formatDate(row.createdAt) }}</td>
            <td>{{ taskNames[row.task] || row.task }}</td>
            <template v-if="variant === 'execution'">
              <td>
                <span class="badge" :class="row.success ? 'badge-success' : 'badge-danger'">
                  {{ row.success ? '成功' : '失败' }}
                </span>
              </td>
              <td class="col-duration">{{ row.durationMs }}ms</td>
            </template>
            <td class="detail-cell">{{ row.detail || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <button class="page-btn" :disabled="!hasPrev" @click="emit('page', page - 1)">
        ← 上一页
      </button>
      <span class="page-info">第 {{ page }} 页 · 共 {{ total }} 条</span>
      <button class="page-btn" :disabled="!hasNext" @click="emit('page', page + 1)">
        下一页 →
      </button>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { LogRecord } from './types'

const props = defineProps<{
  variant: 'execution' | 'audit'
  rows: LogRecord[]
  taskNames: Record<string, string>
  loading: boolean
  page: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  emptyIcon: string
  emptyTitle: string
  emptyDescription: string
}>()

const emit = defineEmits<{ page: [page: number] }>()

const dateLabel = computed(() => (props.variant === 'execution' ? '执行时间' : '操作时间'))

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.record-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-body);
}

.record-table th,
.record-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  vertical-align: top;
}

.record-table th {
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.record-table tbody tr:last-child td {
  border-bottom: none;
}

.record-table tbody tr {
  transition: background 0.15s ease;
}

.record-table tbody tr:hover {
  background: var(--bg-hover);
}

.col-date {
  white-space: nowrap;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.col-duration {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.detail-cell {
  max-width: 520px;
  word-break: break-word;
  white-space: pre-wrap;
  color: var(--text-secondary);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  white-space: nowrap;
}

.badge-success {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.badge-danger {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
}

.page-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
</style>
