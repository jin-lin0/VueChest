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
        <CustomSelect
          v-model="filterCategory"
          :options="categoryOptions"
          placeholder="全部分类"
          width="200px"
          @change="onFilterChange"
        />
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="vc-loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <EmptyState v-else-if="apps.length === 0" icon="📭" title="暂无应用数据" />

    <div v-else class="table-wrapper">
      <table class="app-table">
        <thead>
          <tr>
            <th class="col-icon">图标</th>
            <th class="col-name">名称</th>
            <th class="col-version">版本</th>
            <th class="col-author">作者</th>
            <th class="col-category">分类</th>
            <th class="col-status">状态</th>
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
            <td class="col-status">
              <span class="status-badge" :class="'status-' + (app.status || 'approved')">
                {{ statusLabel(app.status) }}
              </span>
            </td>
            <td class="col-downloads">{{ app.downloads }}</td>
            <td class="col-date">{{ formatDate(app.createdAt) }}</td>
            <td class="col-actions">
              <template v-if="app.status === 'pending'">
                <button
                  class="btn-approve btn-sm"
                  :disabled="reviewingId === app.id"
                  @click="handleApprove(app)"
                >
                  ✅ 通过
                </button>
                <button
                  class="btn-reject btn-sm"
                  :disabled="reviewingId === app.id"
                  @click="handleReject(app)"
                >
                  ❌ 拒绝
                </button>
              </template>
              <button class="btn-secondary btn-sm" @click="openEditModal(app)">✏️ 编辑</button>
              <button class="btn-danger btn-sm" @click="confirmDelete(app)">🗑️ 删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
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

    <Modal
      :open="showEditModal"
      :width="640"
      title="✏️ 编辑应用"
      @close="showEditModal = false"
    >
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
      <div class="form-group">
        <label>联网域名白名单 <span class="label-optional">选填</span></label>
        <textarea
          v-model="editForm.allowNetwork"
          class="form-textarea"
          rows="2"
          placeholder="应用需要访问的接口域名，逗号或换行分隔，如：api.example.com, *.example.com"
        ></textarea>
        <p class="form-hint">沙箱默认禁止联网，仅此处声明的域名会被放行（支持 *. 通配子域）。</p>
      </div>
      <div class="form-group">
        <label class="toggle-label">
          <span>官方应用</span>
          <span class="toggle-hint">标记为官方出品，前端详情页与列表展示「官方」徽章</span>
        </label>
        <label class="switch">
          <input v-model="editForm.isOfficial" type="checkbox" />
          <span class="switch-slider"></span>
        </label>
      </div>

      <template #footer>
        <button class="btn-secondary" @click="showEditModal = false">取消</button>
        <button class="btn-ghost" :disabled="!editingApp" @click="downloadJs(editingApp)">
          📥 下载 JS
        </button>
        <button class="btn-primary" :disabled="saving" @click="saveEdit">
          <span v-if="saving" class="vc-loading-spinner-sm"></span>
          保存
        </button>
      </template>
    </Modal>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { CustomSelect, Modal, Toast, EmptyState, type SelectOption } from '@/components'
import { api } from '@/lib/request'
import { useConfirm } from '@/composables/useConfirm'

const { confirm } = useConfirm()

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
  status: string
  /** 允许访问的网络域名白名单（沙箱联网能力用） */
  allowNetwork?: string[]
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
const reviewingId = ref<number | null>(null)

const searchKeyword = ref('')
const filterCategory = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const categoryOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部分类' },
  ...categories.value.map((c) => ({ value: c.name, label: c.name })),
])

const stats = reactive({
  totalApps: 0,
  totalDownloads: 0,
  totalCategories: 0,
  totalAuthors: 0,
})

const showEditModal = ref(false)
const editingApp = ref<MarketAppItem | null>(null)
const editForm = reactive({
  name: '',
  icon: '',
  description: '',
  version: '',
  category: '',
  readme: '',
  allowNetwork: '',
  isOfficial: false,
})
const saving = ref(false)

onMounted(() => {
  fetchCategories()
  fetchApps()
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
  }
  return map[status || 'approved'] || status || '已通过'
}

async function handleApprove(app: MarketAppItem) {
  reviewingId.value = app.id
  try {
    await api.post(`/api/market/apps/${app.id}/approve`)
    showToast('success', `应用「${app.name}」已通过审核`)
    fetchApps()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '操作失败')
  } finally {
    reviewingId.value = null
  }
}

