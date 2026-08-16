<script setup lang="ts">
import { ref, computed } from 'vue'
import { CronExpressionParser, type CronExpression } from 'cron-parser'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'CronTool' })

const { addToast } = useToast()

const cronInput = ref('0 0 * * *')
const error = ref('')

// 兼容契约约定的 parseExpression(expr) 调用形式。
// 项目实际安装的 cron-parser 为 v5，已无具名 parseExpression 导出，
// 统一改用 CronExpressionParser.parse(expr, { currentDate })。
function parseExpression(expr: string): CronExpression {
  return CronExpressionParser.parse(expr, { currentDate: new Date() })
}

const parsed = computed<Date[] | null>(() => {
  const v = cronInput.value.trim()
  if (!v) {
    error.value = ''
    return null
  }
  try {
    const expr = parseExpression(v)
    const out: Date[] = []
    let i = 0
    // v5：CronExpression 为 ES6 可迭代对象，逐项为 CronDate
    for (const d of expr) {
      out.push(d.toDate())
      if (++i >= 5) break
    }
    error.value = ''
    return out
  } catch (e) {
    error.value = 'Cron 解析失败：' + (e instanceof Error ? e.message : String(e))
    return null
  }
})

// 下一个执行时间（随输入变化）
const nextOne = computed<string | null>(() => {
  const list = parsed.value
  if (!list || !list.length) return null
  return fmt(list[0])
})

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  const hh = String(Math.floor(a / 60)).padStart(2, '0')
  const mm = String(a % 60).padStart(2, '0')
  return `${base}（本地 UTC${sign}${hh}:${mm}）`
}

</script>

<template>
  <div class="cron-app">
    <!-- 输入 -->
    <section class="card">
      <div class="card-head">
        <span class="card-title">Cron 解析（标准 5 段）</span>
        <span class="hint">分 时 日 月 周，如 0 0 * * *</span>
      </div>
      <div class="row">
        <input v-model="cronInput" class="inp mono" placeholder="0 0 * * *" />
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="!parsed" class="hint">输入表达式后自动解析。</p>

      <div v-if="nextOne" class="next-box">
        <span class="k">下一个执行</span>
        <span class="next-val mono">{{ nextOne }}</span>
        <CopyButton :text="nextOne" variant="mini" :toast="addToast" />
      </div>
    </section>

    <!-- 最近 5 次 -->
    <section class="card">
      <div class="card-title">最近 5 次执行时间</div>
      <div v-if="parsed && parsed.length" class="list">
        <div v-for="(d, i) in parsed" :key="i" class="row-item">
          <span class="idx">{{ i + 1 }}</span>
          <span class="val mono">{{ fmt(d) }}</span>
          <CopyButton :text="fmt(d)" variant="mini" :toast="addToast" />
        </div>
      </div>
      <p v-else-if="!error" class="hint">等待输入…</p>
    </section>
  </div>
</template>

<style scoped>
.cron-app {
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
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.inp {
  flex: 1;
  min-width: 0;
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.95rem;
  outline: none;
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
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
  flex-shrink: 0;
}
.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.next-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.9rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.8rem;
}
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
  flex-shrink: 0;
}
.next-val {
  flex: 1;
  font-size: 0.92rem;
  color: var(--accent);
  font-weight: 600;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.6rem;
}
.row-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.7rem;
}
.idx {
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.72rem;
  font-weight: 600;
}
.val {
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  color: var(--text-body);
}
.err {
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
  margin: 0.3rem 0 0;
}
.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.3rem 0 0;
}
</style>
