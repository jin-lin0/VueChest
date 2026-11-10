<template>
  <article class="task-card" :class="{ paused: task.enabled === false }">
    <header class="task-head">
      <div class="task-title-wrap">
        <div class="task-title-row">
          <h2>{{ task.name }}</h2>
          <span class="badge" :class="statusClass">{{ statusText }}</span>
        </div>
        <p class="task-id">
          {{ task.id }} · {{ task.timeZone }}
          <template v-if="task.description"> · {{ task.description }}</template>
        </p>
      </div>
      <div class="task-actions">
        <label
          class="task-switch"
          :title="task.enabled === false ? '已暂停：定时轮次与 worker 都会跳过' : '定时执行中'"
        >
          <input
            type="checkbox"
            :checked="task.enabled !== false"
            :disabled="toggling || (task.requiresCredentials !== false && !task.configured)"
            @change="toggleEnabled"
          />
          <span class="task-switch-track"></span>
        </label>
        <span v-if="task.executor === 'worker'" class="worker-hint">
          由 GitHub Actions 执行
        </span>
        <button
          v-else
          class="btn-secondary btn-sm"
          :disabled="!task.configured || running"
          :title="task.todayCompleted ? '忽略当日幂等，重新请求上游' : '执行一次任务'"
          @click="runNow"
        >
          <span v-if="running" class="vc-loading-spinner-sm"></span>
          {{ running ? '执行中...' : task.todayCompleted ? '重新执行' : '立即执行' }}
        </button>
        <button
          v-if="task.requiresCredentials !== false"
          class="btn-danger btn-sm"
          :disabled="!task.configured || running"
          @click="clearCredentials"
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

    <p
      v-if="task.lastRun?.detail"
      class="task-detail"
      :class="{ danger: !task.lastRun.success }"
    >
      {{ task.lastRun.detail }}
    </p>

    <div v-if="task.requiresCredentials !== false" class="credential-block">
      <div class="block-title">
        <span>凭据配置</span>
        <span v-if="task.configured" class="configured-hint">
          已配置；重新填写将整体替换
        </span>
      </div>

      <template v-if="task.credentialFields.length > 0">
        <div v-for="field in task.credentialFields" :key="field.key" class="form-group">
          <label :for="`${task.id}-${field.key}`">
            {{ field.label }}
            <span v-if="field.required" class="required">*</span>
          </label>
          <div v-if="field.type === 'password'" class="secret-input">
            <input
              :id="`${task.id}-${field.key}`"
              v-model="values[field.key]"
              class="form-input"
              :type="isVisible(field.key) ? 'text' : 'password'"
              :placeholder="placeholder(field)"
              autocomplete="new-password"
              spellcheck="false"
            />
            <button type="button" class="reveal-btn" @click="toggleVisible(field.key)">
              {{ isVisible(field.key) ? '隐藏' : '显示' }}
            </button>
          </div>
          <textarea
            v-else-if="field.type === 'textarea'"
            :id="`${task.id}-${field.key}`"
            v-model="values[field.key]"
            class="form-input"
            rows="3"
            :placeholder="placeholder(field)"
            spellcheck="false"
          ></textarea>
          <input
            v-else
            :id="`${task.id}-${field.key}`"
            v-model="values[field.key]"
            class="form-input"
            type="text"
            :placeholder="placeholder(field)"
            spellcheck="false"
          />
          <p v-if="field.help" class="field-help">{{ field.help }}</p>
        </div>
      </template>

      <div v-else class="form-group">
        <label :for="`${task.id}-json`">凭据 JSON <span class="required">*</span></label>
        <textarea
          :id="`${task.id}-json`"
          v-model="jsonValue"
          class="form-input mono"
          rows="4"
          placeholder='{"key": "value"}'
          spellcheck="false"
        ></textarea>
        <p class="field-help">该适配器未声明字段元数据，请直接提交 JSON 对象。</p>
      </div>

      <div class="form-actions">
        <button class="btn-primary" :disabled="saving" @click="saveCredentials">
          <span v-if="saving" class="vc-loading-spinner-sm"></span>
          {{ saving ? '保存中...' : '保存凭据' }}
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { api } from '@/lib/request'
import { useConfirm } from '@/composables/useConfirm'
import type { CredentialField, RunResult, TaskItem, ToastType } from './types'

const props = defineProps<{ task: TaskItem }>()
const emit = defineEmits<{
  notify: [type: ToastType, message: string]
  changed: []
}>()

const { confirm } = useConfirm()

const saving = ref(false)
const running = ref(false)
const toggling = ref(false)
const jsonValue = ref('')
const visible = reactive(new Set<string>())
// 每个字段单独存草稿：任务列表刷新时不会清掉用户已经输入的内容。
const values = reactive<Record<string, string>>(
  Object.fromEntries(props.task.credentialFields.map((field) => [field.key, ''])),
)

const statusClass = computed(() => {
  const task = props.task
  if (task.running) return 'badge-info'
  if (task.enabled === false) return 'badge-muted'
  if (!task.configured) return 'badge-muted'
  if (task.todayCompleted) return 'badge-success'
  return 'badge-warning'
})

const statusText = computed(() => {
  const task = props.task
  if (task.running) return '执行中'
  if (task.enabled === false) return '已暂停'
  if (task.requiresCredentials === false)
    return task.todayCompleted ? '今日已执行' : '待执行'
  if (!task.configured) return '未配置'
  if (task.todayCompleted) return '今日已完成'
  return '已配置'
})

