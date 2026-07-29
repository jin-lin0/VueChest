<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { CustomSelect, type SelectOption, Toast, CopyButton } from '@/components'

defineOptions({ name: 'TimestampTool' })

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

/* 当前时间（每秒刷新） */
const now = ref(Date.now())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const nowSec = computed(() => Math.floor(now.value / 1000))
const nowMs = computed(() => now.value)
const nowLocal = computed(() => fmt(now.value, 'local'))
const nowUtc = computed(() => fmt(now.value, 'utc'))
const nowIso = computed(() => new Date(now.value).toISOString())

/* 时间戳 -> 日期 */
const tsInput = ref('')
const tsUnit = ref<string>('auto')
const tsUnitOptions: SelectOption[] = [
  { value: 'auto', label: '自动识别' },
  { value: 's', label: '秒 (s)' },
  { value: 'ms', label: '毫秒 (ms)' },
]
const tsError = ref('')
const tsResult = computed(() => {
  const v = tsInput.value.trim()
  if (!v) {
    tsError.value = ''
    return null
  }
  if (!/^\d+$/.test(v)) {
    tsError.value = '请输入纯数字时间戳'
    return null
  }
  let ms: number
  if (tsUnit.value === 's') ms = Number(v) * 1000
  else if (tsUnit.value === 'ms') ms = Number(v)
  else ms = v.length <= 10 ? Number(v) * 1000 : Number(v)
  const d = new Date(ms)
  if (isNaN(d.getTime())) {
    tsError.value = '时间戳超出可表示范围'
    return null
  }
  tsError.value = ''
  return {
    local: fmt(d.getTime(), 'local'),
    utc: fmt(d.getTime(), 'utc'),
    iso: d.toISOString(),
    sec: Math.floor(d.getTime() / 1000),
    ms: d.getTime(),
  }
})

/* 日期 -> 时间戳 */
const dateInput = ref('')
const dateError = ref('')
const dateResult = computed(() => {
  const v = dateInput.value
  if (!v) {
    dateError.value = ''
    return null
  }
  const d = new Date(v)
  if (isNaN(d.getTime())) {
    dateError.value = '无效的日期时间'
    return null
  }
  dateError.value = ''
  return { ms: d.getTime(), sec: Math.floor(d.getTime() / 1000) }
})

function fmt(ms: number, kind: 'local' | 'utc'): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  const Y = kind === 'utc' ? d.getUTCFullYear() : d.getFullYear()
  const M = (kind === 'utc' ? d.getUTCMonth() : d.getMonth()) + 1
  const D = kind === 'utc' ? d.getUTCDate() : d.getDate()
  const h = kind === 'utc' ? d.getUTCHours() : d.getHours()
  const m = kind === 'utc' ? d.getUTCMinutes() : d.getMinutes()
  const s = kind === 'utc' ? d.getUTCSeconds() : d.getSeconds()
  return `${Y}-${p(M)}-${p(D)} ${p(h)}:${p(m)}:${p(s)}`
}

function useNowTs() {
  tsInput.value = String(Math.floor(Date.now() / 1000))
  tsUnit.value = 's'
}
function useNowDate() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  dateInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
</script>

