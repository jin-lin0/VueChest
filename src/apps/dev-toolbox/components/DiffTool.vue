<script setup lang="ts">
import { ref, computed } from 'vue'
import { diffLines, diffWords } from 'diff'
import CopyButton from '@/components/common/CopyButton.vue'

defineOptions({ name: 'DiffTool' })

const original = ref('')
const compare = ref('')
const charLevel = ref(false)

type DiffType = 'added' | 'removed' | 'unchanged'
interface DiffLine {
  sign: '+' | '-' | ' '
  text: string
  type: DiffType
}
interface DiffSeg {
  text: string
  type: DiffType
}

const parts = computed(() =>
  charLevel.value
    ? diffWords(original.value, compare.value)
    : diffLines(original.value, compare.value),
)

// 行级：把每个 part 按行展开，逐行用文本节点渲染（不使用 v-html，避免 XSS）
const lineItems = computed<DiffLine[]>(() => {
  const items: DiffLine[] = []
  for (const p of parts.value) {
    const type: DiffType = p.added ? 'added' : p.removed ? 'removed' : 'unchanged'
    const sign: DiffLine['sign'] = p.added ? '+' : p.removed ? '-' : ' '
    const lines = p.value.split('\n')
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    for (const l of lines) items.push({ sign, text: l, type })
  }
  return items
})

// 字符级：inline 渲染，每个 token 用文本节点
const wordItems = computed<DiffSeg[]>(() =>
  parts.value.map((p) => ({
    text: p.value,
    type: p.added ? 'added' : p.removed ? 'removed' : 'unchanged',
  })),
)

const copyText = computed(() =>
  charLevel.value
    ? wordItems.value.map((s) => s.text).join('')
    : lineItems.value.map((l) => l.sign + l.text).join('\n'),
)

function swap() {
  const t = original.value
  original.value = compare.value
  compare.value = t
}
</script>

<template>
  <div class="df-app">
    <div class="topbar">
      <label class="toggle">
        <input type="checkbox" v-model="charLevel" />
        字符级对比（diffWords）
      </label>
      <button class="mini" @click="swap">⇄ 交换左右</button>
      <CopyButton :text="copyText" variant="mini" success-text="已复制差异结果" />
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-title">原始文本</div>
        <textarea
          v-model="original"
          class="ta"
          placeholder="粘贴原始文本…"
          spellcheck="false"
        ></textarea>
      </section>
      <section class="card">
        <div class="card-title">对比文本</div>
        <textarea
          v-model="compare"
          class="ta"
          placeholder="粘贴对比文本…"
          spellcheck="false"
        ></textarea>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">差异结果</span>
        <span class="legend">
          <span class="lg added">新增</span><span class="lg removed">删除</span
          ><span class="lg unchanged">不变</span>
        </span>
      </div>
      <div class="diff-out">
        <template v-if="charLevel">
          <div class="dword">
            <span v-for="(it, i) in wordItems" :key="i" :class="['seg', it.type]">{{
              it.text
            }}</span>
          </div>
        </template>
        <template v-else>
          <div v-if="!lineItems.length" class="empty">无差异</div>
          <div v-for="(it, i) in lineItems" v-else :key="i" class="dline" :class="it.type">
            <span class="sign">{{ it.sign }}</span
            ><span class="txt">{{ it.text }}</span>
          </div>
        </template>
      </div>
    </section>

  </div>
</template>

<style scoped>
.df-app {
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
.topbar {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--font-size-control);
  color: var(--text-secondary);
  cursor: pointer;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  min-height: 160px;
  resize: vertical;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.ta:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.legend {
  display: inline-flex;
  gap: 0.5rem;
}
.lg {
  font-size: var(--font-size-small);
  padding: 0.12rem 0.45rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-light);
}
/* 图例：文字走语义文字档（#16a34a / #dc2626 只按白底算过，分别是 3.30 / 4.83:1，
   前者不达标）；边框是装饰性的非文字元素，继续用填充档。 */
.lg.added {
  color: var(--success-text);
  border-color: var(--success);
}
.lg.removed {
  color: var(--danger-text);
  border-color: var(--danger);
}
.lg.unchanged {
  color: var(--text-muted);
}

/* 差异渲染区：文本节点逐行/逐段输出，杜绝 v-html 注入 */
.diff-out {
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.6rem;
  max-height: 420px;
  overflow: auto;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--font-size-body);
  line-height: 1.6;
}
.dline {
  display: flex;
  white-space: pre-wrap;
  word-break: break-all;
}
.dline .sign {
  flex-shrink: 0;
  width: 1.2em;
  user-select: none;
  opacity: 0.7;
}
.dline .txt {
  flex: 1;
}
/* 差异高亮的「增/删」行：底色是自己染的 12% 同色。
   原来的字面色（#15803d / #b91c1c / 符号 #16a34a / #dc2626）都只按白底算过，
   落在染色底上时 #16a34a 只有 2.74:1；深色主题下这些深色更是直接融进底里。
   统一走语义文字档：在自己的染色底上过 AA，且分主题取值。 */
.dline.added {
  background: rgba(22, 163, 74, 0.12);
  color: var(--success-text);
}
.dline.added .sign {
  color: var(--success-text);
}
.dline.removed {
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger-text);
}
.dline.removed .sign {
  color: var(--danger-text);
}
.dline.unchanged {
  color: var(--text-muted);
}
.dword {
  white-space: pre-wrap;
  word-break: break-all;
}
.seg.added {
  background: rgba(22, 163, 74, 0.16);
  color: var(--success-text);
}
.seg.removed {
  background: rgba(220, 38, 38, 0.16);
  color: var(--danger-text);
  text-decoration: line-through;
}
.seg.unchanged {
  color: var(--text-body);
}
.empty {
  color: var(--text-muted);
  font-size: var(--font-size-body);
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
  color: var(--accent-text);
}
@media (max-width: 880px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