const isGlobalTask = computed(() => props.task.requiresCredentials === false)

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function placeholder(field: CredentialField) {
  if (field.placeholder) return field.placeholder
  return props.task.configured ? '已配置，重新填写将整体替换' : ''
}

function isVisible(key: string) {
  return visible.has(key)
}

function toggleVisible(key: string) {
  if (visible.has(key)) visible.delete(key)
  else visible.add(key)
}

function buildPayload(): Record<string, string> {
  if (props.task.credentialFields.length === 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonValue.value || '{}')
    } catch {
      throw new Error('凭据 JSON 格式不正确')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('凭据 JSON 必须是对象')
    return parsed as Record<string, string>
  }
  const payload: Record<string, string> = {}
  for (const field of props.task.credentialFields) {
    const value = (values[field.key] || '').trim()
    if (!value && !props.task.configured) throw new Error(`请填写 ${field.label}`)
    if (value) payload[field.key] = value
  }
  if (Object.keys(payload).length === 0) throw new Error('请至少填写一个凭据字段')
  return payload
}

async function saveCredentials() {
  let payload: Record<string, string>
  try {
    payload = buildPayload()
  } catch (error) {
    emit('notify', 'warning', error instanceof Error ? error.message : '凭据格式不正确')
    return
  }

  saving.value = true
  try {
    await api.put(`/api/daily/admin/credentials/${encodeURIComponent(props.task.id)}`, payload)
    for (const key of Object.keys(values)) values[key] = ''
    jsonValue.value = ''
    emit('notify', 'success', `${props.task.name} 凭据已保存`)
    emit('changed')
  } catch (error) {
    emit('notify', 'error', error instanceof Error ? error.message : '保存凭据失败')
  } finally {
    saving.value = false
  }
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    success: isGlobalTask.value ? '执行成功' : '签到成功',
    already_done: '今日已签',
    inactive: '活动未开放',
    unconfigured: '未配置凭据',
    skipped: '已跳过',
    failed: '执行失败',
    deferred: '预算不足',
  }
  return (status && labels[status]) || status || '执行完成'
}

async function runNow() {
  const { task } = props
  const force = task.todayCompleted
  const message = isGlobalTask.value
    ? force
      ? `${task.name} 今天已经发过。确定再生成并发送一次吗？`
      : `确定立即生成 ${task.name} 并发送邮件吗？`
    : force
      ? `${task.name} 今日已完成。重新执行会忽略当日幂等并再次请求上游，确定继续吗？`
      : `确定立即执行 ${task.name} 吗？`
  if (!(await confirm(message))) return

  running.value = true
  try {
    const { data } = await api.post<{ data: { success: boolean; results: RunResult[] } }>(
      `/api/daily/admin/tasks/${encodeURIComponent(task.id)}/run`,
      { force },
    )
    const result = data.results[0]
    emit(
      'notify',
      data.success ? 'success' : 'error',
      `${task.name}：${statusLabel(result?.status)}${result?.summary ? ` · ${result.summary}` : ''}`,
    )
    emit('changed')
  } catch (error) {
    emit('notify', 'error', error instanceof Error ? error.message : '执行任务失败')
  } finally {
    running.value = false
  }
}

async function toggleEnabled(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  toggling.value = true
  try {
    await api.put(`/api/daily/admin/tasks/${encodeURIComponent(props.task.id)}/enabled`, {
      enabled,
    })
    emit(
      'notify',
      'success',
      enabled ? `${props.task.name} 已恢复定时执行` : `${props.task.name} 已暂停，定时轮次会跳过`,
    )
    emit('changed')
  } catch (error) {
    emit('notify', 'error', error instanceof Error ? error.message : '切换任务开关失败')
    emit('changed')
  } finally {
    toggling.value = false
  }
}

async function clearCredentials() {
  const { task } = props
  if (!(await confirm(`确定清除 ${task.name} 的凭据吗？清除后该站点会跳过后续定时执行，直到重新录入。`)))
    return

  saving.value = true
  try {
    await api.delete(`/api/daily/admin/credentials/${encodeURIComponent(task.id)}`)
    emit('notify', 'success', `${task.name} 凭据已清除`)
    emit('changed')
  } catch (error) {
    emit('notify', 'error', error instanceof Error ? error.message : '清除凭据失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.task-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.task-card.paused {
  opacity: 0.72;
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
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.worker-hint {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: var(--font-size-small);
}

.task-switch {
  position: relative;
  display: inline-flex;
  width: 34px;
  height: 20px;
  flex: 0 0 auto;
  cursor: pointer;
}

.task-switch input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.task-switch-track {
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--border-color, #d1d5db);
  transition: background 0.18s ease;
}

.task-switch-track::after {
  content: '';
  display: block;
  width: 16px;
  height: 16px;
  margin: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  transition: transform 0.18s ease;
}

.task-switch input:checked + .task-switch-track {
  background: var(--primary-color, #6366f1);
}

.task-switch input:checked + .task-switch-track::after {
  transform: translateX(14px);
}

.task-switch input:disabled + .task-switch-track {
  opacity: 0.5;
  cursor: not-allowed;
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

@media (max-width: 720px) {
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
