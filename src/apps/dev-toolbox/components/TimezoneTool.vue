<script setup lang="ts">
import { ref, computed } from 'vue'
import { CustomSelect, type SelectOption, CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'TimezoneTool' })

const { addToast } = useToast()

type Mode = 'datetime' | 'timestamp'

const mode = ref<Mode>('datetime')

// 源时区：'local' 表示浏览器本地时区（datetime-local 输入按本地解释）
const LOCAL = 'local'
const srcTz = ref<string>(LOCAL)

const dtInput = ref('')
const tsInput = ref('')
const tsUnit = ref<string>('auto')
const tsUnitOptions: SelectOption[] = [
  { value: 'auto', label: '自动识别' },
  { value: 's', label: '秒 (s)' },
  { value: 'ms', label: '毫秒 (ms)' },
]

// 常用目标时区
const TARGETS = [
  { tz: 'UTC', label: 'UTC' },
  { tz: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { tz: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { tz: 'Asia/Dubai', label: 'Asia/Dubai' },
  { tz: 'Europe/London', label: 'Europe/London' },
  { tz: 'Europe/Paris', label: 'Europe/Paris' },
  { tz: 'America/New_York', label: 'America/New_York' },
  { tz: 'America/Los_Angeles', label: 'America/Los_Angeles' },
]

const srcTzOptions: SelectOption[] = [
  { value: LOCAL, label: '本地时区（浏览器）' },
  ...TARGETS.map((t) => ({ value: t.tz, label: t.label })),
]

// 计算某时区在给定瞬间的 UTC 偏移（分钟），可处理夏令时
function getOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const m: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second)
  return Math.round((asUtc - date.getTime()) / 60000)
}

// 将「某时区的墙钟时间」字符串转为绝对 UTC 毫秒（两次校正以处理 DST 边界）
function tzWallToUtc(wall: string, tz: string): number {
  const [datePart, timePart = '00:00:00'] = wall.split('T')
  const [Y, M, D] = datePart.split('-').map(Number)
  const [h, mi, s = 0] = timePart.split(':').map(Number)
  let guess = Date.UTC(Y, M - 1, D, h, mi, s)
  const off1 = getOffsetMinutes(tz, new Date(guess))
  guess -= off1 * 60000
  const off2 = getOffsetMinutes(tz, new Date(guess))
  guess -= (off2 - off1) * 60000
  return guess
}

const utcState = computed<{ value: number | null; error: string }>(() => {
  if (mode.value === 'timestamp') {
    const v = tsInput.value.trim()
    if (!v) return { value: null, error: '' }
    if (!/^\d+$/.test(v)) {
      return { value: null, error: '时间戳需为纯数字' }
    }
    let ms: number
    if (tsUnit.value === 's') ms = Number(v) * 1000
    else if (tsUnit.value === 'ms') ms = Number(v)
    else ms = v.length <= 10 ? Number(v) * 1000 : Number(v)
    if (isNaN(ms)) {
      return { value: null, error: '时间戳超出可表示范围' }
    }
    return { value: ms, error: '' }
  }
  // datetime 模式
  const v = dtInput.value
  if (!v) return { value: null, error: '' }
  if (srcTz.value === LOCAL) {
    const d = new Date(v)
    if (isNaN(d.getTime())) {
      return { value: null, error: '无效的日期时间' }
    }
    return { value: d.getTime(), error: '' }
  }
  try {
    const ms = tzWallToUtc(v, srcTz.value)
    if (isNaN(ms)) {
      return { value: null, error: '无法解析该时区时间' }
    }
    return { value: ms, error: '' }
  } catch {
    return { value: null, error: '无法解析该时区时间' }
  }
})
const utcMs = computed(() => utcState.value.value)
const error = computed(() => utcState.value.error)

function fmtInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms))
}

