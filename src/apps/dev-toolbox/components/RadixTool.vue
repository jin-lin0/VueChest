<script setup lang="ts">
import { ref } from 'vue'
import { CustomSelect, type SelectOption, Toast, CopyButton } from '@/components'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'RadixTool' })

const BASES = [2, 8, 10, 16, 32, 36] as const
const baseOptions: SelectOption[] = BASES.map((b) => ({ value: b, label: String(b) }))
const fromBase = ref<number>(10)
const toBase = ref<number>(16)
const sourceValue = ref('')
const targetValue = ref('')
const error = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

function parseRadix(str: string, base: number): bigint {
  let s = str.trim().replace(/_/g, '')
  if (s === '') throw new Error('输入为空')
  const negative = s.startsWith('-')
  if (negative || s.startsWith('+')) s = s.slice(1)
  if (s === '') throw new Error('输入为空')
  let result = 0n
  const b = BigInt(base)
  for (const ch of s.toLowerCase()) {
    const d = DIGITS.indexOf(ch)
    if (d < 0 || d >= base) throw new Error(`非法字符「${ch}」不符合 ${base} 进制`)
    result = result * b + BigInt(d)
  }
  return negative ? -result : result
}

function formatRadix(num: bigint, base: number): string {
  const negative = num < 0n
  let n = negative ? -num : num
  if (n === 0n) return '0'
  let s = ''
  const b = BigInt(base)
  while (n > 0n) {
    s = DIGITS[Number(n % b)] + s
    n = n / b
  }
  return negative ? '-' + s : s
}

const lock = ref(false)

function recomputeFromSource() {
  if (lock.value) return
  lock.value = true
  try {
    if (!sourceValue.value.trim()) {
      targetValue.value = ''
      error.value = ''
      return
    }
    const v = parseRadix(sourceValue.value, fromBase.value)
    targetValue.value = formatRadix(v, toBase.value).toUpperCase()
    error.value = ''
  } catch (e) {
    targetValue.value = ''
    const msg = e instanceof Error ? e.message : String(e)
    error.value = msg
    showToast('error', msg)
  } finally {
    lock.value = false
  }
}

function recomputeFromTarget() {
  if (lock.value) return
  lock.value = true
  try {
    if (!targetValue.value.trim()) {
      // 目标为空：保留源字段不动，直接返回。
      // 不回写、不清除源，避免把用户输入和错误信息一起清掉（此前会触发反向清空死循环）。
      return
    }
    const v = parseRadix(targetValue.value, toBase.value)
    sourceValue.value = formatRadix(v, fromBase.value).toUpperCase()
    error.value = ''
  } catch (e) {
    // 目标解析失败：保留源字段，仅展示错误，不清除用户输入
    const msg = e instanceof Error ? e.message : String(e)
    error.value = msg
    showToast('error', msg)
  } finally {
    lock.value = false
  }
}

useRealtime(
  () => {
    recomputeFromSource()
    recomputeFromTarget()
  },
  { watch: [sourceValue, fromBase, toBase, targetValue] },
)

function clearAll() {
  sourceValue.value = ''
  targetValue.value = ''
  error.value = ''
}
function swap() {
  const f = fromBase.value
  fromBase.value = toBase.value
  toBase.value = f
  // 以源值视角重新计算目标
  recomputeFromSource()
}
</script>

<template>
  <div class="radix-app">
    <div class="toolbar">
      <button class="btn" @click="swap">⇄ 交换进制</button>
      <div class="tb-group push-right">
        <CopyButton :text="targetValue" success-text="已复制结果" :toast="showToast" />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <section class="card">
      <div class="io-row">
        <div class="io-label">源（{{ fromBase }} 进制）</div>
        <CustomSelect
          :model-value="fromBase"
          :options="baseOptions"
          size="sm"
          @update:model-value="(v) => (fromBase = v as number)"
        />
        <input
          v-model="sourceValue"
          class="inp val-input"
          :placeholder="`输入 ${fromBase} 进制数字`"
          spellcheck="false"
        />
      </div>

      <div class="io-row">
        <div class="io-label">目标（{{ toBase }} 进制）</div>
        <CustomSelect
          :model-value="toBase"
          :options="baseOptions"
          size="sm"
          @update:model-value="(v) => (toBase = v as number)"
        />
        <input
          v-model="targetValue"
          class="inp val-input"
          :placeholder="`输入 ${toBase} 进制数字`"
          spellcheck="false"
        />
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <p class="hint">使用 BigInt，支持大整数；允许下划线 _ 作分隔符；仅支持整数（不支持小数）。</p>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.radix-app {
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

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}
.tb-group {
  display: flex;
  gap: 0.4rem;
}
.tb-group.push-right {
  margin-left: auto;
}
.btn.ghost {
  background: transparent;
}
.io-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
}
.io-label {
  width: 140px;
  flex: none;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.val-input {
  flex: 1;
}
</style>
