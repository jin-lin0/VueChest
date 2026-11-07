<template>
  <div class="checkin-management">
    <div class="page-header">
      <div>
        <h1>🔄 自动签到</h1>
        <p class="page-desc">
          配置你本人的站点凭据、手动执行并查看自己的签到与操作记录，多个超管互不影响
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
        <span class="summary-sub">共 {{ tasks.length }} 个签到站点</span>
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
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 账号配置 -->
    <section v-if="activeTab === 'tasks'">
      <div v-if="loadingTasks && tasks.length === 0" class="loading-state">
        <div class="vc-loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <EmptyState
        v-else-if="tasks.length === 0"
        icon="🔌"
        title="暂无已注册的签到站点"
        description="在 services/checkins 中实现适配器并注册到任务清单后即可在这里配置"
      />

      <div v-else class="task-list">
        <article v-for="task in tasks" :key="task.id" class="task-card">
          <header class="task-head">
            <div class="task-title-wrap">
              <div class="task-title-row">
                <h2>{{ task.name }}</h2>
                <span class="badge" :class="statusClass(task)">{{ statusText(task) }}</span>
              </div>
              <p class="task-id">
                {{ task.id }} · {{ task.timeZone }}
                <template v-if="task.description"> · {{ task.description }}</template>
              </p>
            </div>
            <div class="task-actions">
              <button
                class="btn-secondary btn-sm"
                :disabled="!task.configured || runningIds.has(task.id)"
                :title="task.todayCompleted ? '忽略当日幂等，重新请求上游' : '执行一次签到'"
                @click="runNow(task)"
              >
                <span v-if="runningIds.has(task.id)" class="vc-loading-spinner-sm"></span>
                {{
                  runningIds.has(task.id)
                    ? '执行中...'
                    : task.todayCompleted
                      ? '重新执行'
                      : '立即执行'
                }}
              </button>
              <button
                class="btn-danger btn-sm"
                :disabled="!task.configured || runningIds.has(task.id)"
                @click="clearCredentials(task)"
              >
                清除凭据
              </button>
            </div>
          </header>

          <div class="task-meta">
            <div>
              <span class="meta-label">今日状态</span>
              <span>{{ task.todayCompleted ? '已完成' : '待执行' }}</span>
            </div>
            <div>
              <span class="meta-label">最近完成日</span>
              <span>{{ task.lastCompletedDate || '-' }}</span>
            </div>
            <div>
              <span class="meta-label">最近执行</span>
              <span>{{ task.lastRun ? formatDate(task.lastRun.createdAt) : '暂无记录' }}</span>
            </div>
            <div>
              <span class="meta-label">最近结果</span>
              <span v-if="task.lastRun" :class="task.lastRun.success ? 'text-success' : 'text-danger'">
                {{ task.lastRun.success ? '成功' : '失败' }} · {{ task.lastRun.durationMs }}ms
              </span>
              <span v-else>-</span>
            </div>
            <div>
              <span class="meta-label">最近成功</span>
              <span>{{ formatDate(task.lastSuccessAt) }}</span>
            </div>
            <div>
              <span class="meta-label">最近失败</span>
              <span :class="{ 'text-danger': task.lastFailureAt }">
                {{ formatDate(task.lastFailureAt) }}
              </span>
            </div>
          </div>

          <p v-if="task.lastRun?.detail" class="task-detail" :class="{ danger: !task.lastRun.success }">
            {{ task.lastRun.detail }}
          </p>

          <div class="credential-block">
            <div class="block-title">
              <span>凭据配置</span>
              <span v-if="task.configured" class="configured-hint">
                已配置；重新填写将整体替换
              </span>
            </div>

            <template v-if="task.credentialFields.length > 0">
              <div
                v-for="field in task.credentialFields"
                :key="field.key"
                class="form-group"
              >
                <label :for="`${task.id}-${field.key}`">
                  {{ field.label }}
                  <span v-if="field.required" class="required">*</span>
                </label>
                <div v-if="field.type === 'password'" class="secret-input">
                  <input
                    :id="`${task.id}-${field.key}`"
                    v-model="credentialValues[task.id][field.key]"
                    class="form-input"
                    :type="isFieldVisible(task.id, field.key) ? 'text' : 'password'"
                    :placeholder="field.placeholder || (task.configured ? '已配置，重新填写将整体替换' : '')"
                    autocomplete="new-password"
                    spellcheck="false"
                  />
                  <button
                    type="button"
                    class="reveal-btn"
                    @click="toggleFieldVisible(task.id, field.key)"
                  >
                    {{ isFieldVisible(task.id, field.key) ? '隐藏' : '显示' }}
                  </button>
                </div>
                <textarea
                  v-else-if="field.type === 'textarea'"
                  :id="`${task.id}-${field.key}`"
                  v-model="credentialValues[task.id][field.key]"
                  class="form-input"
                  rows="3"
                  :placeholder="field.placeholder || (task.configured ? '已配置，重新填写将整体替换' : '')"
                  spellcheck="false"
                ></textarea>
                <input
                  v-else
                  :id="`${task.id}-${field.key}`"
                  v-model="credentialValues[task.id][field.key]"
                  class="form-input"
                  type="text"
                  :placeholder="field.placeholder || (task.configured ? '已配置，重新填写将整体替换' : '')"
                  spellcheck="false"
                />
                <p v-if="field.help" class="field-help">{{ field.help }}</p>
              </div>
            </template>

            <div v-else class="form-group">
              <label :for="`${task.id}-json`">凭据 JSON <span class="required">*</span></label>
              <textarea
                :id="`${task.id}-json`"
                v-model="jsonValues[task.id]"
                class="form-input mono"
                rows="4"
                placeholder='{"key": "value"}'
                spellcheck="false"
              ></textarea>
              <p class="field-help">该适配器未声明字段元数据，请直接提交 JSON 对象。</p>
            </div>

            <div class="form-actions">
              <button
                class="btn-primary"
                :disabled="savingIds.has(task.id)"
                @click="saveCredentials(task)"
              >
                <span v-if="savingIds.has(task.id)" class="vc-loading-spinner-sm"></span>
                {{ savingIds.has(task.id) ? '保存中...' : '保存凭据' }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- 执行日志 -->
    <section v-else-if="activeTab === 'logs'" class="panel">
      <div class="toolbar">
        <div class="filter-group">
          <label>站点</label>
          <CustomSelect
            v-model="logTask"
            :options="taskFilterOptions"
            width="190px"
            searchable
            aria-label="按站点筛选执行日志"
            @change="fetchLogs(1)"
          />
        </div>
        <div class="filter-group">
          <label>结果</label>
          <CustomSelect
            v-model="logSuccess"
            :options="resultFilterOptions"
            width="140px"
            aria-label="按结果筛选执行日志"
            @change="fetchLogs(1)"
          />
        </div>
        <button class="btn-secondary" @click="fetchLogs(logPage)">刷新</button>
      </div>

      <div v-if="loadingLogs" class="loading-state">
        <div class="vc-loading-spinner"></div>
        <span>加载中...</span>
      </div>
      <EmptyState
        v-else-if="logs.length === 0"
        icon="📋"
        title="暂无执行记录"
        description="执行任意签到任务后，这里会记录结果、耗时和脱敏摘要。"
      />
      <template v-else>
        <div class="table-wrapper">
          <table class="record-table">
            <thead>
              <tr>
                <th>执行时间</th>
                <th>站点</th>
                <th>结果</th>
                <th>耗时</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in logs" :key="row.id">
                <td class="col-date">{{ formatDate(row.createdAt) }}</td>
                <td>{{ taskName(row.task) }}</td>
                <td>
                  <span class="badge" :class="row.success ? 'badge-success' : 'badge-danger'">
                    {{ row.success ? '成功' : '失败' }}
                  </span>
                </td>
                <td class="col-duration">{{ row.durationMs }}ms</td>
                <td class="detail-cell">{{ row.detail || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button class="page-btn" :disabled="logPage <= 1" @click="fetchLogs(logPage - 1)">
            ← 上一页
          </button>
          <span class="page-info">第 {{ logPage }} 页 · 共 {{ logTotal }} 条</span>
          <button
            class="page-btn"
            :disabled="logPage * pageSize >= logTotal"
            @click="fetchLogs(logPage + 1)"
          >
            下一页 →
          </button>
        </div>
      </template>
    </section>

    <!-- 操作记录 -->
    <section v-else class="panel">
      <div class="toolbar">
        <div class="filter-group">
          <label>站点</label>
          <CustomSelect
            v-model="auditTask"
            :options="taskFilterOptions"
            width="190px"
            searchable
            aria-label="按站点筛选操作记录"
            @change="fetchAudits(1)"
          />
        </div>
        <button class="btn-secondary" @click="fetchAudits(auditPage)">刷新</button>
      </div>

      <div v-if="loadingAudits" class="loading-state">
        <div class="vc-loading-spinner"></div>
        <span>加载中...</span>
      </div>
      <EmptyState
        v-else-if="audits.length === 0"
        icon="🗂️"
        title="暂无操作记录"
        description="保存或清除凭据后，这里会留下对应超管的操作审计。"
      />
      <template v-else>
        <div class="table-wrapper">
          <table class="record-table">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>站点</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in audits" :key="row.id">
                <td class="col-date">{{ formatDate(row.createdAt) }}</td>
                <td>{{ taskName(row.task) }}</td>
                <td class="detail-cell">{{ row.detail || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button
            class="page-btn"
            :disabled="auditPage <= 1"
            @click="fetchAudits(auditPage - 1)"
          >
            ← 上一页
          </button>
          <span class="page-info">第 {{ auditPage }} 页 · 共 {{ auditTotal }} 条</span>
          <button
            class="page-btn"
            :disabled="auditPage * pageSize >= auditTotal"
            @click="fetchAudits(auditPage + 1)"
          >
            下一页 →
          </button>
        </div>
      </template>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Toast from '@/components/common/Toast.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import CustomSelect, { type SelectOption } from '@/components/common/CustomSelect.vue'
import { api } from '@/lib/request'
import { useConfirm } from '@/composables/useConfirm'

type CredentialFieldType = 'password' | 'text' | 'textarea'

interface CredentialField {
  key: string
  label: string
  type?: CredentialFieldType
  required?: boolean
  placeholder?: string
  help?: string
}

interface RunRecord {
  id: number
  success: boolean
  durationMs: number
  detail?: string | null
  createdAt: string
}

interface TaskItem {
  id: string
  name: string
  description?: string
  timeZone: string
  credentialFields: CredentialField[]
  configured: boolean
  running: boolean
  todayCompleted: boolean
  lastCompletedDate: string | null
  lastRun: RunRecord | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

interface LogRecord extends RunRecord {
  task: string
}

interface PagedData<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

interface RunResult {
  task: string
  status: string
  summary: string
  recorded?: boolean
}

type TabKey = 'tasks' | 'logs' | 'audits'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'tasks', label: '账号配置' },
  { key: 'logs', label: '执行日志' },
  { key: 'audits', label: '操作记录' },
]

const { confirm } = useConfirm()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)

function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const activeTab = ref<TabKey>('tasks')
const tasks = ref<TaskItem[]>([])
const taskFilterOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部站点' },
  ...tasks.value.map((task) => ({ value: task.id, label: task.name })),
])
const resultFilterOptions: SelectOption[] = [
  { value: '', label: '全部结果' },
  { value: 'true', label: '成功' },
  { value: 'false', label: '失败' },
]
const loadingTasks = ref(false)
const savingIds = reactive(new Set<string>())
const runningIds = reactive(new Set<string>())
const credentialValues = reactive<Record<string, Record<string, string>>>({})
const jsonValues = reactive<Record<string, string>>({})
const visibleFields = reactive(new Set<string>())

const logs = ref<LogRecord[]>([])
const logTotal = ref(0)
const logPage = ref(1)
const loadingLogs = ref(false)
const logTask = ref('')
const logSuccess = ref('')

const audits = ref<LogRecord[]>([])
const auditTotal = ref(0)
const auditPage = ref(1)
const loadingAudits = ref(false)
const auditTask = ref('')

const pageSize = 20

const configuredCount = computed(() => tasks.value.filter((task) => task.configured).length)
const todayCompletedCount = computed(
  () => tasks.value.filter((task) => task.todayCompleted).length,
)
const recentFailureCount = computed(
  () => tasks.value.filter((task) => task.lastRun && !task.lastRun.success).length,
)

onMounted(loadTasks)

async function loadTasks() {
  loadingTasks.value = true
  try {
    const { data } = await api.get<{ data: { items: TaskItem[] } }>(
      '/api/checkins/admin/tasks',
    )
    tasks.value = data.items
    for (const task of data.items) {
      if (!credentialValues[task.id]) {
        credentialValues[task.id] = Object.fromEntries(
          task.credentialFields.map((field) => [field.key, '']),
        )
      } else {
        // 新适配器字段或热更新后补齐 key，已输入内容保持不变。
        for (const field of task.credentialFields) {
          if (!(field.key in credentialValues[task.id])) credentialValues[task.id][field.key] = ''
        }
      }
      if (jsonValues[task.id] === undefined) jsonValues[task.id] = ''
    }
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '加载签到任务失败')
  } finally {
    loadingTasks.value = false
  }
}

