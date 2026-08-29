<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce } from '@/utils/common'
import { CopyButton } from '@/components'
import { useToast } from '@/composables/useToast'

defineOptions({ name: 'UnicodeTool' })

const input = ref('')
const codePointInput = ref('')
const reverseChar = ref('')
const reverseUHex = ref('')
const error = ref('')

const { addToast } = useToast()

// 控制字符显示可读字形
function displayGlyph(ch: string, cp: number): string {
  if (cp === 0x20) return '␠ (空格)'
  if (cp === 0x09) return '␉ (Tab)'
  if (cp === 0x0a) return '␊ (LF)'
  if (cp === 0x0d) return '␍ (CR)'
  if (cp < 0x20 || cp === 0x7f) return `␛ U+${cp.toString(16).toUpperCase().padStart(2, '0')}`
  return ch
}

interface CharInfo {
  glyph: string
  char: string
  codePoint: number
  uHex: string
  utf8: string
}

const chars = computed<CharInfo[]>(() => {
  const list: CharInfo[] = []
  // 用 for...of 遍历，自动按码点切分（正确处理代理对）
  for (const ch of input.value) {
    const cp = ch.codePointAt(0)!
    const bytes = new TextEncoder().encode(ch)
    list.push({
      glyph: displayGlyph(ch, cp),
      char: ch,
      codePoint: cp,
      uHex: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
      utf8: Array.from(bytes)
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' '),
    })
  }
  return list
})

// 供复制的纯文本表
const tableText = computed(() =>
  chars.value.map((c) => `${c.glyph}\t${c.uHex}\t${c.utf8}`).join('\n'),
)

const runReverse = debounce(() => {
  error.value = ''
  reverseChar.value = ''
  const raw = codePointInput.value.trim()
  if (!raw) return
  const hex = raw.replace(/^(U\+|u\+|0x)/i, '').trim()
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    error.value = '不是合法的码点：仅支持十六进制（如 4E2D 或 U+4E2D）'
    addToast('error', error.value)
    return
  }
  const n = parseInt(hex, 16)
  if (Number.isNaN(n) || n < 0 || n > 0x10ffff) {
    error.value = '码点超出合法范围（U+0000 ~ U+10FFFF）'
    addToast('error', error.value)
    return
  }
  reverseChar.value = String.fromCodePoint(n)
  reverseUHex.value = 'U+' + n.toString(16).toUpperCase().padStart(4, '0')
}, 150)

useRealtime(runReverse, { watch: codePointInput })

function clearAll() {
  input.value = ''
  codePointInput.value = ''
  reverseChar.value = ''
  reverseUHex.value = ''
  error.value = ''
}
</script>

<template>
  <div class="uni-app">
    <div class="toolbar">
      <span class="hint"
        >逐字符查看「字符 / 码点 (U+XXXX) / UTF-8 字节」，并可反向由码点查字符。</span
      >
      <div class="tb-group push-right">
        <CopyButton
          :text="tableText"
          variant="btn"
          success-text="已复制字符列表"
          :toast="addToast"
        />
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">输入文本</span>
        <span class="hint" v-if="chars.length">共 {{ chars.length }} 个字符</span>
      </div>
      <textarea
        v-model="input"
        class="plain"
        placeholder="输入一段文本，下方即时列出每个字符的码点与 UTF-8 字节…"
        spellcheck="false"
      ></textarea>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">字符详情</span>
      </div>
      <div class="table-wrap">
        <table v-if="chars.length" class="uni-table">
          <thead>
            <tr>
              <th>字符</th>
              <th>码点</th>
              <th>UTF-8（十六进制）</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in chars" :key="i">
              <td class="mono glyph">{{ c.glyph }}</td>
              <td class="mono">{{ c.uHex }}</td>
              <td class="mono">{{ c.utf8 }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="hint">结果将显示在此。</p>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">码点 → 字符</span>
      </div>
      <div class="row">
        <input
          v-model="codePointInput"
          class="inp"
          placeholder="输入码点，如 4E2D 或 U+4E2D"
          spellcheck="false"
        />
        <CopyButton :text="reverseChar" variant="btn" success-text="已复制字符" :toast="addToast" />
      </div>
      <div class="result" v-if="reverseChar">
        <span class="big mono">{{ reverseChar }}</span>
        <span class="k">= {{ reverseUHex }}</span>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
    </section>
  </div>
</template>

<style scoped>
.uni-app {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1.5rem 1rem 1.5rem;
  color: var(--text-body);
  gap: 1rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: center;
}
.hint {
  color: var(--text-muted);
  font-size: var(--font-size-small);
}
.tb-group {
  display: flex;
  gap: 0.4rem;
}
.tb-group.push-right {
  margin-left: auto;
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
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
}
.card-head {
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}
.plain {
  width: 100%;
  min-height: 120px;
  height: 160px;
  resize: vertical;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-body);
  padding: 12px 14px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--font-size-control);
  line-height: 1.6;
  outline: none;
  transition: var(--transition-fast);
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.table-wrap {
  max-height: 340px;
  overflow-y: auto;
}
.uni-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-body);
}
.uni-table th,
.uni-table td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border-light);
  vertical-align: top;
}
.uni-table th {
  position: sticky;
  top: 0;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
}
.uni-table td.glyph {
  font-size: var(--font-size-title-lg);
  color: var(--text-primary);
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.inp {
  flex: 1;
  min-width: 220px;
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: var(--font-size-body);
  outline: none;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.result {
  margin-top: 0.7rem;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.big {
  font-size: var(--font-size-6xl);
  color: var(--accent);
}
.k {
  color: var(--text-muted);
  font-size: var(--font-size-control);
}
.err {
  margin: 0.6rem 0 0;
  color: var(--danger, #ef4444);
  font-size: var(--font-size-control);
}
</style>
