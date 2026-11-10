<template>
  <div class="daily-tasks">
    <div class="page-header">
      <div>
        <h1>🗓️ 每日任务</h1>
        <p class="page-desc">
          配置站点凭据、查看每日定时任务的执行记录；股票日报等全局任务也在同一页手动触发
        </p>
      </div>
      <button class="btn-secondary" :disabled="loadingTasks" @click="loadTasks">
        <span v-if="loadingTasks" class="vc-loading-spinner-sm"></span>
        {{ loadingTasks ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">已配置任务</span>
        <strong class="summary-value">{{ configuredCount }}</strong>
        <span class="summary-sub">共 {{ tasks.length }} 个任务</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">今日已完成</span>
        <strong class="summary-value">{{ todayCompletedCount }}</strong>
        <span class="summary-sub">按各站点本地时区统计</span>
      </div>
      <div class="summary-card" :class="{ danger: recentFailureCount > 0 }">
        <span class="summary-label">最近执行失败</span>
        <strong class="summary-value">{{ recentFailureCount }}</strong>
        <span class="summary-sub">{{ recentFailureCount ? '请查看执行日志' : '暂无异常' }}</span>
      </div>
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'tasks'">
      <div v-if="loadingTasks && tasks.length === 0" class="loading-state">
        <div class="vc-loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <EmptyState
        v-else-if="tasks.length === 0"
        icon="🔌"
        title="暂无已注册的任务"
        description="在 services/daily 中实现适配器并注册到任务清单后即可在这里配置"
      />

      <div v-else class="task-list">
        <DailyTaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @notify="showToast"
          @changed="loadTasks"
        />
      </div>
    </section>

    <ExecutionLogs
      v-else-if="activeTab === 'logs'"
      v-model:task-filter="logTask"
      v-model:result-filter="logSuccess"
      :tasks="tasks"
      @notify="showToast"
    />
    <ConfigAudits v-else v-model:task-filter="auditTask" :tasks="tasks" @notify="showToast" />

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Toast from '@/components/common/Toast.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { api } from '@/lib/request'
import DailyTaskCard from './daily/DailyTaskCard.vue'
import ExecutionLogs from './daily/ExecutionLogs.vue'
import ConfigAudits from './daily/ConfigAudits.vue'
import type { TaskItem, ToastType } from './daily/types'

type TabKey = 'tasks' | 'logs' | 'audits'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'tasks', label: '账号配置' },
  { key: 'logs', label: '执行日志' },
  { key: 'audits', label: '操作记录' },
]

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const activeTab = ref<TabKey>('tasks')
const tasks = ref<TaskItem[]>([])
const loadingTasks = ref(false)
const logTask = ref('')
const logSuccess = ref('')
const auditTask = ref('')

const configuredCount = computed(() => tasks.value.filter((task) => task.configured).length)
const todayCompletedCount = computed(() => tasks.value.filter((task) => task.todayCompleted).length)
const recentFailureCount = computed(
  () => tasks.value.filter((task) => task.lastRun && !task.lastRun.success).length,
)

function showToast(type: ToastType, message: string) {
  toastRef.value?.addToast(type, message)
}

async function loadTasks() {
  loadingTasks.value = true
  try {
    const { data } = await api.get<{ data: { items: TaskItem[] } }>('/api/daily/admin/tasks')
    tasks.value = data.items
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '加载每日任务失败')
  } finally {
    loadingTasks.value = false
  }
}

onMounted(loadTasks)
</script>

<style scoped>
.daily-tasks {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0;
  font-size: var(--font-size-5xl);
  color: var(--text-primary);
}

.page-desc {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.summary-card.danger {
  border-color: var(--danger-text);
}

.summary-label {
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}

.summary-value {
  font-size: var(--font-size-5xl);
  color: var(--text-primary);
  line-height: 1.1;
}

.summary-card.danger .summary-value {
  color: var(--danger-text);
}

.summary-sub {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.tabs {
  display: flex;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  padding: 9px 18px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

@media (max-width: 720px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
