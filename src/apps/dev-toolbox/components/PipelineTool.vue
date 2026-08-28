<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { strToU8, zipSync } from 'fflate'
import { CopyButton, CustomSelect, type SelectOption } from '@/components'
import { copyToClipboard } from '@/utils/clipboard'
import { debounce, downloadFile } from '@/utils/common'
import { useToast } from '@/composables/useToast'
import { useRealtime } from '../composables/useRealtime'
import {
  decodePipeline,
  encodePipeline,
  PIPELINE_OPERATIONS,
  runPipeline,
  type PipelineStep,
} from '../pipeline'

defineOptions({ name: 'PipelineTool' })

interface Preset {
  id: string
  name: string
  steps: PipelineStep[]
}

interface HistoryItem {
  id: string
  createdAt: number
  input: string
  output: string
  steps: PipelineStep[]
}

interface BatchResult {
  id: string
  name: string
  size: number
  output?: string
  error?: string
}

const STORAGE = {
  presets: 'dev-toolbox:pipeline:presets',
  history: 'dev-toolbox:pipeline:history',
  input: 'dev-toolbox:pipeline:input',
  privacy: 'dev-toolbox:pipeline:privacy',
}

const route = useRoute()
const { addToast } = useToast()
const input = ref('')
const output = ref('')
const stages = ref<Array<{ step: PipelineStep; output: string }>>([])
const steps = ref<PipelineStep[]>([
  { id: crypto.randomUUID(), operation: 'trim-lines' },
  { id: crypto.randomUUID(), operation: 'unique-lines' },
])
const busy = ref(false)
const error = ref('')
const privacyMode = ref(localStorage.getItem(STORAGE.privacy) === '1')
const presets = ref<Preset[]>([])
const history = ref<HistoryItem[]>([])
const presetName = ref('')
const batchResults = ref<BatchResult[]>([])
const batchBusy = ref(false)
const batchCompleted = ref(0)
const batchTotal = ref(0)
const batchDragging = ref(false)
const batchInput = ref<HTMLInputElement | null>(null)
const editingPresetId = ref<string | null>(null)
const editingPresetName = ref('')
let batchDragDepth = 0

const operationOptions: SelectOption[] = PIPELINE_OPERATIONS.map((item) => ({ ...item }))
const canRun = computed(() => Boolean(input.value && steps.value.length && !busy.value))
const successfulBatchResults = computed(() =>
  batchResults.value.filter((item) => item.output !== undefined),
)
const failedBatchCount = computed(
  () => batchResults.value.length - successfulBatchResults.value.length,
)
const realtimeRun = debounce(() => void execute(false), 220)
useRealtime(realtimeRun, { watch: [input, steps], deep: true })

function persistPresets() {
  localStorage.setItem(STORAGE.presets, JSON.stringify(presets.value))
}

function persistHistory() {
  if (!privacyMode.value) localStorage.setItem(STORAGE.history, JSON.stringify(history.value))
}

onMounted(() => {
  try {
    presets.value = JSON.parse(localStorage.getItem(STORAGE.presets) || '[]')
    history.value = privacyMode.value
      ? []
      : JSON.parse(localStorage.getItem(STORAGE.history) || '[]')
  } catch {
    presets.value = []
    history.value = []
  }
  if (!privacyMode.value) input.value = localStorage.getItem(STORAGE.input) || ''
  const encoded = typeof route.query.p === 'string' ? route.query.p : ''
  if (encoded) {
    try {
      steps.value = decodePipeline(encoded)
    } catch {
      addToast('error', '深链中的流水线配置无效')
    }
  }
})

watch(input, (value) => {
  if (!privacyMode.value) localStorage.setItem(STORAGE.input, value)
})

watch(privacyMode, (enabled) => {
  localStorage.setItem(STORAGE.privacy, enabled ? '1' : '0')
  if (enabled) {
    history.value = []
    localStorage.removeItem(STORAGE.history)
    localStorage.removeItem(STORAGE.input)
  }
})

function addStep() {
  steps.value.push({ id: crypto.randomUUID(), operation: 'json-format' })
}

function removeStep(index: number) {
  steps.value.splice(index, 1)
}

function moveStep(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= steps.value.length) return
  const [step] = steps.value.splice(index, 1)
  steps.value.splice(target, 0, step)
}

