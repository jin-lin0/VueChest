<script setup lang="ts">
import { ref } from 'vue'
import { Toast, CopyButton } from '@/components'
import { useFileDrop } from '../composables/useFileDrop'

defineOptions({ name: 'ImageBase64Tool' })

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const previewUrl = ref('')
const dataUrl = ref('')
const fileName = ref('')
const fileSize = ref(0)
const error = ref('')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function loadFile(file: File) {
  error.value = ''
  fileName.value = file.name
  fileSize.value = file.size
  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result
    if (typeof result === 'string') {
      dataUrl.value = result
      previewUrl.value = result
    } else {
      error.value = '读取文件失败：结果非字符串'
      showToast('error', error.value)
    }
  }
  reader.onerror = () => {
    error.value = '读取文件失败'
    showToast('error', error.value)
  }
  reader.readAsDataURL(file)
}

const { dragging, inputRef, onFile, onDragOver, onDragLeave, onDrop, openPicker } = useFileDrop({
  accept: 'image/*',
  onLoad: loadFile,
  onError: (m) => showToast('error', m),
})

</script>

<template>
  <div class="image-base64-app">
    <section class="card">
      <div class="card-title">本地图片 → DataURL / Base64</div>
      <input
        ref="inputRef"
        type="file"
        accept="image/*"
        class="hidden-input"
        @change="onFile"
      />
      <div
        class="drop"
        :class="{ dragging }"
        role="button"
        tabindex="0"
        @click="openPicker"
        @keydown.enter.prevent="openPicker"
        @keydown.space.prevent="openPicker"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <span>点击选择图片，或拖入图片文件</span>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="fileName" class="hint">
        已选择：<code class="mono">{{ fileName }}</code> · 大小 {{ formatSize(fileSize) }}
      </p>
      <p v-else class="hint">选择本地图片后，自动生成 DataURL 与 Base64 编码。</p>
    </section>

    <div class="grid" v-if="dataUrl">
      <section class="card preview-card">
        <div class="card-title">预览</div>
        <img class="preview" :src="previewUrl" alt="预览" />
      </section>

      <section class="card">
        <div class="card-title">DataURL</div>
        <textarea class="mono out" readonly :value="dataUrl" spellcheck="false"></textarea>
        <div class="actions">
          <CopyButton :text="dataUrl" variant="mini" success-text="已复制 DataURL" :toast="showToast" />
          <CopyButton
            :text="dataUrl.indexOf(',') >= 0 ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl"
            variant="mini"
            success-text="已复制 Base64"
            :toast="showToast"
          />
        </div>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.image-base64-app {
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
.hidden-input {
  display: none;
}
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-lg);
  padding: 1.6rem 1rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast);
}
.drop:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.drop:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.drop.dragging {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-input);
}
.hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.6rem 0 0;
}
.err {
  color: var(--danger, #ef4444);
  font-size: 0.8rem;
  margin: 0.6rem 0 0;
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
.preview {
  max-width: 100%;
  max-height: 360px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  object-fit: contain;
}
.out {
  width: 100%;
  min-height: 200px;
  resize: vertical;
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.7rem;
  font-size: 0.8rem;
  line-height: 1.4;
  outline: none;
  word-break: break-all;
}
.actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.8rem;
}
.mini {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs);
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
}
.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
