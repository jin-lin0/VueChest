<script setup lang="ts">
import { ref } from 'vue'
import { debounce, downloadFile, autoType } from '@/utils'
import { Toast, CopyButton } from '@/components'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'QueryJsonTool' })

type Dir = 'query2json' | 'json2query'
const dir = ref<Dir>('query2json')
const autoInfer = ref(false)
const input = ref('')
const output = ref('')
const error = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function queryToObject(qs: string): Record<string, unknown> {
  const clean = qs.trim().replace(/^\?/, '')
  const sp = new URLSearchParams(clean)
  const map = new Map<string, string[]>()
  sp.forEach((value, key) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(value)
  })
  const result: Record<string, unknown> = {}
  for (const [key, values] of map.entries()) {
    const applied = autoInfer.value ? values.map((v) => autoType(v)) : values
    result[key] = applied.length === 1 ? applied[0] : applied
  }
  return result
}

function valueToQueryString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const run = debounce(() => {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    if (dir.value === 'query2json') {
      const obj = queryToObject(input.value)
      output.value = JSON.stringify(obj, null, 2)
    } else {
      const parsed = JSON.parse(input.value)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('请输入一个 JSON 对象（键值对）')
      }
      const parts: string[] = []
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(valueToQueryString(item))}`)
          }
        } else {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(valueToQueryString(value))}`)
        }
      }
      output.value = parts.join('&')
    }
  } catch (e) {
    output.value = ''
    const msg = '转换失败：' + (e instanceof Error ? e.message : String(e))
    error.value = msg
    showToast('error', msg)
  }
}, 150)

useRealtime(run, { watch: [input, dir, autoInfer] })

function download() {
  if (!output.value) return
  const ext = dir.value === 'query2json' ? 'json' : 'txt'
  const mime = dir.value === 'query2json' ? 'application/json' : 'text/plain'
  downloadFile(`result.${ext}`, output.value, mime)
  showToast('success', `已下载 result.${ext}`)
}
function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
function onEditorSave() {
  run()
}
</script>

<template>
  <div class="query-json-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'query2json' }" @click="dir = 'query2json'">
          查询串 → JSON
        </button>
        <button :class="{ active: dir === 'json2query' }" @click="dir = 'json2query'">
          JSON → 查询串
        </button>
      </div>
      <label v-if="dir === 'query2json'" class="check">
        <input type="checkbox" v-model="autoInfer" />
        <span>值类型推断（数字/布尔→真类型）</span>
      </label>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="showToast" />
        <button class="btn" :disabled="!output" @click="download">⬇ 下载</button>
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'query2json' ? 'URL 查询串' : 'JSON' }}</span>
          <span class="hint">输入即转换（Ctrl/Cmd+S 亦触发）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="input"
            :language="dir === 'query2json' ? 'plaintext' : 'json'"
            :placeholder="dir === 'query2json' ? '粘贴 a=1&b=hello' : '粘贴 JSON…'"
            @save="onEditorSave"
          />
        </div>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ dir === 'query2json' ? 'JSON' : '查询串' }}（只读）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="output"
            :language="dir === 'query2json' ? 'json' : 'plaintext'"
            readonly
            placeholder="结果将显示在此"
          />
        </div>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.query-json-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  color: var(--text-body);
  gap: 1rem;
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 0.7rem;
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
.btn.primary {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mini {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.inp,
.plain,
textarea {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.inp:focus,
.plain:focus,
textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.err {
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
}
.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.v {
  font-size: 0.88rem;
  color: var(--text-body);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.seg button {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: none;
  padding: 0.5rem 1.1rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: var(--transition-fast);
}
.seg button.active {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  font-weight: 600;
}
.tb-group {
  display: flex;
  gap: 0.4rem;
}
.tb-group.push-right {
  margin-left: auto;
}
.btn.ghost {
  background: transparent;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
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
  min-height: 0;
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
}
.card-head .card-title {
  margin-bottom: 0;
}
.editor-wrap {
  flex: 1;
  min-height: 260px;
}

@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