async function execute(recordHistory = true) {
  if (!canRun.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await runPipeline(input.value, steps.value)
    output.value = result.output
    stages.value = result.stages
    if (!privacyMode.value && recordHistory) {
      history.value = [
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          input: input.value,
          output: result.output,
          steps: steps.value.map((step) => ({ ...step })),
        },
        ...history.value,
      ].slice(0, 20)
      persistHistory()
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '流水线执行失败'
    output.value = ''
  } finally {
    busy.value = false
  }
}

function savePreset() {
  const name = presetName.value.trim()
  if (!name || !steps.value.length) return
  presets.value.unshift({
    id: crypto.randomUUID(),
    name,
    steps: steps.value.map((step) => ({ ...step })),
  })
  presetName.value = ''
  persistPresets()
  addToast('success', `预设「${name}」已保存`)
}

function applyPreset(preset: Preset) {
  steps.value = preset.steps.map((step) => ({ ...step, id: crypto.randomUUID() }))
  addToast('success', `已应用预设「${preset.name}」`)
}

function removePreset(id: string) {
  if (editingPresetId.value === id) cancelEditPreset()
  presets.value = presets.value.filter((preset) => preset.id !== id)
  persistPresets()
}

function restoreHistory(item: HistoryItem) {
  input.value = item.input
  output.value = item.output
  steps.value = item.steps.map((step) => ({ ...step, id: crypto.randomUUID() }))
  addToast('success', '已恢复本次运行')
}

function clearHistory() {
  history.value = []
  localStorage.removeItem(STORAGE.history)
}

function removeHistoryItem(id: string) {
  history.value = history.value.filter((item) => item.id !== id)
  persistHistory()
}

function beginEditPreset(preset: Preset) {
  editingPresetId.value = preset.id
  editingPresetName.value = preset.name
}

function cancelEditPreset() {
  editingPresetId.value = null
  editingPresetName.value = ''
}

function commitPresetName(preset: Preset) {
  const name = editingPresetName.value.trim()
  if (!name || name === preset.name) {
    cancelEditPreset()
    return
  }
  presets.value = presets.value.map((item) => (item.id === preset.id ? { ...item, name } : item))
  persistPresets()
  cancelEditPreset()
  addToast('success', `预设已改名为「${name}」`)
}

function onPresetNameKeydown(event: KeyboardEvent, preset: Preset) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitPresetName(preset)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditPreset()
  }
}

function buildPipelineShareUrl(stepsConfig: PipelineStep[]) {
  const url = new URL(window.location.href)
  url.searchParams.set('tool', 'pipeline')
  url.searchParams.set('p', encodePipeline(stepsConfig))
  return url.toString()
}

async function sharePreset(preset: Preset) {
  await copyToClipboard(buildPipelineShareUrl(preset.steps), () =>
    addToast('success', `预设「${preset.name}」链接已复制`),
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatHistoryTime(createdAt: number) {
  return new Date(createdAt).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function historyPreview(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 90) || '空输入'
}

function describeSteps(historySteps: PipelineStep[]) {
  return historySteps
    .map(
      (step) =>
        PIPELINE_OPERATIONS.find((operation) => operation.value === step.operation)?.label ||
        step.operation,
    )
    .join(' → ')
}

async function processBatchFiles(files: File[]) {
  if (!files.length || batchBusy.value) return
  if (!steps.value.length) {
    addToast('warning', '请先添加至少一个处理步骤')
    return
  }

  const acceptedFiles = files.slice(0, 30)
  if (files.length > 30) addToast('warning', '单次最多处理 30 个文件，已忽略其余文件')
  batchResults.value = []
  batchCompleted.value = 0
  batchTotal.value = acceptedFiles.length
  batchBusy.value = true
  try {
    for (const file of acceptedFiles) {
      try {
        const result = await runPipeline(await file.text(), steps.value)
        batchResults.value.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          output: result.output,
        })
      } catch (reason) {
        batchResults.value.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          error: reason instanceof Error ? reason.message : '处理失败',
        })
      } finally {
        batchCompleted.value += 1
      }
    }
  } finally {
    batchBusy.value = false
  }

  const successCount = successfulBatchResults.value.length
  const message = failedBatchCount.value
    ? `批量处理完成：${successCount} 个成功，${failedBatchCount.value} 个失败`
    : `${successCount} 个文件处理完成`
  addToast(failedBatchCount.value ? 'warning' : 'success', message)
}

