<script setup lang="ts">
import { ref, computed } from 'vue'
import { CopyButton } from '@/components'

defineOptions({ name: 'TextStatsTool' })

const inputText = ref('')

const stats = computed(() => {
  const text = inputText.value
  const chars = [...text] // 按 Unicode 码点拆分，避免代理对（如 😀）被计为 2
  const charsWithSpace = chars.length
  const charsNoSpace = chars.filter((c) => !/\s/.test(c)).length
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  const lines = text === '' ? 0 : text.split('\n').length
  const bytes = new TextEncoder().encode(text).length
  const chinese = (text.match(/[一-龥]/g) || []).length
  return { charsWithSpace, charsNoSpace, words, lines, bytes, chinese }
})

interface StatItem {
  label: string
  value: number
  hint?: string
}
const statList = computed<StatItem[]>(() => [
  { label: '字符数（含空白）', value: stats.value.charsWithSpace },
  { label: '字符数（不含空白）', value: stats.value.charsNoSpace },
  { label: '单词数', value: stats.value.words, hint: '按空白切分' },
  { label: '行数', value: stats.value.lines },
  { label: '字节数（UTF-8）', value: stats.value.bytes },
  { label: '中文字数', value: stats.value.chinese, hint: '正则 [\\u4e00-\\u9fa5]' },
])

const summary = computed(() => statList.value.map((s) => `${s.label}：${s.value}`).join('\n'))

</script>

<template>
  <div class="ts-app">
    <section class="card">
      <div class="card-title">输入文本</div>
      <textarea
        v-model="inputText"
        class="ta"
        rows="10"
        placeholder="在此粘贴或输入文本，统计自动更新…"
        spellcheck="false"
      ></textarea>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">统计结果</span>
        <CopyButton :text="summary" variant="mini" success-text="已复制统计摘要" />
      </div>
      <div class="grid">
        <div v-for="(s, i) in statList" :key="i" class="stat">
          <div class="v">{{ s.value }}</div>
          <div class="k">
            {{ s.label }}<span v-if="s.hint" class="hint"> · {{ s.hint }}</span>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.ts-app {
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
  font-size: var(--font-size-title);
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
  font-size: var(--font-size-body);
  outline: none;
  width: 100%;
  resize: vertical;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.ta:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.7rem;
}
.stat {
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.8rem;
}
.stat .v {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--accent);
  line-height: 1.2;
}
.stat .k {
  margin-top: 0.25rem;
  color: var(--text-muted);
  font-size: var(--font-size-control);
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-control);
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
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
