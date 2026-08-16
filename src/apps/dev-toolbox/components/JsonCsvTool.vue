<script setup lang="ts">
import { ref } from 'vue'
import { debounce, downloadFile } from '@/utils'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'JsonCsvTool' })

type Dir = 'toCsv' | 'toJson'
const dir = ref<Dir>('toCsv')
const input = ref('')
const output = ref('')
const error = ref('')
const forceText = ref(false)

const { addToast } = useToast()

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

function autoType(s: string): unknown {
  const t = s.trim()
  if (t === '') return ''
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    // 带前导零的数字字符串（如邮编 007、工号 01.50）保留原样，避免静默数据丢失
    if (/^-?0\d/.test(t)) return s
    return Number(t)
  }
  return s
}

function jsonToCsv(text: string): string {
  const data = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error('JSON 顶层必须是对象数组')
  if (data.length === 0) return ''
  const headers: string[] = []
  for (const row of data) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k)
    }
  }
  if (headers.length === 0) throw new Error('对象中未找到可展开的字段')
  const lines: string[] = [headers.map(csvEscape).join(',')]
  for (const row of data) {
    const vals = headers.map((h) => {
      const v = row && typeof row === 'object' ? (row as Record<string, unknown>)[h] : undefined
      if (v === null || v === undefined) return csvEscape('')
      if (typeof v === 'object') return csvEscape(JSON.stringify(v))
      return csvEscape(String(v))
    })
    lines.push(vals.join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    } else {
      if (c === '"') {
        inQuotes = true
        i++
        continue
      }
      if (c === ',') {
        row.push(field)
        field = ''
        i++
        continue
      }
      if (c === '\r') {
        i++
        continue
      }
      if (c === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
        i++
        continue
      }
      field += c
      i++
    }
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

function csvToJson(text: string): string {
  const rows = parseCsv(text)
  if (rows.length === 0) return '[]'
  const headers = rows[0]
  const out: Record<string, unknown>[] = []
  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, idx) => {
      obj[h] = forceText.value ? (rows[i][idx] ?? '') : autoType(rows[i][idx] ?? '')
    })
    out.push(obj)
  }
  return JSON.stringify(out, null, 2)
}

const run = debounce(() => {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    output.value = dir.value === 'toCsv' ? jsonToCsv(input.value) : csvToJson(input.value)
  } catch (e) {
    output.value = ''
    const msg = '转换失败：' + (e instanceof Error ? e.message : String(e))
    error.value = msg
    addToast('error', msg)
  }
}, 150)

useRealtime(run, { watch: [input, dir, forceText] })

function switchDir(d: Dir) {
  // 切换方向时把当前结果作为新方向的输入，方便来回编辑
  if (output.value) input.value = output.value
  dir.value = d
  run()
}

function download() {
  if (!output.value) return
  const name = dir.value === 'toCsv' ? 'data.csv' : 'data.json'
  const mime = dir.value === 'toCsv' ? 'text/csv' : 'application/json'
  downloadFile(name, output.value, mime)
  addToast('success', '已下载 ' + name)
}
function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="csv-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'toCsv' }" @click="switchDir('toCsv')">JSON → CSV</button>
        <button :class="{ active: dir === 'toJson' }" @click="switchDir('toJson')">
          CSV → JSON
        </button>
      </div>
      <label
        v-if="dir === 'toJson'"
        class="chk"
        title="开启后所有单元格按原样作为字符串，不做数字/布尔推断"
      >
        <input type="checkbox" v-model="forceText" @change="run" />
        <span>强制文本</span>
      </label>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn" :disabled="!output" @click="download">⬇ 下载</button>
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'toCsv' ? 'JSON 数组' : 'CSV 文本' }}</span>
          <span class="hint">{{ dir === 'toCsv' ? '顶层为对象数组' : '首行为表头' }}</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="input"
            :language="dir === 'toCsv' ? 'json' : 'plaintext'"
            :placeholder="dir === 'toCsv' ? '粘贴 JSON 数组…' : '粘贴 CSV 文本…'"
          />
        </div>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ dir === 'toCsv' ? 'CSV 文本' : 'JSON 数组' }}（只读）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="output"
            :language="dir === 'toCsv' ? 'plaintext' : 'json'"
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
.csv-app {
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
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.chk input {
  accent-color: var(--accent);
}
.btn.ghost {
  background: transparent;
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
