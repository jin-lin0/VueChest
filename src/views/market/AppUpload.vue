<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'
import { extractMetaFromBundle } from '@/lib/app-loader'
import { CustomSelect, type SelectOption } from '@/components'
import type { MarketAppMeta } from '@/lib/app-loader'

const router = useRouter()
const market = useMarketStore()

const fileContent = ref('')
const selectedFile = ref<File | null>(null)
const category = ref('工具')
const readme = ref('')
const uploading = ref(false)
const error = ref('')
const success = ref(false)
const dragOver = ref(false)

const parsedMeta = ref<MarketAppMeta | null>(null)
const parseFailed = ref(false)
const fileInput = ref<HTMLInputElement>()

const categoryOptions: SelectOption[] = [
  { value: '工具', label: '工具' },
  { value: '娱乐', label: '娱乐' },
  { value: '开发', label: '开发' },
  { value: '游戏', label: '游戏' },
  { value: '生活', label: '生活' },
  { value: '教育', label: '教育' },
]

function resetForm() {
  success.value = false
  fileContent.value = ''
  selectedFile.value = null
  parsedMeta.value = null
  parseFailed.value = false
  readme.value = ''
  error.value = ''
}

function changeFile() {
  fileContent.value = ''
  selectedFile.value = null
  parsedMeta.value = null
  parseFailed.value = false
  error.value = ''
  fileInput.value?.click()
}

function processFile(file: File) {
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    error.value = '应用包不能超过 10MB'
    return
  }
  selectedFile.value = file
  parseFailed.value = false
  parsedMeta.value = null
  error.value = ''

  const reader = new FileReader()
  reader.onload = () => {
    const code = reader.result as string
    fileContent.value = code

    const meta = extractMetaFromBundle(code)
    if (meta) {
      parsedMeta.value = meta
    } else {
      parseFailed.value = true
      error.value = '无法解析应用包，请确认文件是有效的市场应用'
    }
  }
  reader.readAsText(file)
}

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) processFile(file)
}

function handleDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function triggerFileInput() {
  if (!fileContent.value || parseFailed.value) {
    fileInput.value?.click()
  }
}

async function handleSubmit() {
  if (!selectedFile.value || !parsedMeta.value) {
    error.value = '请选择有效的应用包文件'
    return
  }

  uploading.value = true
  error.value = ''
  try {
    await market.uploadApp({
      name: parsedMeta.value.name,
      icon: parsedMeta.value.icon,
      description: parsedMeta.value.description || '',
      version: parsedMeta.value.version || '1.0.0',
      category: category.value,
      file: selectedFile.value,
      readme: readme.value,
    })
    success.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="upload-page">
    <div class="upload-container">
      <div class="upload-header">
        <div class="header-left">
          <button class="back-btn" @click="router.push('/')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            返回
          </button>
        </div>
        <div class="header-center">
          <h1>发布应用到市场</h1>
          <p>上传你的应用包，分享给所有用户</p>
        </div>
        <div class="header-right" />
      </div>

      <div v-if="success" class="success-state">
        <div class="success-icon-wrap">
          <span class="success-icon">✅</span>
        </div>
        <h2>发布成功！</h2>
        <p class="success-desc">{{ parsedMeta?.name }} 已提交，等待管理员审核</p>
        <div class="success-actions">
          <button class="btn btn-primary" @click="router.push('/market')">前往市场</button>
          <button class="btn btn-ghost" @click="resetForm">继续上传</button>
        </div>
      </div>

      <form v-else class="upload-form" @submit.prevent="handleSubmit">
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📦</span>
            <span>应用包</span>
          </div>

          <div
            class="file-zone"
            :class="{ 'file-zone-filled': fileContent && !parseFailed, 'file-zone-error': parseFailed }"
            @click="triggerFileInput"
            @dragenter.prevent="dragOver = true"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="handleDrop"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".js"
              class="file-input-hidden"
              @change="handleFileUpload"
            />

            <template v-if="!fileContent && !parseFailed">
              <div class="file-icon-wrap">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <p class="file-zone-text">
                <span class="file-zone-link">点击选择</span> 或将 .js 文件拖拽到这里
              </p>
              <p class="file-zone-hint">由 Vite 构建的 IIFE 格式市场应用包</p>
            </template>

            <template v-else-if="fileContent && !parseFailed">
              <div class="file-selected">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span class="file-name">app.js</span>
                <span class="file-size">{{ (fileContent.length / 1024).toFixed(1) }} KB</span>
                <button type="button" class="file-change" @click.stop="changeFile">更换</button>
              </div>
            </template>

            <template v-else>
              <div class="file-icon-wrap">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <p class="file-zone-text file-error-text">解析失败，请确认文件是有效的市场应用</p>
              <button type="button" class="file-change" @click.stop="changeFile">重新选择</button>
            </template>
          </div>
        </div>

        <transition name="slide">
          <div v-if="parsedMeta" class="form-section">
            <div class="section-title">
              <span class="section-icon">ℹ️</span>
              <span>应用信息</span>
            </div>
            <div class="meta-card">
              <div class="meta-icon">{{ parsedMeta.icon }}</div>
              <div class="meta-body">
                <div class="meta-name">
                  {{ parsedMeta.name }}
                  <span v-if="parsedMeta.version" class="meta-version">v{{ parsedMeta.version }}</span>
                </div>
                <div v-if="parsedMeta.description" class="meta-desc">{{ parsedMeta.description }}</div>
              </div>
            </div>
          </div>
        </transition>

        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">⚙️</span>
            <span>市场配置</span>
          </div>

          <div class="form-group">
            <label class="form-label">分类</label>
            <CustomSelect v-model="category" :options="categoryOptions" />
          </div>

          <div class="form-group">
            <label class="form-label">说明文档 <span class="label-optional">选填</span></label>
            <textarea
              v-model="readme"
              class="form-textarea"
              placeholder="使用 Markdown 格式编写应用说明..."
              rows="6"
            ></textarea>
          </div>
        </div>

        <transition name="fade">
          <p v-if="error" class="form-error">{{ error }}</p>
        </transition>

        <button class="submit-btn" :disabled="uploading || !parsedMeta">
          <span v-if="uploading" class="btn-spinner" />
          {{ uploading ? '发布中...' : '发布到市场' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.upload-page {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--bg-page) 0%, var(--bg-subtle) 100%);
  display: flex;
  justify-content: center;
  padding: 40px 24px;
}

.upload-container {
  width: 100%;
  max-width: 640px;
}

/* Header */
.upload-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.header-left,
.header-right {
  flex: 1;
}

.header-center {
  text-align: center;
}

.header-center h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.header-center p {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--bg-hover);
  border-color: var(--text-muted);
  transform: translateY(-1px);
}

/* Form card */
.upload-form {
  background: var(--bg-card);
  border-radius: 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  padding: 32px;
}

.form-section {
  margin-bottom: 28px;
}

.form-section:last-of-type {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}

.section-icon {
  font-size: 18px;
}

/* File upload zone */
.file-zone {
  border: 2px dashed var(--border);
  border-radius: 14px;
  padding: 40px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s;
  background: var(--bg-subtle);
}

.file-zone:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.file-zone-filled {
  border-color: var(--success);
  background: var(--success-bg);
  cursor: default;
  padding: 20px 24px;
}

.file-zone-error {
  border-color: var(--danger);
  background: var(--danger-bg);
}

.file-input-hidden {
  display: none;
}

.file-icon-wrap {
  margin-bottom: 12px;
}

.file-zone-text {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--text-secondary);
}