async function runBatch(event: Event) {
  const target = event.target as HTMLInputElement
  await processBatchFiles([...(target.files || [])])
  target.value = ''
}

function openBatchPicker() {
  batchInput.value?.click()
}

function isFileDrag(event: DragEvent) {
  return [...(event.dataTransfer?.types || [])].includes('Files')
}

function onBatchDragEnter(event: DragEvent) {
  if (batchBusy.value || !isFileDrag(event)) return
  batchDragDepth += 1
  batchDragging.value = true
}

function onBatchDragOver(event: DragEvent) {
  if (batchBusy.value || !isFileDrag(event)) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onBatchDragLeave() {
  batchDragDepth = Math.max(0, batchDragDepth - 1)
  if (!batchDragDepth) batchDragging.value = false
}

async function runDroppedBatch(event: DragEvent) {
  batchDragDepth = 0
  batchDragging.value = false
  await processBatchFiles([...(event.dataTransfer?.files || [])])
}

function clearBatchResults() {
  batchResults.value = []
  batchCompleted.value = 0
  batchTotal.value = 0
}

function downloadBatch() {
  const usedNames = new Map<string, number>()
  const entries = Object.fromEntries(
    successfulBatchResults.value.map((item) => {
      const occurrence = (usedNames.get(item.name) || 0) + 1
      usedNames.set(item.name, occurrence)
      const suffix = occurrence > 1 ? `-${occurrence}` : ''
      return [`${item.name}${suffix}.out.txt`, strToU8(item.output || '')]
    }),
  )
  downloadFile('pipeline-results.zip', new Blob([zipSync(entries)], { type: 'application/zip' }))
  addToast('success', `已打包 ${successfulBatchResults.value.length} 个处理结果`)
}
</script>

<template>
  <div class="pipeline-app">
    <header class="pipeline-toolbar">
      <div class="toolbar-copy">
        <span class="eyebrow">WORKFLOW</span>
        <h2>工具流水线</h2>
        <p>上一步输出自动成为下一步输入；全部处理都在浏览器本地完成。</p>
      </div>
      <div class="toolbar-actions">
        <div class="privacy-toggle-wrap">
          <label class="privacy-toggle">
            <input v-model="privacyMode" type="checkbox" />
            <span></span>
            隐私模式
          </label>
          <button
            type="button"
            class="privacy-help"
            aria-label="隐私模式说明"
            title="开启后不会在浏览器本地保存输入和历史记录；仅在当前会话可见，重载页面后不会恢复。"
          >
            ?
            <span class="privacy-help-tip">
              开启后不会在浏览器本地保存输入和历史记录，切换后会清空当前已保存记录，重载页面后不会恢复。
            </span>
          </button>
        </div>
      </div>
    </header>

    <section class="steps-card">
      <header class="section-heading">
        <div>
          <strong>处理步骤</strong><small>{{ steps.length }} 个步骤，按顺序执行</small>
        </div>
        <button class="add-step" @click="addStep">＋ 添加步骤</button>
      </header>
      <div v-for="(step, index) in steps" :key="step.id" class="step-row">
        <span class="step-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <CustomSelect v-model="step.operation" :options="operationOptions" searchable block />
        <div class="step-actions">
          <button :disabled="index === 0" title="上移" @click="moveStep(index, -1)">↑</button>
          <button :disabled="index === steps.length - 1" title="下移" @click="moveStep(index, 1)">
            ↓
          </button>
          <button class="danger" title="删除" @click="removeStep(index)">×</button>
        </div>
      </div>
    </section>

    <section class="io-grid">
      <div class="io-card">
        <header>
          <div>
            <strong>输入</strong><small>{{ input.length.toLocaleString() }} 字符</small>
          </div>
          <button class="tertiary-button" @click="input = ''">清空</button>
        </header>
        <textarea v-model="input" placeholder="粘贴文本或 JSON…"></textarea>
      </div>
      <div class="io-card">
        <header>
          <div>
            <strong>结果</strong><small>{{ output.length.toLocaleString() }} 字符</small>
          </div>
          <CopyButton :text="output" variant="mini" :toast="addToast" />
        </header>
        <textarea :value="output" readonly placeholder="执行结果"></textarea>
      </div>
    </section>

    <div class="run-panel">
      <p v-if="error" class="pipeline-error">{{ error }}</p>
      <span v-else>顶部“实时转换”开启时会自动运行，关闭后可手动执行。</span>
      <button class="run-button" :disabled="!canRun" @click="() => execute()">
        {{ busy ? '执行中…' : '▶ 运行流水线' }}
      </button>
    </div>

    <details v-if="stages.length" class="stage-details">
      <summary>查看每一步结果</summary>
      <article v-for="(stage, index) in stages" :key="stage.step.id">
        <strong>{{ index + 1 }} · {{ stage.step.operation }}</strong>
        <pre>{{ stage.output }}</pre>
      </article>
    </details>

    <section class="pipeline-extras">
      <div class="extra-card preset-card">
        <header>
          <span>★</span>
          <div>
            <h3>预设</h3>
            <p>保存常用步骤组合</p>
          </div>
          <small v-if="presets.length" class="card-count">{{ presets.length }}</small>
        </header>
        <div class="preset-create">
          <input
            v-model="presetName"
            maxlength="40"
            aria-label="新预设名称"
            placeholder="给当前步骤命名…"
            @keydown.enter="savePreset"
          /><button :disabled="!presetName.trim() || !steps.length" @click="savePreset">
            保存
          </button>
        </div>
        <p v-if="!presets.length" class="empty-state">保存后可一键恢复整套处理步骤</p>
        <div v-for="preset in presets" :key="preset.id" class="preset-row">
          <template v-if="editingPresetId === preset.id">
            <input
              v-model="editingPresetName"
              class="preset-name-input"
              maxlength="40"
              autofocus
              aria-label="修改预设名称"
              @blur="commitPresetName(preset)"
              @keydown="onPresetNameKeydown($event, preset)"
            />
            <button
              class="icon-button confirm-action"
              title="保存名称"
              aria-label="保存预设名称"
              @mousedown.prevent
              @click="commitPresetName(preset)"
            >
              ✓
            </button>
            <button
              class="icon-button"
              title="取消改名"
              aria-label="取消修改预设名称"
              @mousedown.prevent
              @click="cancelEditPreset"
            >
              ×
            </button>
          </template>
          <template v-else>
            <button
              class="preset-apply"
              :title="`应用预设：${preset.name}`"
              @click="applyPreset(preset)"
            >
              <span>{{ preset.name }}</span>
              <small>{{ preset.steps.length }} 步</small>
            </button>
            <div class="row-actions">
              <button
                class="icon-button"
                title="重命名"
                :aria-label="`重命名预设：${preset.name}`"
                @click="beginEditPreset(preset)"
              >
                ✎
              </button>
              <button
                class="icon-button"
                title="复制分享链接"
                :aria-label="`分享预设：${preset.name}`"
                @click.stop="sharePreset(preset)"
              >
                ↗
              </button>
              <button
                class="icon-button danger-action"
                title="删除预设"
                :aria-label="`删除预设：${preset.name}`"
                @click="removePreset(preset.id)"
              >
                ×
              </button>
            </div>
          </template>
        </div>
      </div>
      <div
        class="extra-card batch-card"
        @dragenter.prevent="onBatchDragEnter"
        @dragover.prevent="onBatchDragOver"
        @dragleave.prevent="onBatchDragLeave"
        @drop.prevent="runDroppedBatch"
      >
        <header>
          <span>▦</span>
          <div>
            <h3>批量文件</h3>
            <p>选择文件，沿用当前步骤批量处理</p>
          </div>
          <small v-if="batchBusy" class="card-count">{{ batchCompleted }}/{{ batchTotal }}</small>
        </header>
        <div class="batch-intake">
          <span class="batch-file-icon">▤</span>
          <span class="batch-intake-copy">
            <strong>{{
              batchBusy ? `正在处理 ${batchCompleted} / ${batchTotal}` : '添加待处理文件'
            }}</strong>
            <small>TXT、JSON、CSV、XML、YAML · 最多 30 个</small>
          </span>
          <button
            type="button"
            class="choose-files-button"
            :disabled="batchBusy"
            @click="openBatchPicker"
          >
            {{ batchBusy ? '处理中…' : '＋ 选择文件' }}
          </button>
        </div>
        <input
          ref="batchInput"
          class="file-input"
          type="file"
          multiple
          :disabled="batchBusy"
          accept="text/*,.json,.csv,.xml,.yaml,.yml"
          @change="runBatch"
        />
        <div v-if="batchDragging" class="batch-drop-overlay" role="status">
          <span>↓</span>
          <strong>松开即可开始处理</strong>
          <small>最多接收 30 个文本文件</small>
        </div>
        <div v-if="batchBusy" class="batch-progress" aria-label="批量处理进度">
          <span
            :style="{ width: `${batchTotal ? (batchCompleted / batchTotal) * 100 : 0}%` }"
          ></span>
        </div>
        <template v-if="batchResults.length">
          <div class="batch-summary">
            <p>
              <strong>{{ successfulBatchResults.length }}</strong> 成功
              <span v-if="failedBatchCount"
                >· <strong class="failed">{{ failedBatchCount }}</strong> 失败</span
              >
            </p>
            <div class="row-actions">
              <button
                v-if="successfulBatchResults.length"
                class="download-batch"
                @click="downloadBatch"
              >
                ↓ 下载 ZIP
              </button>
              <button
                class="icon-button"
                title="清空结果"
                aria-label="清空批量处理结果"
                @click="clearBatchResults"
              >
                ×
              </button>
            </div>
          </div>
          <ul class="batch-result-list">
            <li v-for="item in batchResults" :key="item.id" :class="{ failed: item.error }">
              <span class="result-status">{{ item.error ? '!' : '✓' }}</span>
              <span class="result-file">
                <strong :title="item.name">{{ item.name }}</strong>
                <small>{{ item.error || formatFileSize(item.size) }}</small>
              </span>
            </li>
          </ul>
        </template>
      </div>
      <div v-if="!privacyMode" class="extra-card history-card">
        <header>
          <span>◷</span>
          <div>
            <h3>最近运行</h3>
            <p>恢复输入、结果与当时的处理步骤</p>
          </div>
          <button v-if="history.length" class="text-button danger-action" @click="clearHistory">
            清空记录
          </button>
        </header>
        <p v-if="!history.length" class="empty-state">手动运行一次后，记录会出现在这里</p>
        <div v-else class="history-list">
          <article v-for="item in history.slice(0, 8)" :key="item.id" class="history-row">
            <button class="history-main" @click="restoreHistory(item)">
              <span class="history-meta">
                <time
                  :datetime="new Date(item.createdAt).toISOString()"
                  :title="new Date(item.createdAt).toLocaleString()"
                >
                  {{ formatHistoryTime(item.createdAt) }}
                </time>
                <small
                  >{{ item.steps.length }} 步 · 输出
                  {{ item.output.length.toLocaleString() }} 字符</small
                >
              </span>
              <strong :title="describeSteps(item.steps)">{{ describeSteps(item.steps) }}</strong>
              <span class="history-preview">{{ historyPreview(item.input) }}</span>
            </button>
            <button
              class="icon-button danger-action history-delete"
              title="删除这条记录"
              aria-label="删除这条运行记录"
              @click="removeHistoryItem(item.id)"
            >
              ×
            </button>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pipeline-app {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: clamp(18px, 2.5vw, 32px);
  color: var(--text-body);
  background:
    radial-gradient(circle at 85% 0%, rgba(var(--accent-rgb), 0.08), transparent 32%),
    var(--bg-page);
}

.pipeline-app > * {
  box-sizing: border-box;
  width: min(1120px, 100%);
  margin-inline: auto;
}

.pipeline-toolbar {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 18px;
  padding: 8px 0 14px;
  background: color-mix(in srgb, var(--bg-page) 88%, transparent);
  backdrop-filter: blur(12px);
}

.privacy-toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
  position: relative;
}

