<script setup lang="ts">
import { ref } from 'vue'
import { copyToClipboard, debounce, downloadFile } from '@/utils'
import { Toast } from '@/components'
import { parse as parseIni, stringify as stringifyIni } from 'ini'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'IniTool' })

type Dir = 'ini2json' | 'json2ini'
const dir = ref<Dir>('ini2json')
const input = ref('')
const output = ref('')
const error = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const run = debounce(() => {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    if (dir.value === 'ini2json') {
      const obj = parseIni(input.value)
      output.value = JSON.stringify(obj, null, 2)
    } else {
      const obj = JSON.parse(input.value)
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('JSON→INI 需要输入一个 JSON 对象（键值对）')
      }
      output.value = stringifyIni(obj)
    }
  } catch (e) {
    output.value = ''
    const msg = '转换失败：' + (e instanceof Error ? e.message : String(e))
    error.value = msg
    showToast('error', msg)
  }
}, 150)

useRealtime(run, { watch: [input, dir] })

async function copy() {
  if (!output.value) return
  await copyToClipboard(output.value)
  showToast('success', '已复制结果')
}
function download() {
  if (!output.value) return
  const ext = dir.value === 'ini2json' ? 'json' : 'ini'
  const mime = dir.value === 'ini2json' ? 'application/json' : 'text/plain'
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
  <div class="ini-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'ini2json' }" @click="dir = 'ini2json'">
          INI → JSON
        </button>
        <button :class="{ active: dir === 'json2ini' }" @click="dir = 'json2ini'">
          JSON → INI
        </button>
      </div>
      <div class="tb-group push-right">
        <button class="btn" :disabled="!output" @click="copy">📋 复制</button>
        <button class="btn" :disabled="!output" @click="download">⬇ 下载</button>
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'ini2json' ? 'INI / .properties' : 'JSON' }}</span>
          <span class="hint">输入即转换（Ctrl/Cmd+S 亦触发）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="input"
            :language="dir === 'ini2json' ? 'plaintext' : 'json'"
            :placeholder="dir === 'ini2json' ? '粘贴 INI…\n[sec]\nkey=val' : '粘贴 JSON…'"
            @save="onEditorSave"
          />
        </div>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ dir === 'ini2json' ? 'JSON' : 'INI' }}（只读）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="output"
            :language="dir === 'ini2json' ? 'json' : 'plaintext'"
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
.ini-app {
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
