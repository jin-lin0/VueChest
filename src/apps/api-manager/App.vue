<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getStorage, setStorage } from '@/lib/storage'
import { defaultApis, type ApiItem } from './defaults'

interface ApiResponse {
  status: number
  statusText: string
  data: unknown
  time: number
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const apis = ref<ApiItem[]>([])
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)
const selectedApi = ref<ApiItem | null>(null)
const paramValues = ref<Record<string, string>>({})
const response = ref<ApiResponse | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

const showAddForm = ref(false)
const editingId = ref<number | null>(null)
const formData = ref<Partial<ApiItem>>({
  name: '',
  url: '',
  method: 'GET',
  category: '',
  description: '',
  params: [],
})

const loadApis = (): ApiItem[] => {
  return getStorage<ApiItem[]>('apis', defaultApis) || defaultApis
}

const saveApis = () => {
  setStorage('apis', apis.value)
}

onMounted(() => {
  apis.value = loadApis()
})

watch(
  apis,
  () => {
    saveApis()
  },
  { deep: true },
)

const categories = computed(() => {
  const cats = new Set(apis.value.map((a) => a.category).filter(Boolean))
  return Array.from(cats).sort()
})

const filteredApis = computed(() => {
  let result = apis.value

  if (selectedCategory.value) {
    result = result.filter((a) => a.category === selectedCategory.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    )
  }

  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
})

const selectApi = (api: ApiItem) => {
  selectedApi.value = api
  paramValues.value = {}
  api.params.forEach((p) => {
    paramValues.value[p.name] = p.defaultValue
  })
  response.value = null
  error.value = null
}

const buildUrl = (api: ApiItem): string => {
  let url = api.url
  api.params.forEach((param) => {
    const value = paramValues.value[param.name] || param.defaultValue
    url = url.replace(`{${param.name}}`, encodeURIComponent(value))
  })
  return url
}

