<script setup lang="ts">
import { ref, computed } from 'vue'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'GeneratorTool' })

const { addToast } = useToast()

// crypto.getRandomValues 在所有上下文可用；randomUUID / subtle 需安全上下文
const cryptoReady = typeof crypto !== 'undefined' && !!crypto.getRandomValues
const uuidReady = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

/* 无偏随机整数 [0, max) 采用拒绝采样避免取模偏差 */
function randBelow(max: number): number {
  if (max <= 0) return 0
  if (max === 1) return 0
  // 2^32
  const limit = Math.floor(0x100000000 / max) * max
  let x = crypto.getRandomValues(new Uint32Array(1))[0]
  while (x >= limit) x = crypto.getRandomValues(new Uint32Array(1))[0]
  return x % max
}

/* ---------------- UUID ---------------- */
const uuidCount = ref(3)
const uuids = ref<string[]>([])

function genUuid() {
  if (!uuidReady) {
    addToast('error', '当前环境不支持 crypto.randomUUID（需 HTTPS 或 localhost）')
    return
  }
  const n = clamp(uuidCount.value, 1, 100)
  const arr: string[] = []
  for (let i = 0; i < n; i++) arr.push(crypto.randomUUID())
  uuids.value = arr
}

/* ---------------- 随机密码 ---------------- */
const pwLen = ref(16)
const useUpper = ref(true)
const useLower = ref(true)
const useDigit = ref(true)
const useSymbol = ref(true)
const password = ref('')

const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.<>?',
}

function buildPool(): string {
  let pool = ''
  if (useUpper.value) pool += CHARSETS.upper
  if (useLower.value) pool += CHARSETS.lower
  if (useDigit.value) pool += CHARSETS.digit
  if (useSymbol.value) pool += CHARSETS.symbol
  return pool
}

const poolSize = computed(() => buildPool().length)

const strength = computed(() => {
  const size = poolSize.value
  if (!size) return { label: '—', cls: '' }
  const entropy = pwLen.value * Math.log2(size)
  if (entropy < 40) return { label: '弱', cls: 'weak' }
  if (entropy < 60) return { label: '中', cls: 'medium' }
  if (entropy < 80) return { label: '强', cls: 'strong' }
  return { label: '极强', cls: 'verystrong' }
})

function genPassword() {
  const pool = buildPool()
  if (!pool) {
    addToast('error', '请至少选择一种字符类型')
    return
  }
  if (!cryptoReady) {
    addToast('error', '当前环境不支持 crypto.getRandomValues')
    return
  }
  const len = clamp(pwLen.value, 4, 64)
  let pwd = ''
  for (let i = 0; i < len; i++) pwd += pool[randBelow(pool.length)]
  password.value = pwd
}

/* ---------------- 随机数 ---------------- */
const rMin = ref(1)
const rMax = ref(100)
const rCount = ref(5)
const randoms = ref<number[]>([])

function genRandoms() {
  if (!cryptoReady) {
    addToast('error', '当前环境不支持 crypto.getRandomValues')
    return
  }
  const min = Math.floor(rMin.value)
  let max = Math.floor(rMax.value)
  const count = clamp(rCount.value, 1, 200)
  if (max < min) max = min
  const range = max - min + 1
  const arr: number[] = []
  for (let i = 0; i < count; i++) arr.push(min + randBelow(range))
  randoms.value = arr
}

/* ---------------- 抽奖 ---------------- */
const candidatesText = ref('')
const winner = ref('')

const candidateList = computed(() =>
  candidatesText.value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
)

function draw() {
  const list = candidateList.value
  if (!list.length) {
    addToast('error', '请先输入候选（每行一个）')
    return
  }
  if (!cryptoReady) {
    addToast('error', '当前环境不支持 crypto.getRandomValues')
    return
  }
  winner.value = list[randBelow(list.length)]
}

</script>