function offsetAt(tz: string, ms: number): string {
  const off = getOffsetMinutes(tz, new Date(ms))
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  const hh = String(Math.floor(a / 60)).padStart(2, '0')
  const mm = String(a % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

const results = computed(() => {
  const ms = utcMs.value
  if (ms == null) return []
  return TARGETS.map((t) => ({
    label: t.tz,
    offset: t.tz === 'UTC' ? 'UTC+00:00' : offsetAt(t.tz, ms),
    value: fmtInTz(ms, t.tz),
  }))
})

const utcReadout = computed(() => {
  const ms = utcMs.value
  if (ms == null) return null
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    iso: d.toISOString(),
    utc: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
    local: fmtInTz(ms, Intl.DateTimeFormat().resolvedOptions().timeZone),
  }
})

function setNow() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  dtInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  srcTz.value = LOCAL
}
function setNowTs() {
  mode.value = 'timestamp'
  tsInput.value = String(Math.floor(Date.now() / 1000))
  tsUnit.value = 's'
}
</script>

<template>
  <div class="tz-app">
    <!-- 输入 -->
    <section class="card">
      <div class="card-head">
        <span class="card-title">时区转换</span>
        <div class="row">
          <label class="radio"><input type="radio" value="datetime" v-model="mode" /> 按时间</label>
          <label class="radio"
            ><input type="radio" value="timestamp" v-model="mode" /> 按时间戳</label
          >
        </div>
      </div>

      <!-- 时间输入 -->
      <div v-if="mode === 'datetime'" class="row">
        <input v-model="dtInput" type="datetime-local" step="1" class="inp mono" />
        <CustomSelect v-model="srcTz" :options="srcTzOptions" size="sm" />
        <button class="mini" @click="setNow">使用当前</button>
      </div>

      <!-- 时间戳输入 -->
      <div v-else class="row">
        <input v-model="tsInput" class="inp mono" placeholder="输入时间戳，如 1719475200" />
        <CustomSelect v-model="tsUnit" :options="tsUnitOptions" size="sm" />
        <button class="mini" @click="setNowTs">使用当前</button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="!utcReadout" class="hint">输入时间或时间戳后，自动换算各时区对应时刻。</p>

      <div v-if="utcReadout" class="out">
        <div class="out-row">
          <span class="k">UTC</span><span class="v mono">{{ utcReadout.utc }}</span>
          <CopyButton :text="utcReadout.utc" variant="mini" :toast="addToast" />
        </div>
        <div class="out-row">
          <span class="k">本地</span><span class="v mono">{{ utcReadout.local }}</span>
          <CopyButton :text="utcReadout.local" variant="mini" :toast="addToast" />
        </div>
        <div class="out-row">
          <span class="k">ISO 8601</span><span class="v mono">{{ utcReadout.iso }}</span>
          <CopyButton :text="utcReadout.iso" variant="mini" :toast="addToast" />
        </div>
      </div>
    </section>

    <!-- 目标时区列表 -->
    <section class="card">
      <div class="card-title">各时区对应时间</div>
      <div v-if="results.length" class="tz-list">
        <div v-for="r in results" :key="r.label" class="tz-row">
          <div class="tz-meta">
            <span class="tz-name mono">{{ r.label }}</span>
            <span class="tz-off">{{ r.offset }}</span>
          </div>
          <span class="tz-val mono">{{ r.value }}</span>
          <CopyButton :text="r.value" variant="mini" :toast="addToast" />
        </div>
      </div>
      <p v-else class="hint">等待输入…</p>
    </section>
  </div>
</template>

<style scoped>
.tz-app {
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
.radio {
  font-size: 0.82rem;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
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
.out {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.8rem;
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
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
  flex-shrink: 0;
  width: 4.5rem;
}
.v {
  font-size: 0.88rem;
  color: var(--text-body);
}
.tz-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.tz-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
}
.tz-meta {
  display: flex;
  flex-direction: column;
  min-width: 11rem;
  flex-shrink: 0;
}
.tz-name {
  font-size: 0.85rem;
  color: var(--text-primary);
}
.tz-off {
  font-size: 0.72rem;
  color: var(--text-muted);
}
.tz-val {
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
