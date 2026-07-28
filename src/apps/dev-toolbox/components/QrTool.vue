<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import { copyToClipboard, debounce } from '@/utils'
import { Toast } from '@/components'
import { useRealtime } from '../composables/useRealtime'

defineOptions({ name: 'QrTool' })

const input = ref('https://www.example.com')
const dataUrl = ref('')
const error = ref('')

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function generate() {
  error.value = ''
  const text = input.value
  if (!text) {
    dataUrl.value = ''
    return
  }
  QRCode.toDataURL(text)
    .then((url) => {
      dataUrl.value = url
    })
    .catch(() => {
      dataUrl.value = ''
      error.value = '二维码生成失败，内容可能过长或包含无法编码的字符'
      showToast('error', error.value)
    })
}

const run = debounce(() => generate(), 200)
useRealtime(run, { watch: input })

async function copyDataUrl() {
  if (!dataUrl.value) return
  await copyToClipboard(dataUrl.value)
  showToast('success', '已复制图片 data URL')
}

generate()
</script>

<template>
  <div class="qr-app">
    <section class="card">
      <div class="card-title">文本 / URL</div>
      <textarea
        v-model="input"
        class="plain"
        rows="3"
        placeholder="输入要生成二维码的文本或链接…"
        spellcheck="false"
      ></textarea>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else class="hint">本地生成，无网络请求。</p>
    </section>

    <section class="card qr-card">
      <div class="card-title">二维码预览</div>
      <div class="img-wrap">
        <img v-if="dataUrl" :src="dataUrl" alt="QR Code" class="qr-img" />
        <p v-else class="hint">输入内容后自动生成</p>
      </div>
      <div class="row actions">
        <button class="btn primary" :disabled="!dataUrl" @click="copyDataUrl">
          复制图片 (data URL)
        </button>
        <a v-if="dataUrl" class="btn" :href="dataUrl" download="qrcode.png">下载 PNG</a>
      </div>
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.qr-app {
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
.plain {
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
  outline: none;
  width: 100%;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  resize: vertical;
}
.plain:focus {
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
.qr-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.img-wrap {
  width: 240px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 0.5rem;
}
.qr-img {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.actions {
  margin-top: 1rem;
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
  text-decoration: none;
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
</style>