const executeApi = async () => {
  if (!selectedApi.value) return

  isLoading.value = true
  error.value = null
  response.value = null

  const startTime = Date.now()
  const url = buildUrl(selectedApi.value)

  try {
    const fetchOptions: RequestInit = {
      method: selectedApi.value.method,
      headers: {
        Accept: 'application/json',
      },
    }

    const res = await fetch(url, fetchOptions)
    const endTime = Date.now()

    let data: unknown
    const contentType = res.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      data = await res.json()
    } else {
      const text = await res.text()
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    response.value = {
      status: res.status,
      statusText: res.statusText,
      data,
      time: endTime - startTime,
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '请求失败，请检查网络或API地址'
  } finally {
    isLoading.value = false
  }
}

const formatJson = (data: unknown): string => {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

const getStatusClass = (status: number): string => {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 400 && status < 500) return 'client-error'
  if (status >= 500) return 'server-error'
  return 'info'
}

const showAddFormPanel = () => {
  showAddForm.value = true
  editingId.value = null
  formData.value = {
    name: '',
    url: '',
    method: 'GET',
    category: '',
    description: '',
    params: [],
  }
}

const editApi = (api: ApiItem) => {
  showAddForm.value = true
  editingId.value = api.id
  formData.value = {
    name: api.name,
    url: api.url,
    method: api.method,
    category: api.category,
    description: api.description,
    params: [...api.params],
  }
}

const saveApi = () => {
  if (!formData.value.name || !formData.value.url) return

  if (editingId.value !== null) {
    const index = apis.value.findIndex((a) => a.id === editingId.value)
    if (index !== -1) {
      apis.value[index] = {
        ...apis.value[index],
        name: formData.value.name!,
        url: formData.value.url!,
        method: formData.value.method || 'GET',
        category: formData.value.category || '未分类',
        description: formData.value.description || '',
        params: formData.value.params || [],
      }
    }
  } else {
    apis.value.push({
      id: Date.now(),
      name: formData.value.name!,
      url: formData.value.url!,
      method: formData.value.method || 'GET',
      category: formData.value.category || '未分类',
      description: formData.value.description || '',
      params: formData.value.params || [],
      createdAt: new Date().toISOString(),
    })
  }

  showAddForm.value = false
  editingId.value = null
}

const deleteApi = (id: number) => {
  apis.value = apis.value.filter((a) => a.id !== id)
  if (selectedApi.value?.id === id) {
    selectedApi.value = null
  }
}

const addParam = () => {
  if (!formData.value.params) formData.value.params = []
  formData.value.params.push({
    name: '',
    type: 'string',
    defaultValue: '',
    required: false,
    description: '',
  })
}

const removeParam = (index: number) => {
  if (formData.value.params) {
    formData.value.params.splice(index, 1)
  }
}

const selectCategory = (cat: string) => {
  selectedCategory.value = selectedCategory.value === cat ? null : cat
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>API管理器</h1>
      <button class="add-api-btn" @click="showAddFormPanel">+ 添加API</button>
    </header>

    <main class="api-content">
      <div class="sidebar">
        <div class="search-section">
          <input v-model="searchQuery" type="text" placeholder="搜索API..." class="search-input" />
        </div>

        <div class="category-tags">
          <button
            v-for="cat in categories"
            :key="cat"
            class="tag-btn"
            :class="{ active: selectedCategory === cat }"
            @click="selectCategory(cat)"
          >
            {{ cat }}
          </button>
        </div>

        <div class="api-list">
          <div
            v-for="api in filteredApis"
            :key="api.id"
            class="api-item"
            :class="{ active: selectedApi?.id === api.id }"
            @click="selectApi(api)"
          >
            <div class="api-item-header">
              <span class="api-method" :class="api.method.toLowerCase()">{{ api.method }}</span>
              <span class="api-name">{{ api.name }}</span>
            </div>
            <div class="api-item-meta">
              <span class="api-category">{{ api.category }}</span>
              <div class="api-actions">
                <button class="action-btn edit" @click.stop="editApi(api)">编辑</button>
                <button class="action-btn delete" @click.stop="deleteApi(api.id)">删除</button>
              </div>
            </div>
          </div>

          <div v-if="filteredApis.length === 0" class="empty-state">
            {{ apis.length === 0 ? '还没有API，添加一个吧！' : '没有匹配的API' }}
          </div>
        </div>
      </div>

      <div class="main-panel">
        <template v-if="showAddForm">
          <div class="form-panel">
            <h2>{{ editingId !== null ? '编辑API' : '添加新API' }}</h2>
            <div class="form-group">
              <label>名称</label>
              <input v-model="formData.name" type="text" placeholder="API名称" />
            </div>
            <div class="form-group">
              <label>URL</label>
              <input
                v-model="formData.url"
                type="text"
                placeholder="https://api.example.com/endpoint"
              />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>方法</label>
                <select v-model="formData.method">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div class="form-group">
                <label>分类</label>
                <input
                  v-model="formData.category"
                  type="text"
                  placeholder="分类（如：工具、娱乐）"
                />
              </div>
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea v-model="formData.description" placeholder="API描述" rows="2"></textarea>
            </div>

            <div class="params-section">
              <div class="params-header">
                <label>参数配置</label>
                <button class="add-param-btn" @click="addParam">+ 添加参数</button>
              </div>
              <div v-for="(param, index) in formData.params" :key="index" class="param-item">
                <div class="param-row">
                  <input v-model="param.name" type="text" placeholder="参数名" class="param-name" />
                  <select v-model="param.type" class="param-type">
                    <option value="string">字符串</option>
                    <option value="number">数字</option>
                    <option value="boolean">布尔值</option>
                  </select>
                  <input
                    v-model="param.defaultValue"
                    type="text"
                    placeholder="默认值"
                    class="param-default"
                  />
                  <label class="param-required">
                    <input v-model="param.required" type="checkbox" />
                    <span>必填</span>
                  </label>
                  <button class="remove-param-btn" @click="removeParam(index)">×</button>
                </div>
                <input
                  v-model="param.description"
                  type="text"
                  placeholder="参数描述"
                  class="param-desc"
                />
              </div>
            </div>

            <div class="form-actions">
              <button class="save-btn" @click="saveApi">保存</button>
              <button class="cancel-btn" @click="showAddForm = false">取消</button>
            </div>
          </div>
        </template>

        <template v-else-if="selectedApi">
          <div class="detail-panel">
            <div class="detail-header">
              <h2>{{ selectedApi.name }}</h2>
              <span class="detail-method" :class="selectedApi.method.toLowerCase()">{{
                selectedApi.method
              }}</span>
            </div>
            <p class="detail-description">{{ selectedApi.description }}</p>
            <div class="detail-url">
              <label>请求地址</label>
              <code>{{ buildUrl(selectedApi) }}</code>
            </div>

            <div v-if="selectedApi.params.length > 0" class="params-config">
              <h3>参数配置</h3>
              <div v-for="param in selectedApi.params" :key="param.name" class="param-config-item">
                <div class="param-config-header">
                  <span class="param-config-name">{{ param.name }}</span>
                  <span class="param-config-type">{{ param.type }}</span>
                  <span v-if="param.required" class="param-config-required">必填</span>
                </div>
                <div class="param-config-desc">{{ param.description }}</div>
                <input
                  v-model="paramValues[param.name]"
                  :type="param.type === 'number' ? 'number' : 'text'"
                  :placeholder="param.defaultValue || param.description"
                  class="param-config-input"
                />
              </div>
            </div>

            <button class="execute-btn" :disabled="isLoading" @click="executeApi">
              {{ isLoading ? '执行中...' : '执行请求' }}
            </button>

            <div v-if="error" class="error-panel">
              <h3>请求失败</h3>
              <pre>{{ error }}</pre>
            </div>

            <div v-if="response" class="response-panel">
              <div class="response-header">
                <h3>响应结果</h3>
                <div class="response-meta">
                  <span class="response-status" :class="getStatusClass(response.status)">
                    {{ response.status }} {{ response.statusText }}
                  </span>
                  <span class="response-time">{{ response.time }}ms</span>
                </div>
              </div>
              <pre class="response-data">{{ formatJson(response.data) }}</pre>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="welcome-panel">
            <div class="welcome-icon">🔗</div>
            <h2>欢迎使用API管理器</h2>
            <p>从左侧选择一个API开始测试，或点击"添加API"创建新的API</p>
            <div class="features">
              <div class="feature-item">
                <span class="feature-icon">📋</span>
                <span>管理常用免费API</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">⚙️</span>
                <span>灵活配置请求参数</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">🚀</span>
                <span>在线执行查看结果</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  /* 业务色：#2ecc71/#e74c3c 与 token 的 --success/#dc2626 差异明显，集中为局部变量 */
  --api-success: #2ecc71;
  --api-danger: #e74c3c;
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
}

.back-button {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: var(--text-primary);
  flex: 1;
}

.add-api-btn {
  background-color: var(--api-success);
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.add-api-btn:hover {
  background-color: #27ae60;
}

.api-content {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}

.sidebar {
  width: 320px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-section {
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.search-input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
  box-sizing: border-box;
}

.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #eee;
}

.tag-btn {
  background-color: #f1f1f1;
  border: none;
  padding: 0.3rem 0.7rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-primary);
  transition: all 0.2s;
}

.tag-btn:hover {
  background-color: #e0e0e0;
}

.tag-btn.active {
  background-color: var(--info);
  color: white;
}

.api-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.api-item {
  padding: 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-bottom: 0.3rem;
}

.api-item:hover {
  background-color: #f5f5f5;
}

.api-item.active {
  background-color: #e3f2fd;
  border: 1px solid var(--info);
}

.api-item-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.4rem;
}

