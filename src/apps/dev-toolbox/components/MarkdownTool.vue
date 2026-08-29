<script setup lang="ts">
import { ref } from 'vue'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'
import { renderMarkdown } from '@/lib/markdown'
import TurndownService from 'turndown'
import CodeEditor from './CodeEditor.vue'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'MarkdownTool' })

type Dir = 'md2html' | 'html2md'
const dir = ref<Dir>('md2html')
const input = ref('')
const output = ref('')
const error = ref('')

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

const { addToast } = useToast()

const run = debounce(() => {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    return
  }
  try {
    if (dir.value === 'md2html') {
      // 走统一渲染管线（已含 DOMPurify 消毒），避免直接 marked.parse 绕过消毒
      output.value = renderMarkdown(input.value)
    } else {
      output.value = turndown.turndown(input.value)
    }
  } catch (e) {
    output.value = ''
    const msg = '转换失败：' + (e instanceof Error ? e.message : String(e))
    error.value = msg
    addToast('error', msg)
  }
}, 150)

useRealtime(run, { watch: [input, dir] })

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="md-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'md2html' }" @click="dir = 'md2html'">MD → HTML</button>
        <button :class="{ active: dir === 'html2md' }" @click="dir = 'html2md'">HTML → MD</button>
      </div>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="addToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'md2html' ? 'Markdown' : 'HTML' }}</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="input"
            language="plaintext"
            :placeholder="dir === 'md2html' ? '粘贴 Markdown…' : '粘贴 HTML…'"
          />
        </div>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ dir === 'md2html' ? 'HTML' : 'Markdown' }}（只读）</span>
        </div>
        <div class="editor-wrap">
          <CodeEditor v-model="output" language="plaintext" readonly placeholder="结果将显示在此" />
        </div>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.md-app {
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
  font-size: var(--font-size-title);
  margin-bottom: 0.7rem;
}
.btn {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-body);
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
  font-size: var(--font-size-small);
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
  font-size: var(--font-size-body);
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
  font-size: var(--font-size-control);
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-control);
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.k {
  color: var(--text-muted);
  font-size: var(--font-size-control);
}
.v {
  font-size: var(--font-size-body);
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
  font-size: var(--font-size-body);
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
