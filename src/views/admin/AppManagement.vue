<template>
  <div class="app-management">
    <div class="page-header">
      <div>
        <h1>📱 应用管理</h1>
        <p class="page-desc">管理市场应用，共 {{ totalApps }} 个应用</p>
      </div>
      <router-link to="/market/upload" class="btn-primary">
        <span class="btn-icon">+</span> 上传应用
      </router-link>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-icon">📱</span>
        <div class="stat-info">
          <span class="stat-value">{{ stats.totalApps }}</span>
          <span class="stat-label">应用总数</span>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">📥</span>
        <div class="stat-info">
          <span class="stat-value">{{ stats.totalDownloads }}</span>
          <span class="stat-label">总下载量</span>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">📂</span>
        <div class="stat-info">
          <span class="stat-value">{{ stats.totalCategories }}</span>
          <span class="stat-label">分类数</span>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">👤</span>
        <div class="stat-info">
          <span class="stat-value">{{ stats.totalAuthors }}</span>
          <span class="stat-label">开发者数</span>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchKeyword"
          class="search-input"
          placeholder="搜索应用名称..."
          @input="onSearchInput"
        />
      </div>
      <div class="filter-group">
        <select v-model="filterCategory" class="form-select" @change="onFilterChange">
          <option value="">全部分类</option>
          <option v-for="c in categories" :key="c.name" :value="c.name">{{ c.name }}</option>
        </select>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="apps.length === 0" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>暂无应用数据</p>
    </div>

    <div v-else class="table-wrapper">
      <table class="app-table">
        <thead>
          <tr>
            <th class="col-icon">图标</th>
            <th class="col-name">名称</th>
            <th class="col-version">版本</th>
            <th class="col-author">作者</th>
            <th class="col-category">分类</th>
            <th class="col-downloads">下载</th>
            <th class="col-date">上传时间</th>
            <th class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="app in apps" :key="app.id">
            <td class="col-icon">
              <span class="app-icon">{{ app.icon }}</span>
            </td>
            <td class="col-name">
              <div class="app-name">{{ app.name }}</div>
              <div v-if="app.description" class="app-desc">{{ truncate(app.description, 40) }}</div>
            </td>
            <td class="col-version">
              <span class="version-badge">v{{ app.version }}</span>
            </td>
            <td class="col-author">{{ app.author || '-' }}</td>
            <td class="col-category">
              <span class="category-tag">{{ app.category || '-' }}</span>
            </td>
            <td class="col-downloads">{{ app.downloads }}</td>
            <td class="col-date">{{ formatDate(app.createdAt) }}</td>
            <td class="col-actions">
              <button class="btn-secondary btn-sm" @click="showEditModal(app)">
                ✏️ 编辑
              </button>
              <button class="btn-danger btn-sm" @click="confirmDelete(app)">
                🗑️ 删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button
        class="page-btn"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        ← 上一页
      </button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <button
        class="page-btn"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        下一页 →
      </button>
    </div>

    <transition name="modal">
      <div v-if="showEditModal_" class="modal-overlay" @click.self="showEditModal_ = false">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h2>✏️ 编辑应用</h2>
            <button class="close-btn" @click="showEditModal_ = false">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label>应用名称 <span class="required">*</span></label>
                <input v-model="editForm.name" class="form-input" placeholder="应用名称" />
              </div>
              <div class="form-group">
                <label>图标 <span class="required">*</span></label>
                <input v-model="editForm.icon" class="form-input" placeholder="Emoji 或图标 URL" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>版本</label>
                <input v-model="editForm.version" class="form-input" placeholder="1.0.0" />
              </div>
              <div class="form-group">
                <label>分类</label>
                <input v-model="editForm.category" class="form-input" placeholder="工具/娱乐/..." />
              </div>
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea
                v-model="editForm.description"
                class="form-textarea"
                rows="2"
                placeholder="应用描述"
              ></textarea>
            </div>
            <div class="form-group">
              <label>README</label>
              <textarea
                v-model="editForm.readme"
                class="form-textarea"
                rows="4"
                placeholder="应用说明文档 (Markdown)"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showEditModal_ = false">取消</button>
            <button class="btn-primary" :disabled="saving" @click="saveEdit">
              <span v-if="saving" class="loading-spinner-sm"></span>
              保存
            </button>
          </div>
        </div>
      </div>
    </transition>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import Toast from '@/components/Toast.vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

interface MarketAppItem {
  id: number
  name: string
  icon: string
  description: string
  version: string
  author: string
  category: string
  size: number
  downloads: number
  isOfficial: boolean
  createdAt: string
  updatedAt: string
}

interface CategoryInfo {
  name: string
  count: number
}

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const apps = ref<MarketAppItem[]>([])
const categories = ref<CategoryInfo[]>([])
const totalApps = ref(0)
const totalPages = ref(0)
const currentPage = ref(1)
const isLoading = ref(false)

const searchKeyword = ref('')
const filterCategory = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const stats = reactive({
  totalApps: 0,
  totalDownloads: 0,
  totalCategories: 0,
  totalAuthors: 0,
})

const showEditModal_ = ref(false)
const editingApp = ref<MarketAppItem | null>(null)
const editForm = reactive({
  name: '',
  icon: '',
  description: '',
  version: '',
  category: '',
  readme: '',
})
const saving = ref(false)

