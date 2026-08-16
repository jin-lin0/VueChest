<script setup lang="ts">
import { ref } from 'vue'
import { debounce } from '@/utils'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'JsonTool' })

type Mode = 'pretty' | 'minify' | 'escape'
const mode = ref<Mode>('pretty')
const input = ref('')
const output = ref('')
const error = ref('')

const { addToast } = useToast()

const run = debounce(() => {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    if (mode.value === 'escape') {
      // 转义为 JS 字符串字面量：对原始文本做 JSON 字面量化（转义引号与换行）
      output.value = JSON.stringify(input.value)
      return
    }
    const parsed = JSON.parse(input.value)
    if (mode.value === 'pretty') {
      output.value = JSON.stringify(parsed, null, 2)
    } else {
      output.value = JSON.stringify(parsed)
    }
  } catch (e) {
    output.value = ''
    const msg = '非法 JSON：' + (e instanceof Error ? e.message : String(e))
    error.value = msg
    addToast('error', msg)
  }
}, 150)

useRealtime(run, { watch: [input, mode] })

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
function onEditorSave() {
  // Ctrl/Cmd+S：美观化（切换到 pretty 并立即格式化）
  mode.value = 'pretty'
  run()
}
</script>

<template>
  <div class="json-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: mode === 'pretty' }" @click="mode = 'pretty'">格式化</button>
        <button :class="{ active: mode === 'minify' }" @click="mode = 'minify'">压缩</button>
        <button :class="{ active: mode === 'escape' }" @click="mode = 'escape'">转义</button>
      </div>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">输入</span>
          <span class="hint">输入即处理（Ctrl/Cmd+S 格式化）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="input"
            language="json"
            placeholder="粘贴 JSON 文本…"
            @save="onEditorSave"
          />
        </div>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">结果（只读）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="output"
            language="javascript"
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
.json-app {
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