<template>
  <div class="gen-app">
    <!-- UUID -->
    <section class="card">
      <div class="card-title">UUID 生成</div>
      <div class="row">
        <label class="k">数量</label>
        <input class="inp num" type="number" min="1" max="100" v-model.number="uuidCount" />
        <button class="btn primary" @click="genUuid">生成</button>
        <CopyButton :text="uuids.join('\n')" variant="btn" success-text="已复制全部" :toast="addToast" />
      </div>
      <ul v-if="uuids.length" class="list">
        <li v-for="(u, i) in uuids" :key="i" class="list-item">
          <code class="mono">{{ u }}</code>
          <CopyButton :text="u" variant="mini" :toast="addToast" />
        </li>
      </ul>
      <p v-else class="hint">点击「生成」创建随机 UUID（crypto.randomUUID）。</p>
    </section>

    <!-- 随机密码 -->
    <section class="card">
      <div class="card-title">随机密码</div>
      <div class="row">
        <label class="k">长度</label>
        <input class="inp num" type="number" min="4" max="64" v-model.number="pwLen" />
        <input class="slider" type="range" min="4" max="64" v-model.number="pwLen" />
        <span class="v">{{ pwLen }}</span>
      </div>
      <div class="row opts">
        <label class="chk"><input type="checkbox" v-model="useUpper" /><span>大写</span></label>
        <label class="chk"><input type="checkbox" v-model="useLower" /><span>小写</span></label>
        <label class="chk"><input type="checkbox" v-model="useDigit" /><span>数字</span></label>
        <label class="chk"><input type="checkbox" v-model="useSymbol" /><span>符号</span></label>
        <button class="btn primary" @click="genPassword">生成</button>
        <CopyButton :text="password" variant="btn" :toast="addToast" />
      </div>
      <div v-if="password" class="pw-row">
        <code class="mono pw-value">{{ password }}</code>
        <span class="strength" :class="strength.cls">强度：{{ strength.label }}</span>
      </div>
      <p v-else class="hint">选择字符集后生成无偏随机密码。</p>
    </section>

    <!-- 随机数 -->
    <section class="card">
      <div class="card-title">随机整数</div>
      <div class="row">
        <label class="k">范围</label>
        <input class="inp num" type="number" v-model.number="rMin" />
        <span class="k">~</span>
        <input class="inp num" type="number" v-model.number="rMax" />
        <label class="k">个数</label>
        <input class="inp num" type="number" min="1" max="200" v-model.number="rCount" />
        <button class="btn primary" @click="genRandoms">生成</button>
        <CopyButton :text="randoms.map(String).join('\n')" variant="btn" success-text="已复制全部" :toast="addToast" />
      </div>
      <ul v-if="randoms.length" class="list inline">
        <li v-for="(n, i) in randoms" :key="i" class="list-item">
          <code class="mono">{{ n }}</code>
          <CopyButton :text="String(n)" variant="mini" :toast="addToast" />
        </li>
      </ul>
      <p v-else class="hint">使用 crypto.getRandomValues + 拒绝采样，生成无偏随机整数。</p>
    </section>

    <!-- 抽奖 -->
    <section class="card">
      <div class="card-title">抽奖</div>
      <textarea
        v-model="candidatesText"
        class="plain"
        rows="5"
        placeholder="每行一个候选，例如：&#10;张三&#10;李四&#10;王五"
        spellcheck="false"
      ></textarea>
      <div class="row" style="margin-top: 0.6rem">
        <button class="btn primary" @click="draw">抽一个</button>
        <CopyButton :text="winner" variant="btn" label="复制结果" :toast="addToast" />
        <span class="k">共 {{ candidateList.length }} 个候选</span>
      </div>
      <div v-if="winner" class="winner">🎉 {{ winner }}</div>
      <p v-else class="hint">输入候选后点击「抽一个」，随机抽取并高亮一个。</p>
    </section>
  </div>
</template>

<style scoped>
.gen-app {
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
  font-size: var(--font-size-title);
  margin-bottom: 0.7rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.opts {
  margin-top: 0.6rem;
}
.num {
  width: 84px;
}
.inp {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: var(--font-size-body);
  outline: none;
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.slider {
  width: 160px;
  accent-color: var(--accent);
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--font-size-control);
  color: var(--text-secondary);
  cursor: pointer;
}
.chk input {
  accent-color: var(--accent);
}
.k {
  color: var(--text-muted);
  font-size: var(--font-size-control);
}
.v {
  font-size: var(--font-size-body);
  color: var(--text-body);
}
.btn {
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-body);
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
  font-size: var(--font-size-small);
  cursor: pointer;
  white-space: nowrap;
}
.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.list {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.list.inline {
  flex-direction: row;
  flex-wrap: wrap;
}
.list-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.35rem 0.55rem;
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--font-size-body);
  color: var(--text-body);
  word-break: break-all;
}
.plain {
  width: 100%;
  resize: vertical;
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.7rem;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--font-size-body);
  outline: none;
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.pw-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 0.7rem;
  flex-wrap: wrap;
}
.pw-value {
  flex: 1;
  min-width: 0;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.5rem 0.6rem;
  font-size: var(--font-size-body-lg);
}
.strength {
  font-size: var(--font-size-control);
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-xs);
  font-weight: 600;
}
.strength.weak {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
.strength.medium {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}
.strength.strong {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
}
.strength.verystrong {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}
.winner {
  margin-top: 0.8rem;
  text-align: center;
  font-size: var(--font-size-heading);
  font-weight: 700;
  color: var(--accent);
  padding: 0.8rem;
  background: var(--bg-input);
  border: 1px dashed var(--accent);
  border-radius: var(--radius-sm);
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-control);
  margin: 0.6rem 0 0;
  line-height: 1.5;
}
</style>
