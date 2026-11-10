<template>
  <section class="panel">
    <div class="toolbar">
      <div class="filter-group">
        <label>站点</label>
        <CustomSelect
          v-model="taskFilter"
          :options="taskOptions"
          :searchable="taskOptions.length > 7"
          width="190px"
          aria-label="按站点筛选执行日志"
          @change="reload"
        />
      </div>
      <div class="filter-group">
        <label>结果</label>
        <CustomSelect
          v-model="resultFilter"
          :options="resultOptions"
          width="140px"
          aria-label="按结果筛选执行日志"
          @change="reload"
        />
      </div>
      <button class="btn-secondary" @click="reload">刷新</button>
    </div>

    <RunsTable
      variant="execution"
      :rows="items"
      :task-names="taskNames"
      :loading="loading"
      :page="page"
      :total="total"
      :has-prev="hasPrev"
      :has-next="hasNext"
      empty-icon="📋"
      empty-title="暂无执行记录"
      empty-description="执行任意每日任务后，这里会记录结果、耗时和脱敏摘要。"
      @page="loadPage"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CustomSelect, { type SelectOption } from '@/components/common/CustomSelect.vue'
import RunsTable from './RunsTable.vue'
import { usePagedRuns } from '@/composables/usePagedRuns'
import type { LogRecord, TaskItem, ToastType } from './types'

const props = defineProps<{ tasks: TaskItem[] }>()
const emit = defineEmits<{
  notify: [type: ToastType, message: string]
}>()

// 筛选状态由父组件持有，切 tab 后回到本页仍保留原来选的站点与结果。
const taskFilter = defineModel<string>('taskFilter', { required: true })
const resultFilter = defineModel<string>('resultFilter', { required: true })

const taskOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部站点' },
  ...props.tasks.map((task) => ({ value: task.id, label: task.name })),
])
const resultOptions: SelectOption[] = [
  { value: '', label: '全部结果' },
  { value: 'true', label: '成功' },
  { value: 'false', label: '失败' },
]
const taskNames = computed(() =>
  Object.fromEntries(props.tasks.map((task) => [task.id, task.name])),
)

const { items, total, page, loading, hasNext, hasPrev, load } = usePagedRuns<LogRecord>(
  '/api/daily/admin/logs',
  {
    errorMessage: '加载执行日志失败',
    onError: (message) => emit('notify', 'error', message),
  },
)

function reload() {
  void load(1, {
    task: taskFilter.value,
    success: resultFilter.value,
  })
}

function loadPage(target: number) {
  void load(target)
}

onMounted(reload)
</script>

<style scoped>
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 18px;
}

.toolbar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 170px;
}

.filter-group label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 10px 18px;
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}
</style>