function switchTab(tab: TabKey) {
  activeTab.value = tab
  if (tab === 'logs') fetchLogs(1)
  if (tab === 'audits') fetchAudits(1)
}

function isFieldVisible(taskId: string, key: string) {
  return visibleFields.has(`${taskId}:${key}`)
}

function toggleFieldVisible(taskId: string, key: string) {
  const id = `${taskId}:${key}`
  if (visibleFields.has(id)) visibleFields.delete(id)
  else visibleFields.add(id)
}

function buildPayload(task: TaskItem): Record<string, string> {
  if (task.credentialFields.length === 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonValues[task.id] || '{}')
    } catch {
      throw new Error('凭据 JSON 格式不正确')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('凭据 JSON 必须是对象')
    return parsed as Record<string, string>
  }
  const payload: Record<string, string> = {}
  for (const field of task.credentialFields) {
    const value = (credentialValues[task.id][field.key] || '').trim()
    if (!value && !task.configured) {
      throw new Error(`请填写 ${field.label}`)
    }
    if (value) payload[field.key] = value
  }
  if (Object.keys(payload).length === 0) throw new Error('请至少填写一个凭据字段')
  return payload
}

async function saveCredentials(task: TaskItem) {
  let payload: Record<string, string>
  try {
    payload = buildPayload(task)
  } catch (error) {
    showToast('warning', error instanceof Error ? error.message : '凭据格式不正确')
    return
  }

  savingIds.add(task.id)
  try {
    await api.put(`/api/checkins/admin/credentials/${encodeURIComponent(task.id)}`, payload)
    for (const key of Object.keys(credentialValues[task.id])) credentialValues[task.id][key] = ''
    jsonValues[task.id] = ''
    showToast('success', `${task.name} 凭据已保存`)
    await loadTasks()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '保存凭据失败')
  } finally {
    savingIds.delete(task.id)
  }
}

