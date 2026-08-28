<script setup lang="ts">
import { ref } from 'vue'
import { debounce, downloadFile } from '@/utils/common'
import { autoType } from '@/utils/devtoolbox'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'FormDataTool' })

type Dir = 'form2json' | 'json2form'
const dir = ref<Dir>('form2json')
const autoInfer = ref(false)
const input = ref('')
const output = ref('')
const error = ref('')
const detectedKind = ref<'urlencoded' | 'multipart' | ''>('')

const { addToast } = useToast()

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function parseMultipart(text: string): { name: string; filename?: string; content: string }[] {
  let boundary = ''
  const bm = text.match(/boundary=([^\s;"]+)/)
  if (bm) boundary = bm[1].replace(/^"+|"+$/g, '')
  else {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().startsWith('--'))
    if (firstLine) boundary = firstLine.trim().slice(2).replace(/--$/, '')
  }
  if (!boundary) throw new Error('未找到 multipart/form-data 的 boundary')
  const delim = '--' + boundary
  const segments = text.split(delim)
  const parts: { name: string; filename?: string; content: string }[] = []
  for (const segRaw of segments) {
    const seg = segRaw.replace(/--\s*$/, '')
    const trimmed = seg.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
    if (!trimmed) continue
    const sepIdx = trimmed.search(/\r?\n\r?\n/)
    if (sepIdx < 0) continue
    const headerBlock = trimmed.slice(0, sepIdx)
    const content = trimmed
      .slice(sepIdx)
      .replace(/^\r?\n\r?\n/, '')
      .replace(/\r?\n$/, '')
    const nameM = headerBlock.match(/name="([^"]*)"/)
    const fileM = headerBlock.match(/filename="([^"]*)"/)
    const part: { name: string; filename?: string; content: string } = {
      name: nameM ? nameM[1] : '(unknown)',
      content,
    }
    if (fileM) part.filename = fileM[1]
    parts.push(part)
  }
  return parts
}

function formToObject(text: string): Record<string, unknown> {
  const pairs: [string, string][] = []
  const tokens = text
    .split(/[&\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const tok of tokens) {
    const eq = tok.indexOf('=')
    if (eq < 0) {
      pairs.push([safeDecode(tok), ''])
      continue
    }
    const k = safeDecode(tok.slice(0, eq))
    const v = safeDecode(tok.slice(eq + 1))
    pairs.push([k, v])
  }
  const map = new Map<string, string[]>()
  for (const [k, v] of pairs) {
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(v)
  }
  const result: Record<string, unknown> = {}
  for (const [k, vals] of map.entries()) {
    const applied = autoInfer.value ? vals.map((x) => autoType(x)) : vals
    result[k] = applied.length === 1 ? applied[0] : applied
  }
  return result
}

function valueToQueryString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function looksLikeMultipart(text: string): boolean {
  return /boundary=/i.test(text) || /^\s*--[^\r\n]+/.test(text)
}

const run = debounce(() => {
  error.value = ''
  detectedKind.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    if (dir.value === 'form2json') {
      if (looksLikeMultipart(input.value)) {
        detectedKind.value = 'multipart'
        const parts = parseMultipart(input.value)
        output.value = JSON.stringify(parts, null, 2)
      } else {
        detectedKind.value = 'urlencoded'
        const obj = formToObject(input.value)
        output.value = JSON.stringify(obj, null, 2)
      }
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
    addToast('error', msg)
  }
}, 150)

useRealtime(run, { watch: [input, dir, autoInfer] })

function download() {
  if (!output.value) return
  const ext = dir.value === 'json2form' ? 'txt' : 'json'
  const mime = dir.value === 'json2form' ? 'text/plain' : 'application/json'
  downloadFile(`result.${ext}`, output.value, mime)
  addToast('success', `已下载 result.${ext}`)
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
  <div class="form-data-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'form2json' }" @click="dir = 'form2json'">
          表单 → JSON
        </button>
        <button :class="{ active: dir === 'json2form' }" @click="dir = 'json2form'">
          JSON → urlencoded
        </button>
      </div>
      <label v-if="dir === 'form2json' && detectedKind !== 'multipart'" class="check">
        <input type="checkbox" v-model="autoInfer" />
        <span>值类型推断</span>
      </label>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn" :disabled="!output" @click="download">⬇ 下载</button>
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <p v-if="dir === 'form2json' && detectedKind" class="hint kind">
      已识别为：{{
        detectedKind === 'multipart' ? 'multipart/form-data（按字段拆分）' : 'x-www-form-urlencoded'
      }}
    </p>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'form2json' ? '表单原文' : 'JSON' }}</span>
          <span class="hint">输入即转换（Ctrl/Cmd+S 亦触发）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="input"
            :language="dir === 'form2json' ? 'plaintext' : 'json'"
            :placeholder="
              dir === 'form2json' ? '粘贴 a=1&b=2，或 multipart/form-data 原始文本' : '粘贴 JSON…'
            "
            @save="onEditorSave"
          />
        </div>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">JSON（只读）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="output"
            :language="dir === 'form2json' ? 'json' : 'plaintext'"
            readonly
            placeholder="结果将显示在此"
          />
        </div>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.form-data-app {
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
.kind {
  margin: -0.4rem 0 0;
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
