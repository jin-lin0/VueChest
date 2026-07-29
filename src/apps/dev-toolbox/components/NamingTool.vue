<script setup lang="ts">
import { ref, computed } from 'vue'
import { Toast, CopyButton } from '@/components'

defineOptions({ name: 'NamingTool' })

const input = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function splitWords(raw: string): string[] {
  return (
    raw
      // 驼峰/帕斯卡边界：aB -> a B，AB Cdef -> AB Cdef
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // 分隔符统一成空格
      .replace(/[\s_\-.]+/g, ' ')
      .split(' ')
      .map((w) => w.trim())
      .filter(Boolean)
  )
}

function cap(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

const results = computed(() => {
  const words = splitWords(input.value)
  if (words.length === 0) return []
  const lower = words.map((w) => w.toLowerCase())
  return [
    { key: 'camelCase', value: lower.map((w, i) => (i === 0 ? w : cap(w))).join('') },
    { key: 'snake_case', value: lower.join('_') },
    { key: 'kebab-case', value: lower.join('-') },
    { key: 'PascalCase', value: lower.map((w) => cap(w)).join('') },
  ]
})

function clearAll() {
  input.value = ''
}
</script>

<template>
  <div class="naming-app">
    <section class="card">
      <div class="card-head">
        <span class="card-title">标识符输入</span>
        <span class="hint">输入即转换，支持 camel/Pascal/snake/kebab 混排</span>
      </div>
      <input
        v-model="input"
        class="inp"
        placeholder="例如 userName / user_name / user-name / UserName"
        spellcheck="false"
      />
    </section>

    <section class="card">
      <div class="card-title">转换结果</div>
      <div class="result-list">
        <div v-for="r in results" :key="r.key" class="result-row">
          <span class="k result-name">{{ r.key }}</span>
          <code class="v result-val mono">{{ r.value }}</code>
          <CopyButton :text="r.value" variant="mini" :disabled="!r.value" :toast="showToast" :success-text="`已复制 ${r.value}`" />
        </div>
        <p v-if="results.length === 0" class="hint">输入标识符后即时显示四种命名风格。</p>
      </div>
    </section>

    <div class="toolbar">
      <button class="btn ghost" @click="clearAll">清空</button>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.naming-app {
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
.mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
.toolbar {
  display: flex;
  gap: 0.4rem;
}
.btn.ghost {
  background: transparent;
}
.result-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.result-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
}
.result-name {
  width: 110px;
  flex: none;
}
.result-val {
  flex: 1;
  word-break: break-all;
}
.push-right {
  margin-left: auto;
}
</style>