.file-error-text {
  color: var(--danger);
}

.file-zone-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.file-zone-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

/* File selected state */
.file-selected {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-name {
  font-weight: 600;
  color: var(--success);
  font-size: 14px;
}

.file-size {
  color: var(--text-secondary);
  font-size: 13px;
  font-family: monospace;
}

.file-change {
  margin-left: auto;
  padding: 6px 14px;
  border: 1px solid var(--success);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--success);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.file-change:hover {
  background: var(--success);
  color: white;
}

/* Meta card */
.meta-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--accent-bg) 0%, var(--accent-light) 100%);
  border: 1px solid var(--accent-light);
  border-radius: 14px;
}

.meta-icon {
  font-size: 38px;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.meta-body {
  flex: 1;
  min-width: 0;
}

.meta-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-version {
  font-size: 12px;
  color: var(--accent);
  background: var(--bg-card);
  padding: 2px 10px;
  border-radius: 6px;
  font-family: monospace;
  font-weight: 500;
}

.meta-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

/* Form controls */
.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-body);
  margin-bottom: 6px;
}

.label-optional {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 12px;
}

.form-textarea {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: all 0.2s;
  background: var(--bg-card);
  box-sizing: border-box;
  line-height: 1.5;
  color: var(--text-body);
}

.form-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

.form-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  border-radius: 10px;
  color: var(--danger);
  font-size: 14px;
  margin: 0 0 20px;
}

/* Submit button */
.submit-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-brand-lg);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Success state */
.success-state {
  text-align: center;
  padding: 60px 32px;
  background: var(--bg-card);
  border-radius: 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.success-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--success-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  animation: success-bounce 0.5s ease;
}

@keyframes success-bounce {
  0% { transform: scale(0); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.success-icon {
  font-size: 36px;
}

.success-state h2 {
  margin: 0 0 8px;
  font-size: 24px;
  color: var(--text-primary);
}

.success-desc {
  margin: 0 0 28px;
  color: var(--text-secondary);
  font-size: 15px;
}

.success-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: var(--gradient-primary);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-brand-md);
}

.btn-ghost {
  background: var(--bg-subtle);
  color: var(--text-body);
  border: 1px solid var(--border);
}

.btn-ghost:hover {
  background: var(--bg-hover);
  transform: translateY(-1px);
}

/* Transitions */
.slide-enter-active {
  transition: all 0.3s ease;
}

.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.fade-enter-active {
  transition: all 0.25s ease;
}

.fade-leave-active {
  transition: all 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .upload-page {
    padding: 20px 16px;
  }

  .upload-form {
    padding: 24px 20px;
  }

  .file-zone {
    padding: 28px 16px;
  }

  .upload-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .header-center {
    text-align: left;
  }

  .header-right {
    display: none;
  }
}
</style>
