<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
// 仅引入核心 + 按需语言，避免全量 highlight.js 打包
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('json', json)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('plaintext', plaintext)

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: 'json' | 'javascript' | 'plaintext'
    readonly?: boolean
    placeholder?: string
  }>(),
  { language: 'json', readonly: false, placeholder: '' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'save'): void
}>()

const taRef = ref<HTMLTextAreaElement | null>(null)
const preRef = ref<HTMLPreElement | null>(null)

const highlighted = computed(() => {
  const src = props.modelValue
  if (!src) return ''
  const lang =
    props.language === 'javascript'
      ? 'javascript'
      : props.language === 'plaintext'
        ? 'plaintext'
        : 'json'
  try {
    return hljs.highlight(src, { language: lang }).value + (src.endsWith('\n') ? '\n' : '')
  } catch {
    return escapeHtml(src)
  }
})

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}

function syncScroll() {
  const ta = taRef.value
  const pre = preRef.value
  if (!ta || !pre) return
  const code = pre.querySelector('code')
  if (code) {
    code.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`
  }
}

watch(
  () => props.modelValue,
  () => nextTick(syncScroll),
)

function onKeydown(e: KeyboardEvent) {
  if (props.readonly) return
  // Cmd/Ctrl + S：触发格式化（由父组件决定提示与否），拦截浏览器保存
  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    emit('save')
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = taRef.value
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = ta.value
    emit('update:modelValue', val.slice(0, start) + '  ' + val.slice(end))
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2
    })
  }
}
</script>

<template>
  <div class="code-editor" :class="{ readonly }">
    <pre
      ref="preRef"
      class="ce-pre"
      aria-hidden="true"
    ><code class="hljs" v-html="highlighted"></code></pre>
    <textarea
      ref="taRef"
      class="ce-ta"
      :value="modelValue"
      :readonly="readonly"
      :placeholder="placeholder"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      @input="onInput"
      @scroll="syncScroll"
      @keydown="onKeydown"
    ></textarea>
  </div>
</template>

<style>
/* 高亮调色：随浅/深色主题切换（限定在 .code-editor 内，避免污染全局） */
.code-editor {
  --jt-fg: #24292e;
  --jt-key: #005cc5;
  --jt-str: #032f62;
  --jt-num: #b6015b;
  --jt-kw: #d73a49;
  --jt-comment: #6a737d;
  --jt-caret: #24292e;
  --jt-accent: #667eea;
  --jt-accent-soft: rgba(102, 126, 234, 0.25);
  --jt-muted: #9ca3af;

  position: relative;
  height: 100%;
  min-height: 140px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  overflow: hidden;
}
.dark .code-editor {
  --jt-fg: #c9d1d9;
  --jt-key: #79b8ff;
  --jt-str: #a5d6ff;
  --jt-num: #79c0ff;
  --jt-kw: #ff7b72;
  --jt-comment: #8b949e;
  --jt-caret: #c9d1d9;
  --jt-accent: #667eea;
  --jt-accent-soft: rgba(102, 126, 234, 0.3);
  --jt-muted: #64748b;
}

.code-editor .ce-pre,
.code-editor .ce-ta {
  margin: 0;
  border: 0;
  width: 100%;
  height: 100%;
  padding: 12px 14px;
  box-sizing: border-box;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--font-size-control);
  line-height: 1.6;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.code-editor .ce-pre {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}
.code-editor .ce-pre code.hljs {
  background: transparent !important;
  padding: 0;
  font: inherit;
  display: block;
  transform: translate(0px, 0px);
  will-change: transform;
}

.code-editor .ce-ta {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow-x: hidden;
  overflow-y: auto;
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--jt-caret);
}
.code-editor .ce-ta::placeholder {
  color: var(--jt-muted);
}

.code-editor:focus-within {
  border-color: var(--jt-accent);
  box-shadow: 0 0 0 3px var(--jt-accent-soft);
}

/* highlight.js token 着色（覆盖 markdown.ts 引入的 github-dark 默认背景） */
.code-editor .hljs {
  color: var(--jt-fg);
  background: transparent;
}
.code-editor .hljs-attr,
.code-editor .hljs-attribute {
  color: var(--jt-key);
}
.code-editor .hljs-string {
  color: var(--jt-str);
}
.code-editor .hljs-number {
  color: var(--jt-num);
}
.code-editor .hljs-literal,
.code-editor .hljs-keyword,
.code-editor .hljs-built_in {
  color: var(--jt-kw);
}
.code-editor .hljs-comment {
  color: var(--jt-comment);
  font-style: italic;
}
.code-editor .hljs-punctuation {
  color: var(--jt-fg);
}
</style>
