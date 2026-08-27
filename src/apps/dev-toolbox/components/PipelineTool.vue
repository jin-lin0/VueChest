<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { strToU8, zipSync } from 'fflate'
import { CopyButton, CustomSelect, type SelectOption } from '@/components'
import { copyToClipboard, debounce, downloadFile } from '@/utils'
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

const STORAGE = {
  presets: 'dev-toolbox:pipeline:presets',
  history: 'dev-toolbox:pipeline:history',
  input: 'dev-toolbox:pipeline:input',
  privacy: 'dev-toolbox:pipeline:privacy',
}

const route = useRoute()
const router = useRouter()
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
const batchResults = ref<Array<{ name: string; output?: string; error?: string }>>([])

const operationOptions: SelectOption[] = PIPELINE_OPERATIONS.map((item) => ({ ...item }))
const canRun = computed(() => Boolean(input.value && steps.value.length && !busy.value))
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
}

function applyPreset(preset: Preset) {
  steps.value = preset.steps.map((step) => ({ ...step, id: crypto.randomUUID() }))
}

function removePreset(id: string) {
  presets.value = presets.value.filter((preset) => preset.id !== id)
  persistPresets()
}

function restoreHistory(item: HistoryItem) {
  input.value = item.input
  output.value = item.output
  steps.value = item.steps.map((step) => ({ ...step, id: crypto.randomUUID() }))
}

function clearHistory() {
  history.value = []
  localStorage.removeItem(STORAGE.history)
}

async function sharePipeline() {
  const p = encodePipeline(steps.value)
  await router.replace({ query: { ...route.query, tool: 'pipeline', p } })
  copyToClipboard(window.location.href, () => addToast('success', '流水线链接已复制'))
}

async function runBatch(event: Event) {
  const files = [...((event.target as HTMLInputElement).files || [])]
  batchResults.value = []
  for (const file of files.slice(0, 30)) {
    try {
      const result = await runPipeline(await file.text(), steps.value)
      batchResults.value.push({ name: file.name, output: result.output })
    } catch (reason) {
      batchResults.value.push({
        name: file.name,
        error: reason instanceof Error ? reason.message : '处理失败',
      })
    }
  }
  ;(event.target as HTMLInputElement).value = ''
}

function downloadBatch() {
  const entries = Object.fromEntries(
    batchResults.value
      .filter((item) => item.output !== undefined)
      .map((item) => [`${item.name}.out.txt`, strToU8(item.output || '')]),
  )
  downloadFile('pipeline-results.zip', new Blob([zipSync(entries)], { type: 'application/zip' }))
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
        <label class="privacy-toggle">
          <input v-model="privacyMode" type="checkbox" />
          <span></span>
          隐私模式
        </label>
        <button class="secondary-button" @click="sharePipeline">🔗 复制深链</button>
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
      <div class="extra-card">
        <header>
          <span>★</span>
          <div>
            <h3>预设</h3>
            <p>保存常用步骤组合</p>
          </div>
        </header>
        <div class="preset-create">
          <input v-model="presetName" placeholder="预设名称" @keydown.enter="savePreset" /><button
            @click="savePreset"
          >
            保存
          </button>
        </div>
        <div v-for="preset in presets" :key="preset.id" class="compact-row">
          <button @click="applyPreset(preset)">{{ preset.name }}</button
          ><button @click="removePreset(preset.id)">×</button>
        </div>
      </div>
      <div class="extra-card">
        <header>
          <span>▦</span>
          <div>
            <h3>批量文件</h3>
            <p>最多处理 30 个文本文件</p>
          </div>
        </header>
        <label class="file-picker">
          选择文件
          <input
            type="file"
            multiple
            accept="text/*,.json,.csv,.xml,.yaml,.yml"
            @change="runBatch"
          />
        </label>
        <button
          v-if="batchResults.some((item) => item.output !== undefined)"
          class="download-batch"
          @click="downloadBatch"
        >
          下载 ZIP
        </button>
        <p v-for="item in batchResults" :key="item.name" :class="{ failed: item.error }">
          {{ item.name }} · {{ item.error || '完成' }}
        </p>
      </div>
      <div v-if="!privacyMode" class="extra-card">
        <header>
          <span>◷</span>
          <div>
            <h3>最近运行</h3>
            <p>仅保存手动执行记录</p>
          </div>
          <button v-if="history.length" @click="clearHistory">清空</button>
        </header>
        <button
          v-for="item in history.slice(0, 8)"
          :key="item.id"
          class="history-row"
          @click="restoreHistory(item)"
        >
          {{ new Date(item.createdAt).toLocaleString() }} · {{ item.steps.length }} 步
        </button>
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

button,
.file-picker {
  font: inherit;
}

.secondary-button,
.tertiary-button,
.add-step,
.step-actions button,
.extra-card button,
.file-picker {
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
.extra-card button:hover,
.file-picker:hover {
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
  padding-bottom: 28px;
}

.extra-card {
  min-width: 0;
  padding: 16px;
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

.preset-create,
.compact-row {
  display: flex;
  gap: 7px;
  margin-bottom: 7px;
}

.preset-create button,
.compact-row button,
.download-batch,
.extra-card > header > button {
  padding: 7px 9px;
}

.compact-row button:first-child {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-picker {
  display: inline-flex;
  padding: 8px 11px;
}

.file-picker input {
  display: none;
}

.download-batch {
  margin-left: 7px;
}

.extra-card > p {
  margin-top: 7px;
  color: var(--text-secondary);
  font-size: 12px;
}

.history-row {
  display: block;
  width: 100%;
  margin-bottom: 6px;
  padding: 8px 9px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .pipeline-extras {
    grid-template-columns: 1fr 1fr;
  }

  .extra-card:last-child {
    grid-column: 1 / -1;
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

  .extra-card:last-child {
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
}
</style>
