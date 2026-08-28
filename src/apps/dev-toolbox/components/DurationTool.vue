<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'DurationTool' })

const { addToast } = useToast()

type Mode = 'diff' | 'countdown'
const mode = ref<Mode>('diff')

const startInput = ref('')
const endInput = ref('')
const targetInput = ref('')

interface DurationParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

interface DiffResult extends DurationParts {
  totalSec: number
  isNeg: boolean
}

interface CountdownResult extends DurationParts {
  expired: boolean
}

// (a) 两段 datetime-local 相减
const diffState = computed<{ result: DiffResult | null; error: string }>(() => {
  if (!startInput.value || !endInput.value) return { result: null, error: '' }
  const a = new Date(startInput.value).getTime()
  const b = new Date(endInput.value).getTime()
  if (isNaN(a) || isNaN(b)) {
    return { result: null, error: '请选择有效的起止时间' }
  }
  const absMs = Math.abs(b - a)
  const totalSec = Math.floor(absMs / 1000)
  return {
    result: {
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      totalSec,
      isNeg: b < a,
    },
    error: '',
  }
})
const diff = computed(() => diffState.value.result)
const diffError = computed(() => diffState.value.error)

// (b) 倒计时：每秒刷新
const now = ref(Date.now())
const timer = window.setInterval(() => {
  now.value = Date.now()
}, 1000)
onUnmounted(() => {
  clearInterval(timer)
})

const countdownState = computed<{ result: CountdownResult | null; error: string }>(() => {
  const v = targetInput.value
  if (!v) return { result: null, error: '' }
  const t = new Date(v).getTime()
  if (isNaN(t)) {
    return { result: null, error: '请选择有效的目标时间' }
  }
  const diffMs = t - now.value
  const expired = diffMs <= 0
  const totalSec = Math.floor(Math.abs(diffMs) / 1000)
  return {
    result: {
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      expired,
    },
    error: '',
  }
})
const countdown = computed(() => countdownState.value.result)
const cdError = computed(() => countdownState.value.error)

function segText(d: DurationParts): string {
  return `${d.days}天 ${d.hours}时 ${d.minutes}分 ${d.seconds}秒`
}

function setNowEnd() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  endInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function setTargetNow() {
  const d = new Date(Date.now() + 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  targetInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
</script>

<template>
  <div class="dur-app">
    <!-- 模式切换 -->
    <section class="card">
      <div class="card-head">
        <span class="card-title">时长计算</span>
        <div class="row">
          <label class="radio"><input type="radio" value="diff" v-model="mode" /> 两时间差</label>
          <label class="radio"
            ><input type="radio" value="countdown" v-model="mode" /> 倒计时</label
          >
        </div>
      </div>

      <!-- (a) 时间差 -->
      <div v-if="mode === 'diff'" class="row">
        <input
          v-model="startInput"
          type="datetime-local"
          step="1"
          class="inp mono"
          placeholder="开始时间"
        />
        <span class="tilde">→</span>
        <input
          v-model="endInput"
          type="datetime-local"
          step="1"
          class="inp mono"
          placeholder="结束时间"
        />
        <button class="mini" @click="setNowEnd">结束=现在</button>
      </div>

      <!-- (b) 倒计时 -->
      <div v-else class="row">
        <input
          v-model="targetInput"
          type="datetime-local"
          step="1"
          class="inp mono"
          placeholder="目标时间"
        />
        <button class="mini" @click="setTargetNow">+1 小时</button>
      </div>

      <p v-if="diffError || cdError" class="err">{{ diffError || cdError }}</p>
    </section>

    <!-- (a) 结果 -->
    <section v-if="mode === 'diff'" class="card">
      <div class="card-title">差值</div>
      <div v-if="diff" class="result">
        <div class="seg-grid">
          <div class="seg">
            <span class="k">天</span><span class="v mono">{{ diff.days }}</span>
          </div>
          <div class="seg">
            <span class="k">时</span><span class="v mono">{{ diff.hours }}</span>
          </div>
          <div class="seg">
            <span class="k">分</span><span class="v mono">{{ diff.minutes }}</span>
          </div>
          <div class="seg">
            <span class="k">秒</span><span class="v mono">{{ diff.seconds }}</span>
          </div>
        </div>
        <div class="out-row">
          <span class="k">{{ diff.isNeg ? '结束早于开始' : '可读' }}</span>
          <span class="v mono">{{ segText(diff) }}</span>
          <CopyButton :text="segText(diff)" variant="mini" :toast="addToast" />
        </div>
        <div class="out-row">
          <span class="k">总秒数</span><span class="v mono">{{ diff.totalSec }}</span>
          <CopyButton :text="String(diff.totalSec)" variant="mini" :toast="addToast" />
        </div>
      </div>
      <p v-else class="hint">选择开始与结束时间后自动计算。</p>
    </section>

    <!-- (b) 结果 -->
    <section v-else class="card">
      <div class="card-title">剩余时间</div>
      <div v-if="countdown" class="result">
        <div v-if="countdown.expired" class="expired">⏰ 目标时间已到达 / 已过期</div>
        <div v-else class="seg-grid">
          <div class="seg">
            <span class="k">天</span><span class="v mono">{{ countdown.days }}</span>
          </div>
          <div class="seg">
            <span class="k">时</span><span class="v mono">{{ countdown.hours }}</span>
          </div>
          <div class="seg">
            <span class="k">分</span><span class="v mono">{{ countdown.minutes }}</span>
          </div>
          <div class="seg">
            <span class="k">秒</span><span class="v mono">{{ countdown.seconds }}</span>
          </div>
        </div>
        <div class="out-row">
          <span class="k">{{ countdown.expired ? '已过期' : '可读' }}</span>
          <span class="v mono">{{
            countdown.expired ? segText(countdown) + '（前）' : segText(countdown)
          }}</span>
          <CopyButton :text="segText(countdown)" variant="mini" :toast="addToast" />
        </div>
      </div>
      <p v-else class="hint">选择目标时间后，每秒刷新剩余时长。</p>
    </section>
  </div>
</template>

<style scoped>
.dur-app {
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
.tilde {
  color: var(--text-muted);
  flex-shrink: 0;
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
.seg-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.6rem;
  margin: 0.4rem 0 0.8rem;
}
.seg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.4rem;
}
.seg .v {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--accent);
}
.k {
  color: var(--text-muted);
  font-size: 0.78rem;
}
.out-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.7rem;
  margin-top: 0.5rem;
}
.out-row .v {
  flex: 1;
  min-width: 0;
}
.v {
  font-size: 0.88rem;
  color: var(--text-body);
}
.expired {
  color: var(--danger, #ef4444);
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.5rem 0;
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