<template>
  <div class="ts-app">
    <!-- 当前时间 -->
    <section class="card now">
      <div class="card-title">当前时间</div>
      <div class="now-grid">
        <div class="now-item">
          <span class="k">秒级时间戳</span>
          <span class="v mono">{{ nowSec }}</span>
          <CopyButton :text="String(nowSec)" variant="mini" :toast="showToast" />
        </div>
        <div class="now-item">
          <span class="k">毫秒时间戳</span>
          <span class="v mono">{{ nowMs }}</span>
          <CopyButton :text="String(nowMs)" variant="mini" :toast="showToast" />
        </div>
        <div class="now-item">
          <span class="k">本地时间</span>
          <span class="v mono">{{ nowLocal }}</span>
          <CopyButton :text="nowLocal" variant="mini" :toast="showToast" />
        </div>
        <div class="now-item">
          <span class="k">UTC 时间</span>
          <span class="v mono">{{ nowUtc }}</span>
          <CopyButton :text="nowUtc" variant="mini" :toast="showToast" />
        </div>
        <div class="now-item now-item-wide">
          <span class="k">ISO 8601</span>
          <span class="v mono">{{ nowIso }}</span>
          <CopyButton :text="nowIso" variant="mini" :toast="showToast" />
        </div>
      </div>
    </section>

    <div class="cols">
      <!-- 时间戳 -> 日期 -->
      <section class="card">
        <div class="card-head">
          <span class="card-title">时间戳 → 日期</span>
          <button class="mini" @click="useNowTs">使用当前</button>
        </div>
        <div class="row">
          <input v-model="tsInput" class="inp mono" placeholder="输入时间戳，如 1719475200" />
          <CustomSelect v-model="tsUnit" :options="tsUnitOptions" size="sm" />
        </div>
        <p v-if="tsError" class="err">{{ tsError }}</p>
        <div v-if="tsResult" class="out">
          <div class="out-row">
            <span class="k">本地时间</span><span class="v mono">{{ tsResult.local }}</span>
            <CopyButton :text="tsResult.local" variant="mini" :toast="showToast" />
          </div>
          <div class="out-row">
            <span class="k">UTC 时间</span><span class="v mono">{{ tsResult.utc }}</span>
            <CopyButton :text="tsResult.utc" variant="mini" :toast="showToast" />
          </div>
          <div class="out-row">
            <span class="k">ISO 8601</span><span class="v mono">{{ tsResult.iso }}</span>
            <CopyButton :text="tsResult.iso" variant="mini" :toast="showToast" />
          </div>
          <div class="out-row">
            <span class="k">秒 / 毫秒</span>
            <span class="v mono">{{ tsResult.sec }} / {{ tsResult.ms }}</span>
          </div>
        </div>
        <p v-else-if="!tsError" class="hint">输入时间戳后自动转换（长度 ≤10 位按秒处理）。</p>
      </section>

      <!-- 日期 -> 时间戳 -->
      <section class="card">
        <div class="card-head">
          <span class="card-title">日期 → 时间戳</span>
          <button class="mini" @click="useNowDate">使用当前</button>
        </div>
        <div class="row">
          <input v-model="dateInput" type="datetime-local" step="1" class="inp mono" />
        </div>
        <p v-if="dateError" class="err">{{ dateError }}</p>
        <div v-if="dateResult" class="out">
          <div class="out-row">
            <span class="k">秒级</span><span class="v mono">{{ dateResult.sec }}</span>
            <CopyButton :text="String(dateResult.sec)" variant="mini" :toast="showToast" />
          </div>
          <div class="out-row">
            <span class="k">毫秒级</span><span class="v mono">{{ dateResult.ms }}</span>
            <CopyButton :text="String(dateResult.ms)" variant="mini" :toast="showToast" />
          </div>
        </div>
        <p v-else-if="!dateError" class="hint">选择日期时间后自动转换。</p>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.ts-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.5rem 1rem 1.5rem;
  color: var(--text-body);
  display: flex;
  flex-direction: column;
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
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}

.now-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.6rem;
  margin-top: 0.8rem;
}
.now-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
}
.now-item-wide {
  grid-column: 1 / -1;
}
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
  flex-shrink: 0;
}
.v {
  font-size: 0.88rem;
  color: var(--text-body);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.row {
  display: flex;
  gap: 0.5rem;
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
  font-size: 0.85rem;
  outline: none;
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.out {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.out-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.7rem;
}
.out-row .v {
  flex: 1;
  min-width: 0;
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

@media (max-width: 880px) {
  .cols {
    grid-template-columns: 1fr;
  }
  .now-grid {
    grid-template-columns: 1fr;
  }
}
</style>
