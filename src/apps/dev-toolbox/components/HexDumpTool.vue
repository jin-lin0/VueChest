<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { copyToClipboard, debounce, downloadFile } from '@/utils'
import { Toast } from '@/components'

defineOptions({ name: 'HexDumpTool' })

// dir: 正向转储(dump) / 反向还原(restore)
const dir = ref<'dump' | 'restore'>('dump')
const input = ref('')
const output = ref('')
const error = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const COLS = 16

function toHexDump(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const lines: string[] = []
  for (let i = 0; i < bytes.length; i += COLS) {
    const slice = bytes.subarray(i, i + COLS)
    const offset = i.toString(16).padStart(8, '0')
    const hex: string[] = []
    for (let j = 0; j < COLS; j++) {
      hex.push(j < slice.length ? slice[j].toString(16).padStart(2, '0') : '  ')
    }
    const left = hex.slice(0, 8).join(' ')
    const right = hex.slice(8).join(' ')
    let ascii = ''
    for (let j = 0; j < slice.length; j++) {
      const b = slice[j]
      ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'
    }
    lines.push(`${offset}  ${left}  ${right}  |${ascii}|`)
  }
  return lines.join('\n')
}

function fromHexDump(text: string): string {
  // 1) 去掉 hexdump 的 |ascii| 栏
  let cleaned = text.replace(/\|[^\n|]*\|/g, ' ')
  // 2) 去掉每行开头的 8 位偏移（hexdump -C 风格）
  cleaned = cleaned.replace(/^[0-9a-fA-F]{8}\s{2,}/gm, '')
  // 3) 抽取所有 2 位十六进制字节（兼容空格/换行/0x 前缀/纯十六进制串）
  const tokens = cleaned.match(/0x[0-9a-fA-F]{1,2}|[0-9a-fA-F]{2}/g)
  if (!tokens) return ''
  const bytes = Uint8Array.from(tokens, (t) => parseInt(t.replace(/^0x/, ''), 16))
  return new TextDecoder().decode(bytes)
}

const run = debounce(() => {
  error.value = ''
  if (!input.value) {
    output.value = ''
    return
  }
  try {
    output.value = dir.value === 'dump' ? toHexDump(input.value) : fromHexDump(input.value)
  } catch (e) {
    output.value = ''
    error.value =
      (dir.value === 'dump' ? '转储失败：' : '还原失败：') +
      (e instanceof Error ? e.message : '输入无法处理')
    showToast('error', error.value)
  }
}, 120)

useRealtime(run, { watch: [input, dir] })

async function copy() {
  if (!output.value) return
  await copyToClipboard(output.value)
  showToast('success', '已复制结果')
}
function download() {
  if (!output.value) return
  const name = dir.value === 'dump' ? 'hexdump.txt' : 'restored.bin'
  downloadFile(output.value, name, dir.value === 'dump' ? 'text/plain' : 'application/octet-stream')
  showToast('success', `已下载 ${name}`)
}
function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="hexdump-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'dump' }" @click="dir = 'dump'">十六进制转储</button>
        <button :class="{ active: dir === 'restore' }" @click="dir = 'restore'">还原文本</button>
      </div>
      <div class="tb-group push-right">
        <button class="btn" :disabled="!output" @click="copy">📋 复制</button>
        <button class="btn" :disabled="!output" @click="download">⬇ 下载</button>
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <p class="hint">
      <template v-if="dir === 'dump'">
        正向：按 16 字节/行输出「偏移 / 十六进制 / ASCII」三栏（参考 <code>hello</code> →
        <code>68 65 6c 6c 6f</code>）。
      </template>
      <template v-else>
        反向：粘贴十六进制文本（可含空格、换行或 <code>|ascii|</code> 栏）还原为原文本。
      </template>
    </p>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'dump' ? '原始文本' : '十六进制文本' }}</span>
        </div>
        <textarea
          v-model="input"
          class="plain"
          :placeholder="dir === 'dump' ? '输入要转储的文本…' : '粘贴十六进制，如 68 65 6c 6c 6f'"
          spellcheck="false"
        ></textarea>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ dir === 'dump' ? 'Hex Dump' : '还原结果' }}</span>
        </div>
        <textarea
          v-model="output"
          class="plain mono-out"
          readonly
          placeholder="结果将显示在此"
        ></textarea>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.hexdump-app {
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
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: center;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.seg button {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: none;
  padding: 0.5rem 1.1rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: var(--transition-fast);
}
.seg button.active {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  font-weight: 600;
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
  font-size: 0.85rem;
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
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.hint code {
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--bg-subtle);
  padding: 0.05rem 0.35rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.1rem 1.15rem;
  min-height: 0;
}
.card-head {
  margin-bottom: 0.7rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border-light);
}
.card-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.95rem;
}
.plain {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-body);
  padding: 12px 14px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  transition: var(--transition-fast);
}
.mono-out {
  white-space: pre;
  overflow: auto;
}
.plain:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}
.err {
  margin: 0.6rem 0 0;
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
}

@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