.api-method {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-family: monospace;
}

.api-method.get {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.api-method.post {
  background-color: #fff3e0;
  color: #ef6c00;
}

.api-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.api-item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.api-category {
  font-size: 0.75rem;
  color: var(--info);
  background-color: #e3f2fd;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
}

.api-actions {
  display: flex;
  gap: 0.3rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.api-item:hover .api-actions {
  opacity: 1;
}

.action-btn {
  border: none;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.75rem;
  color: white;
}

.action-btn.edit {
  background-color: var(--info);
}

.action-btn.edit:hover {
  background-color: #2980b9;
}

.action-btn.delete {
  background-color: var(--api-danger);
}

.action-btn.delete:hover {
  background-color: #c0392b;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
}

.main-panel {
  flex: 1;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
}

.form-panel {
  padding: 1.5rem;
}

.form-panel h2 {
  margin: 0 0 1.5rem;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.params-section {
  margin: 1.5rem 0;
  padding: 1rem;
  background-color: #f9f9f9;
  border-radius: 6px;
}

.params-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.params-header label {
  font-weight: 600;
  color: var(--text-primary);
}

.add-param-btn {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.add-param-btn:hover {
  background-color: #2980b9;
}

.param-item {
  background-color: #fff;
  padding: 0.8rem;
  border-radius: 4px;
  margin-bottom: 0.6rem;
  border: 1px solid #eee;
}

.param-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.param-name {
  flex: 2;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.param-type {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.param-default {
  flex: 2;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.param-required {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  white-space: nowrap;
}

.param-required input {
  width: auto;
}

.remove-param-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--api-danger);
  cursor: pointer;
  padding: 0 0.3rem;
}

.remove-param-btn:hover {
  color: #c0392b;
}

.param-desc {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.85rem;
  box-sizing: border-box;
}

.form-actions {
  display: flex;
  gap: 0.8rem;
  margin-top: 1.5rem;
}

.save-btn {
  background-color: var(--api-success);
  color: white;
  border: none;
  padding: 0.7rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.save-btn:hover {
  background-color: #27ae60;
}

.cancel-btn {
  background-color: #95a5a6;
  color: white;
  border: none;
  padding: 0.7rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.cancel-btn:hover {
  background-color: #7f8c8d;
}

.detail-panel {
  padding: 1.5rem;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.8rem;
}

.detail-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.detail-method {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  font-family: monospace;
}

.detail-method.get {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.detail-method.post {
  background-color: #fff3e0;
  color: #ef6c00;
}

.detail-description {
  color: #7f8c8d;
  margin-bottom: 1.5rem;
}

.detail-url {
  margin-bottom: 1.5rem;
}

.detail-url label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.detail-url code {
  display: block;
  padding: 0.8rem;
  background-color: #f5f5f5;
  border-radius: 4px;
  font-family: monospace;
  word-break: break-all;
  color: var(--api-danger);
}

.params-config {
  margin-bottom: 1.5rem;
}

.params-config h3 {
  margin: 0 0 1rem;
  color: var(--text-primary);
}

.param-config-item {
  background-color: #f9f9f9;
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 0.8rem;
}

.param-config-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.4rem;
}

.param-config-name {
  font-weight: 600;
  color: var(--text-primary);
  font-family: monospace;
}

.param-config-type {
  font-size: 0.75rem;
  color: #7f8c8d;
  background-color: #eee;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
}

.param-config-required {
  font-size: 0.75rem;
  color: var(--api-danger);
}

.param-config-desc {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin-bottom: 0.6rem;
}

.param-config-input {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
  box-sizing: border-box;
}

.execute-btn {
  background-color: var(--info);
  color: white;
  border: none;
  padding: 0.8rem 2rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  width: 100%;
  transition: background-color 0.2s;
}

.execute-btn:hover:not(:disabled) {
  background-color: #2980b9;
}

.execute-btn:disabled {
  background-color: #95a5a6;
  cursor: not-allowed;
}

.error-panel {
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: #fdecea;
  border-radius: 6px;
  border: 1px solid #f5c6cb;
}

.error-panel h3 {
  margin: 0 0 0.8rem;
  color: var(--api-danger);
}

.error-panel pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #721c24;
  font-size: 0.9rem;
}

.response-panel {
  margin-top: 1.5rem;
  background-color: #f9f9f9;
  border-radius: 6px;
  overflow: hidden;
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: #f1f1f1;
}

.response-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.response-meta {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.response-status {
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
}

.response-status.success {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.response-status.client-error {
  background-color: #fff3e0;
  color: #ef6c00;
}

.response-status.server-error {
  background-color: #fdecea;
  color: #c62828;
}

.response-status.info {
  background-color: #e3f2fd;
  color: #1565c0;
}

.response-time {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.response-data {
  padding: 1rem;
  margin: 0;
  max-height: 400px;
  overflow: auto;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  background-color: #263238;
  color: #eeffff;
}

.welcome-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.welcome-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
}

.welcome-panel h2 {
  margin: 0 0 0.8rem;
  color: var(--text-primary);
}

.welcome-panel > p {
  color: #7f8c8d;
  margin-bottom: 2rem;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.feature-icon {
  font-size: 1.5rem;
}

/* ===== 深色模式适配：覆盖关键表面，跟随全局 token，不影响浅色外观 ===== */
:root.dark .app-container {
  color: var(--text-body);
}

:root.dark .sidebar,
:root.dark .main-panel {
  background-color: var(--bg-card);
  box-shadow: var(--shadow-md);
}

:root.dark .search-section,
:root.dark .category-tags {
  border-bottom-color: var(--border);
}

:root.dark .search-input,
:root.dark .form-group input,
:root.dark .form-group select,
:root.dark .form-group textarea,
:root.dark .param-name,
:root.dark .param-type,
:root.dark .param-default,
:root.dark .param-desc,
:root.dark .param-config-input {
  background-color: var(--bg-input);
  border-color: var(--border);
  color: var(--text-body);
}

:root.dark .tag-btn {
  background-color: var(--bg-subtle);
  color: var(--text-primary);
}

:root.dark .tag-btn:hover {
  background-color: var(--bg-hover);
}

:root.dark .tag-btn.active {
  background-color: var(--info);
  color: #fff;
}

:root.dark .api-item:hover {
  background-color: var(--bg-hover);
}

:root.dark .api-item.active {
  background-color: var(--accent-bg);
  border-color: var(--info);
}

:root.dark .api-category {
  background-color: var(--accent-bg);
}

:root.dark .param-item,
:root.dark .params-section,
:root.dark .param-config-item,
:root.dark .response-panel {
  background-color: var(--bg-subtle);
}

:root.dark .param-item {
  border-color: var(--border);
}

:root.dark .param-config-type {
  background-color: var(--bg-subtle);
  color: var(--text-dim);
}

:root.dark .response-header {
  background-color: var(--bg-hover);
}

:root.dark .detail-url code {
  background-color: var(--bg-input);
}

:root.dark .empty-state,
:root.dark .detail-description,
:root.dark .welcome-panel > p,
:root.dark .param-config-desc,
:root.dark .response-time {
  color: var(--text-dim);
}

:root.dark .error-panel {
  background-color: var(--danger-bg);
  border-color: var(--danger);
}

:root.dark .error-panel h3,
:root.dark .error-panel pre {
  color: var(--danger);
}

:root.dark .response-status.success,
:root.dark .api-method.get,
:root.dark .detail-method.get {
  background-color: var(--success-bg);
  color: var(--success);
}

:root.dark .response-status.client-error,
:root.dark .api-method.post,
:root.dark .detail-method.post {
  background-color: var(--warning-bg);
  color: var(--warning);
}

:root.dark .response-status.server-error {
  background-color: var(--danger-bg);
  color: var(--danger);
}

:root.dark .response-status.info {
  background-color: var(--accent-bg);
  color: var(--info);
}

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
    height: auto;
    min-height: 100vh;
  }

  .app-header {
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .app-header h1 {
    font-size: 1.4rem;
    order: 1;
  }

  .back-button {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
    order: 0;
  }

  .add-api-btn {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    order: 2;
    margin-left: auto;
  }

  .api-content {
    flex-direction: column;
    gap: 1rem;
  }

  .sidebar {
    width: 100%;
    max-height: 300px;
  }

  .api-actions {
    opacity: 1;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .param-row {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .param-name {
    flex: 1 1 100%;
  }

  .param-type {
    flex: 1;
  }

  .param-default {
    flex: 1;
  }

  .param-required {
    flex-shrink: 0;
  }

  .detail-header {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .detail-url code {
    font-size: 0.8rem;
  }

  .response-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .response-meta {
    gap: 0.5rem;
  }

  .welcome-panel {
    padding: 1.5rem 1rem;
  }

  .welcome-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .welcome-panel h2 {
    font-size: 1.2rem;
  }

  .feature-item {
    font-size: 1rem;
  }
}
</style>
