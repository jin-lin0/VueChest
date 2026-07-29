<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { rgbToHex } from '@/utils'
import { Toast, CopyButton } from '@/components'
import { useFileDrop } from '../composables/useFileDrop'

defineOptions({ name: 'PaletteTool' })

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

interface ColorEntry {
  hex: string
  rgb: [number, number, number]
  count: number
}

const previewUrl = ref('')
const allColors = ref<ColorEntry[]>([])
const colorCount = ref(6)
const error = ref('')
const fileName = ref('')

// 跟踪当前 object URL，仅在切换文件 / 卸载时吊销，避免提前吊销导致预览图加载失败
let currentUrl = ''

const displayColors = computed(() =>
  allColors.value.slice(0, Math.max(1, Math.min(20, colorCount.value))),
)

// 将单个通道量化到最近的 0x10（16 的倍数），用于色块聚合计数
function quantize(v: number): number {
  return Math.round(v / 16) * 16
}

function loadImage(file: File) {
  error.value = ''
  allColors.value = []
  fileName.value = file.name
  // 切换文件时先吊销上一张的 URL，再创建新的
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  const url = URL.createObjectURL(file)
  currentUrl = url
  previewUrl.value = url
  const img = new Image()
  img.onload = () => {
    try {
      extract(img)
    } catch {
      error.value = '提取主色失败'
      showToast('error', error.value)
    }
  }
  img.onerror = () => {
    error.value = '图片加载失败'
    showToast('error', error.value)
  }
  img.src = url
}

const { dragging, inputRef, onFile, onDragOver, onDragLeave, onDrop, openPicker } = useFileDrop({
  accept: 'image/*',
  onLoad: loadImage,
  onError: (m) => showToast('error', m),
})

onBeforeUnmount(() => {
  if (currentUrl) URL.revokeObjectURL(currentUrl)
})

function extract(img: HTMLImageElement) {
  // 限制采样分辨率，兼顾性能
  const maxDim = 200
  let w = img.naturalWidth
  let h = img.naturalHeight
  const scale = Math.min(1, maxDim / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    error.value = '无法创建画布上下文'
    showToast('error', error.value)
    return
  }
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  // key: 量化后的 "r,g,b" → 累计计数与原始通道和（用于取平均代表色）
  const counts = new Map<
    string,
    { r: number; g: number; b: number; count: number; rs: number; gs: number; bs: number }
  >()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue // 跳过透明像素
    const r = quantize(data[i])
    const g = quantize(data[i + 1])
    const b = quantize(data[i + 2])
    const key = `${r},${g},${b}`
    const entry = counts.get(key)
    if (entry) {
      entry.count++
      entry.rs += data[i]
      entry.gs += data[i + 1]
      entry.bs += data[i + 2]
    } else {
      counts.set(key, { r, g, b, count: 1, rs: data[i], gs: data[i + 1], bs: data[i + 2] })
    }
  }

  const arr = Array.from(counts.values()).sort((a, b) => b.count - a.count)
  allColors.value = arr.map((c) => {
    const rgb: [number, number, number] = [
      Math.round(c.rs / c.count),
      Math.round(c.gs / c.count),
      Math.round(c.bs / c.count),
    ]
    return { hex: rgbToHex(rgb[0], rgb[1], rgb[2]), rgb, count: c.count }
  })

  if (allColors.value.length === 0) {
    error.value = '未提取到颜色（图片可能全透明）'
    showToast('info', error.value)
  }
}

</script>

<template>
  <div class="palette-app">
    <section class="card">
      <div class="card-title">从图片提取主色调</div>
      <input ref="inputRef" type="file" accept="image/*" class="hidden-input" @change="onFile" />
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
      <div class="opt">
        <label class="opt-label">主色数量</label>
        <input class="num" type="number" min="1" max="20" v-model.number="colorCount" />
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="fileName" class="hint">
        已选择：<code class="mono">{{ fileName }}</code>
      </p>
      <p v-else class="hint">加载图片后，自动量化像素并统计前 N 个主色。</p>
    </section>

    <div class="grid" v-if="displayColors.length">
      <section class="card preview-card">
        <div class="card-title">预览</div>
        <img class="preview" :src="previewUrl" alt="预览" />
      </section>

      <section class="card">
        <div class="card-title">主色调（点击复制 hex）</div>
        <ul class="palette">
          <li v-for="c in displayColors" :key="c.hex" class="swatch-row">
            <span class="swatch" :style="{ background: c.hex }"></span>
            <span class="mono hex">{{ c.hex }}</span>
            <span class="mono rgb">rgb({{ c.rgb[0] }}, {{ c.rgb[1] }}, {{ c.rgb[2] }})</span>
            <span class="mono cnt">×{{ c.count }}</span>
            <CopyButton :text="c.hex" variant="mini" :toast="showToast" :success-text="`已复制 ${c.hex}`" />
          </li>
        </ul>
      </section>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.palette-app {
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
.opt {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.9rem;
}
.opt-label {
  color: var(--text-muted);
  font-size: 0.82rem;
}
.num {
  width: 90px;
  background: var(--bg-input);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.55rem;
  font-size: 0.85rem;
  outline: none;
}
.num:focus {
  border-color: var(--accent);
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
.palette {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.swatch-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.swatch-row:hover {
  border-color: var(--accent);
}
.swatch {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-light);
  flex: none;
}
.hex {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 600;
}
.rgb {
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.cnt {
  font-size: 0.74rem;
  color: var(--text-muted);
  margin-left: auto;
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