async function runNow(task: TaskItem) {
  const force = task.todayCompleted
  const ok = await confirm(
    force
      ? `${task.name} 今日已完成。重新执行会忽略当日幂等并再次请求上游，确定继续吗？`
      : `确定立即执行 ${task.name} 的签到吗？`,
  )
  if (!ok) return

  runningIds.add(task.id)
  try {
    const { data } = await api.post<{ data: { success: boolean; results: RunResult[] } }>(
      `/api/checkins/admin/tasks/${encodeURIComponent(task.id)}/run`,
      { force },
    )
    const result = data.results[0]
    const statusTextValue = statusLabel(result?.status)
    showToast(
      data.success ? 'success' : 'error',
      `${task.name}：${statusTextValue}${result?.summary ? ` · ${result.summary}` : ''}`,
    )
    await loadTasks()
    if (logs.value.length > 0) await fetchLogs(1)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '执行签到失败')
  } finally {
    runningIds.delete(task.id)
  }
}

async function clearCredentials(task: TaskItem) {
  const ok = await confirm(
    `确定清除 ${task.name} 的凭据吗？清除后该站点会跳过后续定时签到，直到重新录入。`,
  )
  if (!ok) return

  savingIds.add(task.id)
  try {
    await api.delete(`/api/checkins/admin/credentials/${encodeURIComponent(task.id)}`)
    showToast('success', `${task.name} 凭据已清除`)
    await loadTasks()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '清除凭据失败')
  } finally {
    savingIds.delete(task.id)
  }
}