.toolbar-copy {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.toolbar-copy h2 {
  margin: 2px 0 3px;
  color: var(--text-primary);
  font-size: clamp(22px, 2.4vw, 30px);
  line-height: 1.15;
}

.toolbar-copy p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.privacy-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.privacy-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.privacy-toggle > span {
  position: relative;
  width: 34px;
  height: 18px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-subtle);
  transition: 0.2s ease;
}

.privacy-toggle > span::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-muted);
  content: '';
  transition: 0.2s ease;
}

.privacy-toggle input:checked + span {
  border-color: var(--accent);
  background: var(--accent);
}

.privacy-toggle input:checked + span::after {
  transform: translateX(16px);
  background: white;
}

.privacy-help {
  --size: 17px;
  position: relative;
  width: var(--size);
  height: var(--size);
  border: 1px solid var(--border-light);
  border-radius: 50%;
  background: var(--bg-subtle);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.privacy-help:hover,
.privacy-help:focus-visible {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}

.privacy-help:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
  outline-offset: 2px;
}

.privacy-help-tip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(-4px);
  width: 210px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: color-mix(in srgb, #0f1324 92%, transparent);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  white-space: normal;
  z-index: 5;
  box-shadow: var(--shadow-sm);
}

.privacy-help:hover .privacy-help-tip,
.privacy-help:focus-visible .privacy-help-tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

