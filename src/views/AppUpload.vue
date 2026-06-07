<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '@/stores/market'

const router = useRouter()
const market = useMarketStore()

const name = ref('')
const icon = ref('')
const description = ref('')
const version = ref('1.0.0')
const category = ref('工具')
const readme = ref('')
const fileContent = ref('')
const uploading = ref(false)
const error = ref('')
const success = ref(false)

const categories = ['工具', '娱乐', '开发', '游戏', '生活', '教育']

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    fileContent.value = reader.result as string
  }
  reader.readAsText(file)
}

async function handleSubmit() {
  if (!name.value || !icon.value || !fileContent.value) {
    error.value = '名称、图标和文件内容不能为空'
    return
  }

  uploading.value = true
  error.value = ''
  try {
    await market.uploadApp({
      name: name.value,
      icon: icon.value,
      description: description.value,
      version: version.value,
      category: category.value,
      fileContent: fileContent.value,
      readme: readme.value,
    })
    success.value = true
  } catch (e: any) {
    error.value = e.message || '上传失败'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="upload-container">
    <header class="upload-header">
      <button class="back-btn" @click="router.push('/')">← 返回首页</button>
      <h1>上传应用</h1>
    </header>

    <div v-if="success" class="success-state">
      <span class="success-icon">✅</span>
      <h2>上传成功！</h2>
      <p>应用已发布到市场</p>
      <div class="success-actions">
        <button class="btn primary" @click="router.push('/market')">前往市场</button>
        <button class="btn" @click="success = false; name = ''; icon = ''; description = ''; fileContent = ''">继续上传</button>
      </div>
    </div>

    <form v-else class="upload-form" @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>应用名称 *</label>
        <input v-model="name" type="text" placeholder="例如：计数器" />
      </div>

      <div class="form-group">
        <label>图标 (Emoji) *</label>
        <input v-model="icon" type="text" placeholder="例如：🔢" />
      </div>

      <div class="form-group">
        <label>描述</label>
        <textarea v-model="description" placeholder="简短描述你的应用" rows="3"></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>版本号</label>
          <input v-model="version" type="text" placeholder="1.0.0" />
        </div>
        <div class="form-group">
          <label>分类</label>
          <select v-model="category">
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>JS 包文件 *</label>
        <div class="file-upload">
          <input type="file" accept=".js" @change="handleFileUpload" />
          <span v-if="fileContent" class="file-status">已选择文件 ({{ (fileContent.length / 1024).toFixed(1) }} KB)</span>
        </div>
      </div>

      <div class="form-group">
        <label>说明文档 (Markdown)</label>
        <textarea v-model="readme" placeholder="详细介绍你的应用..." rows="6"></textarea>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>

      <button class="submit-btn" :disabled="uploading">
        {{ uploading ? '上传中...' : '发布到市场' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.upload-container {
  min-height: 100vh;
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem 2rem 1rem;
}

.upload-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.upload-header h1 {
  font-size: 1.6rem;
  font-weight: 800;
  background: linear-gradient(135deg, #2c3e50, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.back-btn {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.8);
  padding: 0.5rem 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #667eea;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.back-btn:hover {
  background: rgba(102, 126, 234, 0.08);
  border-color: rgba(102, 126, 234, 0.3);
}

.upload-form {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.form-group {
  margin-bottom: 1.2rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.4rem;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.file-upload {
  padding: 1rem;
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  text-align: center;
  transition: border-color 0.2s ease;
}

.file-upload:hover {
  border-color: #667eea;
}

.file-upload input {
  margin-bottom: 0.5rem;
}

.file-status {
  font-size: 0.85rem;
  color: #27ae60;
  display: block;
}

.form-error {
  color: #e74c3c;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}

.submit-btn {
  width: 100%;
  padding: 0.8rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-state {
  text-align: center;
  padding: 4rem 2rem;
}

.success-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: 1rem;
}

.success-state h2 {
  font-size: 1.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.success-state p {
  color: #8e99a4;
  margin-bottom: 1.5rem;
}

.success-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.btn {
  padding: 0.7rem 1.5rem;
  border: 1px solid #e0e0e0;
  background: white;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn.primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
}

.btn:hover {
  opacity: 0.9;
}

@media (max-width: 768px) {
  .upload-container {
    padding: 1rem;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
