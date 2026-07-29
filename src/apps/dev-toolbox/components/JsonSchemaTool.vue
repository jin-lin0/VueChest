<script setup lang="ts">
import { ref } from 'vue'
import { debounce } from '@/utils'
import { Toast, CopyButton } from '@/components'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

defineOptions({ name: 'JsonSchemaTool' })

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const schemaInput = ref(
  `{
  "type": "object",
  "properties": {
    "a": { "type": "number" }
  },
  "required": ["a"]
}`,
)
const dataInput = ref('{\n  "a": "x"\n}')
const valid = ref<boolean | null>(null)
const errorMsg = ref('')
const errorsText = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function formatAjvError(e: {
  instancePath: string
  schemaPath: string
  keyword: string
  params: Record<string, unknown>
  message?: string
}): string {
  const path = e.instancePath || '(root)'
  return `• ${path} ${e.message ?? ''} [keyword: ${e.keyword}]`
}

const run = debounce(() => {
  errorMsg.value = ''
  errorsText.value = ''
  valid.value = null

  let schema: unknown
  let data: unknown

  try {
    schema = JSON.parse(schemaInput.value)
  } catch (err) {
    errorMsg.value = 'Schema 不是合法 JSON：' + (err as Error).message
    showToast('error', 'Schema 解析失败')
    return
  }
  try {
    data = JSON.parse(dataInput.value)
  } catch (err) {
    errorMsg.value = 'Data 不是合法 JSON：' + (err as Error).message
    showToast('error', 'Data 解析失败')
    return
  }

  let validate: ReturnType<typeof ajv.compile>
  try {
    validate = ajv.compile(schema as object)
  } catch (err) {
    errorMsg.value = 'Schema 编译失败：' + (err as Error).message
    showToast('error', 'Schema 编译失败')
    return
  }

  const ok = validate(data)
  valid.value = ok
  if (!ok) {
    const errs = validate.errors ?? []
    errorsText.value = errs.map(formatAjvError).join('\n')
  } else {
    showToast('success', '校验通过 ✓')
  }
}, 220)

useRealtime(run, { watch: [schemaInput, dataInput], immediate: true })

function loadExampleFail() {
  schemaInput.value = `{
  "type": "object",
  "properties": { "a": { "type": "number" } },
  "required": ["a"]
}`
  dataInput.value = `{\n  "a": "x"\n}`
  run()
}
function loadExampleOk() {
  schemaInput.value = `{
  "type": "object",
  "properties": { "a": { "type": "number" } },
  "required": ["a"]
}`
  dataInput.value = `{\n  "a": 1\n}`
  run()
}
function clearAll() {
  schemaInput.value = ''
  dataInput.value = ''
  valid.value = null
  errorMsg.value = ''
  errorsText.value = ''
}
</script>

<template>
  <div class="json-schema-app">
    <header class="head">
      <h1>JSON Schema 校验</h1>
      <p class="sub">基于 Ajv + ajv-formats 校验 JSON 数据（strict 关闭，支持 allErrors）。</p>
    </header>

    <div class="toolbar">
      <div class="tb-group">
        <button class="btn" @click="loadExampleFail">示例(失败)</button>
        <button class="btn" @click="loadExampleOk">示例(通过)</button>
      </div>
      <div class="tb-group push-right">
        <CopyButton
          :text="valid === null ? '' : valid ? '校验通过 ✓' : '校验失败：\n' + errorsText"
          variant="btn"
          success-text="已复制校验结果"
          :toast="showToast"
        />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head"><span class="card-title">JSON Schema</span></div>
        <CodeEditor v-model="schemaInput" language="json" placeholder="在此粘贴 JSON Schema…" />
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">待校验 JSON</span></div>
        <CodeEditor v-model="dataInput" language="json" placeholder="在此粘贴待校验的 JSON 数据…" />
      </section>
    </div>

    <section class="result" :class="{ ok: valid === true, bad: valid === false }">
      <div class="card-head">
        <span class="card-title">校验结果</span>
        <span v-if="valid === true" class="badge ok">通过 ✓</span>
        <span v-else-if="valid === false" class="badge bad">失败 ✗</span>
        <span v-else class="badge">待输入</span>
      </div>
      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
      <pre v-else-if="valid === false" class="errors">{{ errorsText }}</pre>
      <p v-else-if="valid === true" class="ok-text">数据符合 Schema 定义。</p>
      <p v-else class="muted">输入 Schema 与数据后将自动校验。</p>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.json-schema-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1; /* 关键：填充内容区，勿用 height:100% */
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  color: var(--text-body);
  gap: 1rem;
}
.head h1 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}
.sub {
  margin: 0.3rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: center;
}
.btn {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  transition: var(--transition-fast);
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.tb-group {
  display: flex;
  gap: 0.4rem;
}
.tb-group.push-right {
  margin-left: auto;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
  min-height: 260px;
}
.card-head {
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.95rem;
}
.result {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
}
.result.ok {
  border-color: #16a34a;
}
.result.bad {
  border-color: #dc2626;
}
.badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--bg-subtle);
  color: var(--text-muted);
}
.badge.ok {
  background: rgba(22, 163, 74, 0.15);
  color: #16a34a;
}
.badge.bad {
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
}
.err {
  margin: 0.4rem 0 0;
  color: var(--danger, #ef4444);
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.errors {
  margin: 0.4rem 0 0;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
  line-height: 1.6;
  color: #dc2626;
  white-space: pre-wrap;
  word-break: break-word;
}
.ok-text {
  margin: 0.4rem 0 0;
  color: #16a34a;
  font-size: 0.85rem;
}
.muted {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}
@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
