<script setup lang="ts">
import { ref } from 'vue'
import { Toast, CopyButton } from '@/components'

defineOptions({ name: 'LinesTool' })

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const inputText = ref('')
const outputText = ref('')
const filterText = ref('')
const filterMode = ref<'include' | 'exclude'>('include')

/* ---------- 纯函数：每个操作读 inputText 写 outputText ---------- */
function toLines(text: string): string[] {
  return text.split('\n')
}

function dedupe() {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of toLines(inputText.value)) {
    if (!seen.has(line)) {
      seen.add(line)
      out.push(line)
    }
  }
  outputText.value = out.join('\n')
  finish('已去重')
}

function sortLines(asc: boolean) {
  const lines = toLines(inputText.value)
  lines.sort((a, b) => (asc ? a.localeCompare(b, 'zh-Hans-CN') : b.localeCompare(a, 'zh-Hans-CN')))
  outputText.value = lines.join('\n')
  finish(asc ? '已升序排序' : '已降序排序')
}

function removeEmpty() {
  outputText.value = toLines(inputText.value)
    .filter((l) => l.trim() !== '')
    .join('\n')
  finish('已去除空行')
}

function trimLines() {
  outputText.value = toLines(inputText.value)
    .map((l) => l.trim())
    .join('\n')
  finish('已去除每行首尾空白')
}

function reverseLines() {
  outputText.value = toLines(inputText.value).reverse().join('\n')
  finish('已反转行序')
}

function filterLines() {
  const kw = filterText.value
  if (!kw) {
    showToast('error', '请先填写过滤子串')
    return
  }
  const predicate = (l: string) =>
    filterMode.value === 'include' ? l.includes(kw) : !l.includes(kw)
  outputText.value = toLines(inputText.value).filter(predicate).join('\n')
  finish(filterMode.value === 'include' ? '已保留包含子串的行' : '已移除包含子串的行')
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
  <div class="lt-app">
    <section class="card">
      <div class="card-title">输入文本</div>
      <textarea
        v-model="inputText"
        class="ta"
        rows="8"
        placeholder="在此粘贴或输入多行文本…"
        spellcheck="false"
      ></textarea>
      <div class="toolbar">
        <button class="btn" @click="dedupe">去重</button>
        <button class="btn" @click="sortLines(true)">升序排序</button>
        <button class="btn" @click="sortLines(false)">降序排序</button>
        <button class="btn" @click="removeEmpty">去空行</button>
        <button class="btn" @click="trimLines">去首尾空白</button>
        <button class="btn" @click="reverseLines">反转行序</button>
      </div>
      <div class="toolbar">
        <input v-model="filterText" class="inp" placeholder="过滤子串" @keyup.enter="filterLines" />
        <div class="seg">
          <label><input type="radio" v-model="filterMode" value="include" /> 包含</label>
          <label><input type="radio" v-model="filterMode" value="exclude" /> 排除</label>
        </div>
        <button class="btn" @click="filterLines">按子串过滤</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">输出结果</span>
        <CopyButton :text="outputText" variant="mini" :disabled="!outputText" :toast="showToast" success-text="已复制结果" />
      </div>
      <textarea
        v-model="outputText"
        class="ta"
        rows="8"
        readonly
        placeholder="操作结果将显示在此（只读）"
        spellcheck="false"
      ></textarea>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.lt-app {
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
.inp {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  width: auto;
  min-width: 180px;
  flex: 1;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.seg {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  font-size: 0.82rem;
  color: var(--text-secondary);
}
.seg label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
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