button {
  font: inherit;
}

.secondary-button,
.tertiary-button,
.add-step,
.step-actions button,
.extra-card button {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    color 0.16s ease,
    background 0.16s ease;
}

.secondary-button {
  padding: 8px 11px;
  white-space: nowrap;
}

.secondary-button:hover,
.tertiary-button:hover,
.add-step:hover,
.step-actions button:hover:not(:disabled),
.extra-card button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-bg);
}

.steps-card,
.io-card,
.extra-card,
.stage-details {
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.steps-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 6px;
}

.section-heading > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-heading strong,
.io-card strong {
  color: var(--text-primary);
  font-size: 14px;
}

.section-heading small,
.io-card small {
  color: var(--text-muted);
  font-size: 11px;
}

.add-step {
  padding: 7px 11px;
}

.step-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-page);
}

.step-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
}

.step-row :deep(.custom-select) {
  width: 100%;
  min-width: 0;
}

.step-actions {
  display: flex;
  gap: 5px;
}

.step-actions button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
}

.step-actions button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.step-actions .danger:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg);
}

.io-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.io-card {
  display: flex;
  min-width: 0;
  min-height: 310px;
  flex-direction: column;
  padding: 16px;
}

.io-card header {
  display: flex;
  min-height: 30px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}

.io-card header > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tertiary-button {
  padding: 4px 8px;
  font-size: 11px;
}