onMounted(() => {
  fetchCategories()
  fetchApps()
})

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/market/categories`)
    const json = await res.json()
    if (json.success) categories.value = json.data
  } catch {
    // ignore
  }
}

async function fetchApps() {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(currentPage.value))
    params.set('limit', '20')
    if (searchKeyword.value) params.set('keyword', searchKeyword.value)
    if (filterCategory.value) params.set('category', filterCategory.value)

    const res = await fetch(`${API_BASE}/api/market/apps?${params}`)
    const json = await res.json()
    if (json.success) {
      apps.value = json.data.items
      totalApps.value = json.data.total
      totalPages.value = json.data.totalPages
      currentPage.value = json.data.page
      updateStats()
    }
  } catch {
    showToast('error', '获取应用列表失败')
  } finally {
    isLoading.value = false
  }
}

function updateStats() {
  let downloads = 0
  const authorSet = new Set<string>()
  for (const app of apps.value) {
    downloads += app.downloads
    if (app.author) authorSet.add(app.author)
  }
  stats.totalApps = totalApps.value
  stats.totalDownloads = downloads
  stats.totalCategories = categories.value.length
  stats.totalAuthors = authorSet.size
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchApps()
  }, 400)
}

function onFilterChange() {
  currentPage.value = 1
  fetchApps()
}

function goToPage(page: number) {
  currentPage.value = page
  fetchApps()
}

function showEditModal(app: MarketAppItem) {
  editingApp.value = app
  editForm.name = app.name
  editForm.icon = app.icon
  editForm.description = app.description || ''
  editForm.version = app.version
  editForm.category = app.category || ''
  editForm.readme = ''
  showEditModal_.value = true

  fetch(`${API_BASE}/api/market/apps/${app.id}`)
    .then((r) => r.json())
    .then((json) => {
      if (json.success && json.data.readme) editForm.readme = json.data.readme
    })
    .catch(() => {})
}

async function saveEdit() {
  if (!editForm.name.trim() || !editForm.icon.trim()) {
    showToast('warning', '名称和图标不能为空')
    return
  }
  if (!editingApp.value) return
  saving.value = true
  try {
    const token = localStorage.getItem('admin_auth_token')
    const body: Record<string, string> = {
      name: editForm.name,
      icon: editForm.icon,
      description: editForm.description,
      version: editForm.version || '1.0.0',
      category: editForm.category,
    }
    if (editForm.readme) body.readme = editForm.readme

    const res = await fetch(`${API_BASE}/api/market/apps/${editingApp.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error || '更新失败')
    showToast('success', '应用已更新')
    showEditModal_.value = false
    fetchApps()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete(app: MarketAppItem) {
  if (!window.confirm(`确定要删除应用「${app.name}」吗？此操作无法撤销。`)) return
  deleteApp(app)
}

async function deleteApp(app: MarketAppItem) {
  try {
    const token = localStorage.getItem('admin_auth_token')
    const res = await fetch(`${API_BASE}/api/market/apps/${app.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error || '删除失败')
    showToast('success', `应用「${app.name}」已删除`)
    fetchApps()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<style scoped>
.app-management {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 26px;
  color: #111827;
}

.page-desc {
  margin: 4px 0 0 0;
  color: #6b7280;
  font-size: 14px;
}

.btn-icon {
  font-size: 18px;
  font-weight: 300;
}

.btn-sm {
  padding: 8px 14px;
  font-size: 13px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danger:hover:not(:disabled) {
  background: #fecaca;
}

.btn-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Stats row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.stat-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}

/* Toolbar */
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 200px;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 14px 10px 38px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: white;
  transition: all 0.2s;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-select {
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: white;
  min-width: 140px;
  cursor: pointer;
  transition: all 0.2s;
}

.form-select:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* Loading & Empty */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 0;
  color: #6b7280;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 0;
  color: #6b7280;
}

.empty-icon {
  font-size: 48px;
}

.empty-state p {
  font-size: 16px;
  margin: 0;
}

/* Table */
.table-wrapper {
  background: white;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow-x: auto;
}

.app-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.app-table thead {
  background: #f9fafb;
}

.app-table th {
  text-align: left;
  padding: 14px 16px;
  color: #6b7280;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
}

.app-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.app-table tbody tr:hover {
  background: #f9fafb;
}

.app-table tbody tr:last-child td {
  border-bottom: none;
}

.col-icon {
  width: 50px;
}

.app-icon {
  font-size: 28px;
  line-height: 1;
  display: inline-block;
}

.app-name {
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
}

.app-desc {
  font-size: 12px;
  color: #9ca3af;
}

.version-badge {
  background: #f3f4f6;
  color: #6b7280;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
}

.category-tag {
  background: #f0f4ff;
  color: #667eea;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.col-actions {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.col-downloads {
  font-variant-numeric: tabular-nums;
}

.col-date {
  color: #6b7280;
  font-size: 13px;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}

.page-btn {
  background: white;
  border: 1px solid #d1d5db;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.page-btn:hover:not(:disabled) {
  border-color: #667eea;
  color: #667eea;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #6b7280;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 24px;
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 18px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-lg {
  max-width: 640px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #9ca3af;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  padding: 24px 28px;
}

.modal-footer {
  padding: 16px 28px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #374151;
  font-size: 14px;
}

.required {
  color: #dc2626;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  background: white;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: all 0.2s;
  background: white;
  box-sizing: border-box;
}

.form-textarea:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.loading-spinner-sm {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Modal transition */
.modal-enter-active {
  transition: all 0.25s ease;
}

.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from {
  opacity: 0;
}

.modal-enter-from .modal {
  transform: scale(0.95) translateY(10px);
}

.modal-leave-to {
  opacity: 0;
}

.modal-leave-to .modal {
  transform: scale(0.95);
}
</style>
