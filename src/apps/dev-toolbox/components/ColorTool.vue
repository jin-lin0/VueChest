<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils'
import { Toast, CopyButton } from '@/components'

defineOptions({ name: 'ColorTool' })

const input = ref('#3498db')
const error = ref('')
const r = ref(52)
const g = ref(152)
const b = ref(219)
const h = ref(204)
const s = ref(70)
const l = ref(53)

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const hexStr = computed(() => rgbToHex(r.value, g.value, b.value))
const rgbStr = computed(() => `rgb(${r.value}, ${g.value}, ${b.value})`)
const hslStr = computed(
  () => `hsl(${Math.round(h.value)}, ${Math.round(s.value)}%, ${Math.round(l.value)}%)`,
)

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function parse() {
  error.value = ''
  const raw = input.value.trim()
  if (!raw) {
    error.value = '请输入颜色值'
    return
  }
  // HEX（可选 #，支持 3 位简写，容错空格/大小写）
  let m = raw.match(/^#?\s*([0-9a-f]{3}|[0-9a-f]{6})\s*$/i)
  if (m) {
    let hex = m[1]
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    const ri = parseInt(hex.slice(0, 2), 16)
    const gi = parseInt(hex.slice(2, 4), 16)
    const bi = parseInt(hex.slice(4, 6), 16)
    setRgb(ri, gi, bi)
    return
  }
  // RGB / RGBA（容错空格、逗号或空格分隔、大小写、可选 alpha）
  m = raw.match(/^rgba?\s*\(\s*(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})\s*(?:[,/]\s*[\d.]+(%)?\s*)?\)$/i)
  if (m) {
    setRgb(clamp(+m[1], 0, 255), clamp(+m[2], 0, 255), clamp(+m[3], 0, 255))
    return
  }
  // HSL / HSLA（同上容错）
  m = raw.match(/^hsla?\s*\(\s*(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})\s*(?:[,/]\s*[\d.]+(%)?\s*)?\)$/i)
  if (m) {
    setHsl(clamp(+m[1], 0, 360), clamp(+m[2], 0, 100), clamp(+m[3], 0, 100))
    return
  }
  error.value = '无法识别的颜色格式，支持 HEX / RGB / HSL'
  showToast('error', error.value)
}

function setRgb(ri: number, gi: number, bi: number) {
  r.value = ri
  g.value = gi
  b.value = bi
  const [hh, ss, ll] = rgbToHsl(ri, gi, bi)
  h.value = hh
  s.value = ss
  l.value = ll
}

function setHsl(hi: number, si: number, li: number) {
  h.value = hi
  s.value = si
  l.value = li
  const [ri, gi, bi] = hslToRgb(hi, si, li)
  r.value = ri
  g.value = gi
  b.value = bi
}

function rgbToHex(ri: number, gi: number, bi: number) {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return '#' + to(ri) + to(gi) + to(bi)
}

function rgbToHsl(ri: number, gi: number, bi: number): [number, number, number] {
  const rn = ri / 255
  const gn = gi / 255
  const bn = bi / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const ll = (max + min) / 2
  let hh = 0
  let ss = 0
  const d = max - min
  if (d !== 0) {
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        hh = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        hh = (bn - rn) / d + 2
        break
      default:
        hh = (rn - gn) / d + 4
    }
    hh *= 60
  }
  return [Math.round(hh), Math.round(ss * 100), Math.round(ll * 100)]
}

function hslToRgb(hi: number, si: number, li: number): [number, number, number] {
  const hn = hi / 360
  const sn = si / 100
  const ln = li / 100
  let ri = 0
  let gi = 0
  let bi = 0
  if (sn === 0) {
    ri = gi = bi = ln
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
    const p = 2 * ln - q
    ri = hue2rgb(p, q, hn + 1 / 3)
    gi = hue2rgb(p, q, hn)
    bi = hue2rgb(p, q, hn - 1 / 3)
  }
  return [Math.round(ri * 255), Math.round(gi * 255), Math.round(bi * 255)]
}

const run = debounce(() => parse(), 120)
useRealtime(run, { watch: input })

parse()
</script>

<template>
  <div class="color-app">
    <section class="card">
      <div class="card-title">颜色输入</div>
      <input
        v-model="input"
        class="inp"
        placeholder="输入 HEX / RGB / HSL，如 #3498db、rgb(52,152,219)、hsl(204,70%,53%)"
        spellcheck="false"
      />
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else class="hint">支持大小写、空格与简写，自动互转并预览。</p>
    </section>

    <div class="grid">
      <section class="card preview-card">
        <div class="card-title">预览</div>
        <div class="swatch" :style="{ background: hexStr }"></div>
        <p class="mono swatch-hex">{{ hexStr }}</p>
      </section>

      <section class="card">
        <div class="card-title">格式转换</div>
        <div
          class="fmt"
          v-for="f in [
            { label: 'HEX', val: hexStr },
            { label: 'RGB', val: rgbStr },
            { label: 'HSL', val: hslStr },
          ]"
          :key="f.label"
        >
          <div class="fmt-head">
            <span class="k">{{ f.label }}</span>
            <CopyButton :text="f.val" variant="mini" :disabled="!f.val" :toast="showToast" :success-text="`已复制${f.label}`" />
          </div>
          <code class="mono fmt-val">{{ f.val }}</code>
        </div>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.color-app {
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
.inp {
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
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
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
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1rem;
}
.preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.swatch {
  width: 100%;
  flex: 1;
  min-height: 140px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
}
.swatch-hex {
  margin: 0.6rem 0 0;
  font-size: 0.95rem;
  color: var(--text-primary);
}
.fmt {
  margin-bottom: 0.8rem;
}
.fmt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.3rem;
}
.k {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.fmt-val {
  display: block;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.88rem;
  color: var(--text-body);
  word-break: break-all;
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
@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