.io-card textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 220px;
  flex: 1;
  resize: vertical;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  outline: none;
  padding: 13px 14px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 13px;
  line-height: 1.65;
  transition: border-color 0.16s ease;
}

.io-card textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.08);
}

.run-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--border-light);
  border-radius: 13px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 12px;
}

.run-button {
  min-width: 170px;
  border: 0;
  border-radius: 9px;
  padding: 10px 18px;
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  cursor: pointer;
  font-weight: 700;
}

.run-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pipeline-error,
.failed {
  color: var(--danger);
}

.stage-details {
  margin-top: 16px;
  padding: 13px 16px;
}

.stage-details summary {
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 650;
}

.stage-details article {
  margin-top: 10px;
}

.stage-details pre {
  max-height: 180px;
  overflow: auto;
  border-radius: 9px;
  padding: 10px;
  background: var(--bg-subtle);
  color: var(--text-body);
  font-size: 12px;
  white-space: pre-wrap;
}

.pipeline-extras {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
  padding-bottom: 28px;
}

.extra-card {
  min-width: 0;
  padding: 16px;
}

.history-card {
  grid-column: 1 / -1;
}

.extra-card > header {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}

.extra-card > header > span {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-bg);
  color: var(--accent);
}

.extra-card > header > div {
  min-width: 0;
  flex: 1;
}

.extra-card h3,
.extra-card p {
  margin: 0;
}

.extra-card h3 {
  color: var(--text-primary);
  font-size: 14px;
}

.extra-card header p {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
}

.card-count {
  display: inline-flex;
  min-width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 8px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.extra-card input:not([type='file']) {
  box-sizing: border-box;
  min-width: 0;
  flex: 1;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  outline: none;
  padding: 8px 9px;
  background: var(--bg-input);
  color: var(--text-primary);
}

.extra-card input:not([type='file']):focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.08);
}

.preset-create {
  display: flex;
  gap: 7px;
  margin-bottom: 10px;
}

.preset-create button,
.download-batch,
.extra-card > header > button {
  padding: 7px 9px;
}

.extra-card button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.empty-state {
  display: grid;
  min-height: 64px;
  place-items: center;
  border: 1px dashed var(--border-light);
  border-radius: 10px;
  padding: 12px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.preset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  margin-top: 7px;
}

.preset-row:has(.preset-name-input) {
  grid-template-columns: minmax(0, 1fr) 32px 32px;
}

.preset-apply {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  overflow: hidden;
  text-align: left;
}

.preset-apply > span {
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-apply > small {
  flex: none;
  color: var(--text-muted);
  font-size: 10px;
}

.row-actions {
  display: flex;
  gap: 5px;
}

.extra-card .icon-button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  padding: 0;
}