async function fetchLogs(page: number) {
  loadingLogs.value = true
  try {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    })
    if (logTask.value) params.set('task', logTask.value)
    if (logSuccess.value) params.set('success', logSuccess.value)
    const { data } = await api.get<{ data: PagedData<LogRecord> }>(
      `/api/checkins/admin/logs?${params}`,
    )
    logs.value = data.items
    logTotal.value = data.total
    logPage.value = page
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '加载执行日志失败')
  } finally {
    loadingLogs.value = false
  }
}

async function fetchAudits(page: number) {
  loadingAudits.value = true
  try {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    })
    if (auditTask.value) params.set('task', auditTask.value)
    const { data } = await api.get<{ data: PagedData<LogRecord> }>(
      `/api/checkins/admin/audits?${params}`,
    )
    audits.value = data.items
    auditTotal.value = data.total
    auditPage.value = page
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '加载操作记录失败')
  } finally {
    loadingAudits.value = false
  }
}

function taskName(id: string) {
  return tasks.value.find((task) => task.id === id)?.name || id
}

function statusClass(task: TaskItem) {
  if (task.running) return 'badge-info'
  if (!task.configured) return 'badge-muted'
  if (task.todayCompleted) return 'badge-success'
  return 'badge-warning'
}

function statusText(task: TaskItem) {
  if (task.running) return '执行中'
  if (!task.configured) return '未配置'
  if (task.todayCompleted) return '今日已完成'
  return '已配置'
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    success: '签到成功',
    already_done: '今日已签',
    inactive: '活动未开放',
    unconfigured: '未配置凭据',
    skipped: '已跳过',
    failed: '执行失败',
    deferred: '预算不足',
  }
  return (status && labels[status]) || status || '执行完成'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.checkin-management {
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

.task-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.task-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.task-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.task-title-row h2 {
  margin: 0;
  font-size: var(--font-size-title-xl);
  color: var(--text-primary);
}

.task-id {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  word-break: break-all;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.task-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px 18px;
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-hover);
  font-size: var(--font-size-body);
  color: var(--text-primary);
}

.meta-label {
  display: block;
  margin-bottom: 2px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.task-detail {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

.task-detail.danger {
  color: var(--danger-text);
  background: var(--danger-bg);
}

.credential-block {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
}

.block-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.configured-hint {
  font-weight: 400;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}

.required {
  color: var(--danger-text);
}

.form-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  color: var(--text-primary);
  font-size: var(--font-size-body);
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #667eea;
}

.form-input.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--font-size-sm);
}

.secret-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.secret-input .form-input {
  flex: 1;
}

.reveal-btn {
  flex: none;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.reveal-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.field-help {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  border-radius: 9px;
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  padding: 11px 22px;
  font-weight: 500;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 10px 18px;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-bg);
  padding: 10px 18px;
}

.btn-danger:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-sm {
  padding: 8px 14px;
  font-size: var(--font-size-control);
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

.badge-warning {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}

.badge-info {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

.badge-muted {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.text-success {
  color: #059669;
}

.text-danger {
  color: var(--danger-text);
}

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

  .task-head {
    flex-direction: column;
  }

  .task-actions {
    width: 100%;
  }

  .task-actions button {
    flex: 1;
  }
}
</style>
