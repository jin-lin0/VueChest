<script setup lang="ts">
import { ref } from 'vue'
import { useRealtime } from '../composables/useRealtime'
import { debounce, downloadFile } from '@/utils'
import { Toast, CopyButton } from '@/components'
import { gzipSync, gunzipSync } from 'fflate'

defineOptions({ name: 'GzipTool' })

// dir: 压缩(→Base64) / 解压
const dir = ref<'compress' | 'decompress'>('compress')
const input = ref('')
const output = ref('')
const error = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

// 分块拼接二进制串，避免 String.fromCharCode(...bytes) 在大输入时栈溢出
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim())
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const run = debounce(() => {
  error.value = ''
  if (!input.value) {
    output.value = ''
    return
  }
  try {
    if (dir.value === 'compress') {
      const compressed = gzipSync(new TextEncoder().encode(input.value))
      output.value = bytesToBase64(compressed)
    } else {
      const decompressed = gunzipSync(base64ToBytes(input.value))
      output.value = new TextDecoder().decode(decompressed)
    }
  } catch (e) {
    output.value = ''
    error.value =
      (dir.value === 'compress' ? '压缩失败：' : '解压失败：不是合法的 Gzip/Base64 数据') +
      (e instanceof Error ? ' ' + e.message : '')
    showToast('error', error.value)
  }
}, 120)

useRealtime(run, { watch: [input, dir] })

function download() {
  if (!output.value) return
  if (dir.value === 'compress') {
    downloadFile(output.value, 'data.gz.b64', 'text/plain')
  } else {
    downloadFile(output.value, 'decompressed.txt', 'text/plain')
  }
  showToast('success', '已下载结果')
}
function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div class="gzip-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ active: dir === 'compress' }" @click="dir = 'compress'">
          压缩 → Base64
        </button>
        <button :class="{ active: dir === 'decompress' }" @click="dir = 'decompress'">解压</button>
      </div>
      <div class="tb-group push-right">
        <CopyButton :text="output" success-text="已复制结果" :toast="showToast" />
        <button class="btn" :disabled="!output" @click="download">⬇ 下载</button>
        <button class="btn ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <p class="hint">
      <template v-if="dir === 'compress'">
        压缩：文本经 gzip 压缩后输出 Base64 字符串（体积更小的传输格式）。
      </template>
      <template v-else> 解压：粘贴 gzip 压缩得到的 Base64 字符串，还原为原始文本。 </template>
    </p>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <span class="card-title">{{ dir === 'compress' ? '原始文本' : 'Base64 字符串' }}</span>
        </div>
        <textarea
          v-model="input"
          class="plain"
          :placeholder="dir === 'compress' ? '输入要压缩的文本，如 hello' : '粘贴要解压的 Base64…'"
          spellcheck="false"
        ></textarea>
      </section>

      <section class="card output">
        <div class="card-head">
          <span class="card-title">{{ dir === 'compress' ? 'Gzip Base64' : '解压结果' }}</span>
        </div>
        <textarea v-model="output" class="plain" readonly placeholder="结果将显示在此"></textarea>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.gzip-app {
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