.extra-card .danger-action:hover:not(:disabled) {
  border-color: var(--danger);
  background: var(--danger-bg);
  color: var(--danger);
}

.extra-card .confirm-action,
.extra-card .confirm-action:hover:not(:disabled) {
  border-color: var(--success);
  background: var(--success-bg);
  color: var(--success);
}

.batch-card {
  position: relative;
}

.batch-intake {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-page);
}

.batch-file-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 17px;
  font-weight: 800;
}

.batch-intake-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.batch-intake-copy strong {
  color: var(--text-primary);
  font-size: 13px;
}

.batch-intake-copy small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extra-card .choose-files-button {
  border-color: var(--accent);
  padding: 8px 11px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.extra-card .choose-files-button:hover:not(:disabled) {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
  color: var(--accent-contrast);
}

.file-input {
  display: none;
}

.batch-drop-overlay {
  position: absolute;
  inset: 8px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  border: 2px dashed var(--accent);
  border-radius: 13px;
  background: color-mix(in srgb, var(--bg-card) 90%, var(--accent-bg));
  color: var(--text-secondary);
  pointer-events: none;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(8px);
}

.batch-drop-overlay > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 3px;
  border-radius: 11px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 20px;
  font-weight: 800;
}

.batch-drop-overlay strong {
  color: var(--text-primary);
  font-size: 14px;
}

.batch-drop-overlay small {
  color: var(--text-muted);
  font-size: 11px;
}

.batch-progress {
  height: 3px;
  overflow: hidden;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--bg-subtle);
}

.batch-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--gradient-primary);
  transition: width 0.2s ease;
}

.batch-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
}

.batch-summary p {
  color: var(--text-secondary);
  font-size: 12px;
}

.batch-summary p > strong:first-child {
  color: var(--success);
}

.download-batch {
  color: var(--accent);
}

.batch-result-list {
  display: flex;
  max-height: 220px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.batch-result-list li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border-radius: 9px;
  padding: 7px 9px;
  background: var(--success-bg);
  color: var(--success);
}

.batch-result-list li.failed {
  background: var(--danger-bg);
}

.result-status {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-card);
  font-size: 11px;
  font-weight: 800;
}

.result-file {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.result-file strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-file small {
  overflow: hidden;
  color: currentColor;
  font-size: 10px;
  opacity: 0.82;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extra-card .text-button {
  border: 0;
  padding: 5px 7px;
  background: transparent;
  font-size: 11px;
}

.history-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.history-row {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 4px;
  align-items: start;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  background: var(--bg-page);
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.history-row:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border-light));
  background: var(--accent-bg);
}

.extra-card .history-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  border: 0;
  padding: 10px 8px 10px 11px;
  background: transparent;
  text-align: left;
}

.extra-card .history-main:hover {
  background: transparent;
}

.history-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-meta time {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.history-meta small {
  color: var(--text-muted);
  font-size: 10px;
}

.history-main > strong,
.history-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-main > strong {
  color: var(--text-primary);
  font-size: 12px;
}

.history-preview {
  color: var(--text-secondary);
  font-size: 11px;
}

.history-delete {
  margin: 6px 5px 0 0;
}

@media (max-width: 900px) {
  .history-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .pipeline-app {
    padding: 14px 12px 24px;
  }

  .pipeline-toolbar {
    position: static;
    align-items: stretch;
    flex-direction: column;
    padding-top: 2px;
  }

  .toolbar-actions {
    justify-content: space-between;
  }

  .steps-card {
    padding: 12px;
  }

  .section-heading {
    align-items: flex-start;
  }

  .step-row {
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
  }

  .step-index {
    width: 28px;
    height: 28px;
  }

  .step-actions {
    grid-column: 2;
    justify-content: flex-end;
  }

  .io-grid,
  .pipeline-extras {
    grid-template-columns: 1fr;
  }

  .io-card {
    min-height: 250px;
    padding: 13px;
  }

  .io-card textarea {
    min-height: 185px;
  }

  .run-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .run-button {
    width: 100%;
  }

  .history-card {
    grid-column: auto;
  }
}

@media (max-width: 420px) {
  .toolbar-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .privacy-toggle,
  .secondary-button {
    justify-content: center;
  }

  .section-heading {
    flex-direction: column;
  }

  .add-step {
    width: 100%;
  }

  .batch-intake {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .choose-files-button {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>
