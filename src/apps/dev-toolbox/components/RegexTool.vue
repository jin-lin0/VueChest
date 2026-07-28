<script setup lang="ts">
import { ref } from 'vue'
import { copyToClipboard, debounce } from '@/utils'
import { Toast } from '@/components'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'RegexTool' })

const text = ref('foo bar foo baz foo123\nemail: test@example.com')
const pattern = ref('foo(\\w*)')
const flags = ref('g')
const error = ref('')
interface MatchItem {
  index: number
  value: string
  groups: string[]
}
const matches = ref<MatchItem[]>([])

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function test() {
  error.value = ''
  matches.value = []
  const p = pattern.value
  const f = flags.value
  if (!p) {
    error.value = '请输入正则 pattern'
    return
  }
  let regex: RegExp
  try {
    regex = new RegExp(p, f)
  } catch (e) {
    error.value = '非法正则：' + (e instanceof Error ? e.message : String(e))
    showToast('error', error.value)
    return
  }
  // 收集全部匹配需要全局标志；用户未给 g 时迭代副本补上
  const iterFlags = f.includes('g') ? f : f + 'g'
  let iter: RegExp
  try {
    iter = new RegExp(p, iterFlags)
  } catch {
    iter = regex
  }
  const result: MatchItem[] = []
  let m: RegExpExecArray | null
  let guard = 0
  iter.lastIndex = 0
  while ((m = iter.exec(text.value)) !== null) {
    result.push({ index: m.index, value: m[0], groups: m.slice(1).map((x) => x ?? '') })
    // 防止零长度匹配导致死循环
    if (m.index === iter.lastIndex) iter.lastIndex++
    if (++guard > 10000) break
  }
  matches.value = result
}

const run = debounce(() => test(), 150)
useRealtime(run, { watch: [text, pattern, flags] })

async function copyAll() {
  if (!matches.value.length) return
  const text = matches.value.map((mm) => mm.value).join('\n')
  await copyToClipboard(text)
  showToast('success', '已复制全部匹配')
}

test()
</script>

<template>
  <div class="regex-app">
    <section class="card">
      <div class="card-title">待测文本</div>
      <textarea
        v-model="text"
        class="plain"
        rows="6"
        placeholder="在此粘贴待匹配文本…"
        spellcheck="false"
      ></textarea>
    </section>

    <section class="card">
      <div class="card-title">
        正则
        <button class="mini push" :disabled="!matches.length" @click="copyAll">复制全部匹配</button>
      </div>
      <div class="regex-row">
        <span class="slash">/</span>
        <input v-model="pattern" class="inp" placeholder="pattern" spellcheck="false" />
        <span class="slash">/</span>
        <input v-model="flags" class="inp flags" placeholder="g" spellcheck="false" />
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else class="hint">共匹配 {{ matches.length }} 处（默认 flags: g）</p>
    </section>

    <section class="card">
      <div class="card-title">匹配结果</div>
      <div v-if="matches.length">
        <div v-for="(mm, i) in matches" :key="i" class="match">
          <div class="match-head">
            <span class="k">#{{ i + 1 }} · 索引 {{ mm.index }}</span>
            <code class="mono match-val">{{ mm.value }}</code>
          </div>
          <div v-if="mm.groups.length" class="groups">
            <span class="k">捕获组：</span>
            <code v-for="(g, gi) in mm.groups" :key="gi" class="mono group"
              >{{ gi + 1 }}: {{ g }}</code
            >
          </div>
        </div>
      </div>
      <p v-else class="hint">暂无匹配</p>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.regex-app {
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
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.plain {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  resize: vertical;
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.inp {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.flags {
  width: 80px;
}
.regex-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.slash {
  color: var(--text-muted);
  font-size: 1rem;
}
.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
}
.err {
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
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
.push {
  margin-left: auto;
}
.match {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.55rem 0.7rem;
  margin-bottom: 0.5rem;
  background: var(--bg-input);
}
.match-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.match-val {
  font-size: 0.9rem;
  color: var(--accent);
  word-break: break-all;
}
.groups {
  margin-top: 0.4rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.group {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.2rem 0.45rem;
  font-size: 0.78rem;
  color: var(--text-body);
  word-break: break-all;
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
</style>
