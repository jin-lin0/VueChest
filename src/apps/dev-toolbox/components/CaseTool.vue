<script setup lang="ts">
import { ref } from 'vue'
import { Toast, CopyButton } from '@/components'

defineOptions({ name: 'CaseTool' })

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const inputText = ref('')
const outputText = ref('')

/* ---------- 大小写 / 标题 / 句首 ---------- */
function toUpper() {
  outputText.value = inputText.value.toUpperCase()
  finish('已转大写')
}
function toLower() {
  outputText.value = inputText.value.toLowerCase()
  finish('已转小写')
}
function toTitleCase() {
  outputText.value = inputText.value
    .toLowerCase()
    .replace(/(?:^|\s)([a-z\u00C0-\uFFFF])/g, (_, c: string) => c.toUpperCase())
  finish('已转标题大小写')
}
function toSentenceCase() {
  // 以 . ! ? 及换行作为句末，句首字母大写；其余字母转小写
  const text = inputText.value.toLowerCase()
  outputText.value = text.replace(
    /(^|[.!?\n]\s*)([a-z\u00C0-\uFFFF])/g,
    (_, pre: string, c: string) => pre + c.toUpperCase(),
  )
  finish('已转句首大写')
}

/* ---------- 全角 / 半角 ----------
   ASCII 可见字符 33–126 与全角 65281–65374 偏移 0xFEE0(=65248)
   空格 32(Half) ↔ 12288(Full) */
const OFFSET = 0xfee0
function toHalfWidth() {
  let out = ''
  for (const ch of inputText.value) {
    const code = ch.codePointAt(0)!
    if (code === 12288) out += ' '
    else if (code >= 65281 && code <= 65374) out += String.fromCodePoint(code - OFFSET)
    else out += ch
  }
  outputText.value = out
  finish('已转半角')
}
function toFullWidth() {
  let out = ''
  for (const ch of inputText.value) {
    const code = ch.codePointAt(0)!
    if (code === 32) out += String.fromCodePoint(12288)
    else if (code >= 33 && code <= 126) out += String.fromCodePoint(code + OFFSET)
    else out += ch
  }
  outputText.value = out
  finish('已转全角')
}

function finish(msg: string) {
  if (!inputText.value) {
    showToast('error', '请输入内容')
    return
  }
  showToast('success', msg)
}

</script>

<template>
  <div class="ct-app">
    <section class="card">
      <div class="card-title">输入文本</div>
      <textarea
        v-model="inputText"
        class="ta"
        rows="8"
        placeholder="在此粘贴或输入文本…"
        spellcheck="false"
      ></textarea>
      <div class="toolbar">
        <button class="btn" @click="toUpper">大写</button>
        <button class="btn" @click="toLower">小写</button>
        <button class="btn" @click="toTitleCase">首字母大写</button>
        <button class="btn" @click="toSentenceCase">句首大写</button>
        <button class="btn" @click="toHalfWidth">全角→半角</button>
        <button class="btn" @click="toFullWidth">半角→全角</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">输出结果</span>
        <CopyButton :text="outputText" variant="mini" success-text="已复制结果" :toast="showToast" />
      </div>
      <textarea
        v-model="outputText"
        class="ta"
        rows="8"
        readonly
        placeholder="转换结果将显示在此（只读）"
        spellcheck="false"
      ></textarea>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.ct-app {
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
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.7rem;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 0.7rem;
}
.card-head .card-title {
  margin-bottom: 0;
}
.ta {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  resize: vertical;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.ta:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 0.7rem;
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
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