async function handleReject(app: MarketAppItem) {
  reviewingId.value = app.id
  try {
    await api.post(`/api/market/apps/${app.id}/reject`)
    showToast('success', `应用「${app.name}」已拒绝`)
    fetchApps()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '操作失败')
  } finally {
    reviewingId.value = null
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function fetchCategories() {
  try {
    const { data } = await api.get<{ data: { name: string; count: number }[] }>(
      '/api/market/categories',
      { auth: false },
    )
    categories.value = data
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

    const { data } = await api.get<{
      data: { items: MarketAppItem[]; total: number; page: number; totalPages: number }
    }>(`/api/market/apps?${params}`)
    apps.value = data.items
    totalApps.value = data.total
    totalPages.value = data.totalPages
    currentPage.value = data.page
    updateStats()
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

function openEditModal(app: MarketAppItem) {
  editingApp.value = app
  editForm.name = app.name
  editForm.icon = app.icon
  editForm.description = app.description || ''
  editForm.version = app.version
  editForm.category = app.category || ''
  editForm.readme = ''
  editForm.allowNetwork = (app.allowNetwork || []).join(', ')
  editForm.isOfficial = !!app.isOfficial
  showEditModal.value = true

  api
    .get<{ data: { readme?: string } }>(`/api/market/apps/${app.id}`, { auth: false })
    .then((res) => {
      if (res.data?.readme) editForm.readme = res.data.readme
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
    const body: Record<string, string | string[] | boolean> = {
      name: editForm.name,
      icon: editForm.icon,
      description: editForm.description,
      version: editForm.version || '1.0.0',
      category: editForm.category,
      isOfficial: editForm.isOfficial,
    }
    if (editForm.readme) body.readme = editForm.readme
    const allowNetwork = editForm.allowNetwork
      .split(/[,\n\s]+/)
      .map((s: string) => s.trim())
      .filter(Boolean)
    if (allowNetwork.length) body.allowNetwork = allowNetwork

    await api.put(`/api/market/apps/${editingApp.value.id}`, body)
    showToast('success', '应用已更新')
    showEditModal.value = false
    fetchApps()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

async function confirmDelete(app: MarketAppItem) {
  const ok = await confirm(`确定要删除应用「${app.name}」吗？此操作无法撤销。`)
  if (!ok) return
  deleteApp(app)
}

async function downloadJs(app: MarketAppItem | null) {
  if (!app) return
  try {
    const { data } = await api.get<{ data: { fileContent: string } }>(
      `/api/market/apps/${app.id}/download`,
      { auth: false },
    )
    const blob = new Blob([data.fileContent], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${app.name}-v${app.version}.js`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', 'JS 文件已下载')
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '下载失败')
  }
}

async function deleteApp(app: MarketAppItem) {
  try {
    await api.delete(`/api/market/apps/${app.id}`)
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
  color: var(--text-primary);
}
.page-desc {
  margin: 4px 0 0;
  color: var(--text-secondary);
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
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--text-muted);
}

.btn-ghost {
  background: var(--accent-bg);
  color: var(--accent);
  border: 1px solid var(--border-light);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-ghost:hover:not(:disabled) {
  background: var(--border-light);
  border-color: var(--accent);
}
.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid var(--danger-bg);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-approve {
  background: var(--success-bg);
  color: var(--success);
  border: 1px solid var(--success-bg);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-approve:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-approve:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-reject {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid var(--danger-bg);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-reject:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-reject:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}
.status-pending {
  background: var(--warning-bg);
  color: var(--warning);
}
.status-approved {
  background: var(--success-bg);
  color: var(--success);
}
.status-rejected {
  background: var(--danger-bg);
  color: var(--danger);
}

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
  background: var(--bg-card);
  padding: 20px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
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
  color: var(--text-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.filter-group {
  width: 200px;
  flex-shrink: 0;
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
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: var(--bg-input);
  color: var(--text-primary);
  transition: all 0.2s;
  box-sizing: border-box;
}
.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 0;
  color: var(--text-secondary);
}
.table-wrapper {
  background: var(--bg-card);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
}
.app-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: var(--text-primary);
}
.app-table thead {
  background: var(--bg-hover);
}
.app-table th {
  text-align: left;
  padding: 14px 16px;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  border-bottom: 1px solid var(--border-light);
}
.app-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.app-table tbody tr:hover {
  background: var(--bg-hover);
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
  color: var(--text-primary);
  margin-bottom: 2px;
}
.app-desc {
  font-size: 12px;
  color: var(--text-muted);
}
.version-badge {
  background: var(--tag-bg);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
}
.category-tag {
  background: var(--accent-bg);
  color: var(--accent);
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
  color: var(--text-secondary);
  font-size: 13px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}
.page-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
}
.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-info {
  font-size: 14px;
  color: var(--text-secondary);
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
  color: var(--text-primary);
  font-size: 14px;
}
.required {
  color: var(--danger);
}
.label-optional {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 12px;
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.toggle-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.toggle-hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-muted);
}

.switch {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 26px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--border-color);
  border-radius: 26px;
  transition: background 0.2s;
}

.switch-slider::before {
  content: '';
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.switch input:checked + .switch-slider {
  background: var(--accent);
}

.switch input:checked + .switch-slider::before {
  transform: translateX(20px);
}
.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  background: var(--bg-input);
  color: var(--text-primary);
  box-sizing: border-box;
}
.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: all 0.2s;
  background: var(--bg-input);
  color: var(--text-primary);
  box-sizing: border-box;
}
.form-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}
</style>
