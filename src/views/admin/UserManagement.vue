<template>
  <div class="user-management">
    <div class="page-header">
      <div>
        <h1>👥 用户管理</h1>
        <p class="page-desc">管理所有用户与管理员账号，共 {{ totalUsers }} 人</p>
      </div>
      <button class="btn-primary" @click="showCreateModal">
        <span class="btn-icon">+</span> 新建用户
      </button>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索用户名或邮箱..."
          @input="onSearch"
        />
      </div>
      <select v-model="roleFilter" class="form-select" @change="fetchUsers">
        <option value="">全部角色</option>
        <option value="user">普通用户</option>
        <option value="admin">管理员</option>
        <option value="super_admin">超级管理员</option>
      </select>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="users.length === 0" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>暂无用户数据</p>
    </div>

    <div v-else class="table-wrapper">
      <table class="user-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th>已装应用</th>
            <th>注册时间</th>
            <th>最后登录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" :class="{ 'row-deleted': !u.isActive }">
            <td class="col-id">{{ u.id }}</td>
            <td>
              <div class="user-cell">
                <span class="user-avatar-sm">{{ u.username.charAt(0).toUpperCase() }}</span>
                <span>{{ u.username }}</span>
              </div>
            </td>
            <td class="col-email">{{ u.email || '-' }}</td>
            <td>
              <span class="role-badge" :class="`role-${u.role}`">{{ roleLabel(u.role) }}</span>
            </td>
            <td>
              <span class="status-dot" :class="u.isActive ? 'active' : 'inactive'"></span>
              {{ u.isActive ? '正常' : '已停用' }}
            </td>
            <td>{{ Array.isArray(u.installedApps) ? u.installedApps.length : 0 }}</td>
            <td class="col-date">{{ formatDate(u.createdAt) }}</td>
            <td class="col-date">{{ formatDate(u.lastLoginAt) || '-' }}</td>
            <td class="col-actions">
              <button class="btn-secondary btn-sm" @click="showEditModal(u)">✏️</button>
              <button
                v-if="u.id !== currentUserId"
                class="btn-danger btn-sm"
                @click="toggleStatus(u)"
              >
                {{ u.isActive ? '🔒' : '🔓' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
        ← 上一页
      </button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <button
        class="page-btn"
        :disabled="currentPage >= totalPages"
        @click="goPage(currentPage + 1)"
      >
        下一页 →
      </button>
    </div>

    <transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h2>{{ editingUser ? '✏️ 编辑用户' : '👤 新建用户' }}</h2>
            <button class="close-btn" @click="showModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>用户名 <span class="required">*</span></label>
              <input v-model="form.username" class="form-input" placeholder="至少3个字符" />
            </div>
            <div class="form-group">
              <label>邮箱</label>
              <input v-model="form.email" class="form-input" placeholder="选填" />
            </div>
            <div class="form-group">
              <label
                >{{ editingUser ? '新密码（留空不修改）' : '密码' }}
                <span v-if="!editingUser" class="required">*</span></label
              >
              <input
                v-model="form.password"
                type="password"
                class="form-input"
                placeholder="至少6个字符"
              />
            </div>
            <div class="form-group">
              <label>角色</label>
              <select v-model="form.role" class="form-input">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
                <option value="super_admin">超级管理员</option>
              </select>
            </div>
            <div class="form-group" v-if="editingUser">
              <label>状态</label>
              <label class="checkbox-label">
                <input type="checkbox" v-model="form.isActive" />
                账号已激活
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showModal = false">取消</button>
            <button class="btn-primary" :disabled="saving" @click="saveUser">
              <span v-if="saving" class="loading-spinner-sm"></span>
              {{ editingUser ? '保存' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Toast } from '@/components'
import { api } from '@/utils/request'
const authStore = useAuthStore()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const currentUserId = computed(() => authStore.user?.id)

function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

interface UserItem {
  id: number
  username: string
  email?: string
  role: string
  isActive: boolean
  installedApps: number[] | string
  createdAt: string
  lastLoginAt?: string
}

const users = ref<UserItem[]>([])
const totalUsers = ref(0)
const totalPages = ref(0)
const currentPage = ref(1)
const isLoading = ref(false)
const keyword = ref('')
const roleFilter = ref('')
let searchTimer: ReturnType<typeof setTimeout>

const showModal = ref(false)
const editingUser = ref<UserItem | null>(null)
const form = ref({ username: '', email: '', password: '', role: 'user', isActive: true })
const saving = ref(false)

onMounted(() => fetchUsers())

function roleLabel(role: string) {
  const map: Record<string, string> = { user: '普通用户', admin: '管理员', super_admin: '超管' }
  return map[role] || role
}

function formatDate(d?: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchUsers()
  }, 400)
}

async function fetchUsers() {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(currentPage.value))
    params.set('limit', '20')
    if (keyword.value) params.set('keyword', keyword.value)
    if (roleFilter.value) params.set('role', roleFilter.value)

    const { data } = await api.get<{
      data: { items: UserItem[]; total: number; page: number; totalPages: number }
    }>(`/api/users?${params}`)
    users.value = data.items
    totalUsers.value = data.total
    totalPages.value = data.totalPages
    currentPage.value = data.page
  } catch {
    showToast('error', '获取用户列表失败')
  } finally {
    isLoading.value = false
  }
}

function goPage(page: number) {
  currentPage.value = page
  fetchUsers()
}

function showCreateModal() {
  editingUser.value = null
  form.value = { username: '', email: '', password: '', role: 'user', isActive: true }
  showModal.value = true
}

function showEditModal(u: UserItem) {
  editingUser.value = u
  form.value = {
    username: u.username,
    email: u.email || '',
    password: '',
    role: u.role,
    isActive: u.isActive,
  }
  showModal.value = true
}

async function saveUser() {
  if (!form.value.username.trim()) {
    showToast('warning', '用户名不能为空')
    return
  }
  if (!editingUser.value && form.value.password.length < 6) {
    showToast('warning', '密码至少需要6个字符')
    return
  }

  saving.value = true
  try {
    const body: Record<string, string | boolean | undefined> = {
      username: form.value.username,
      email: form.value.email || undefined,
      role: form.value.role,
    }
    if (form.value.password) body.password = form.value.password
    if (editingUser.value) {
      body.isActive = form.value.isActive
    }

    if (editingUser.value) {
      await api.put(`/api/users/${editingUser.value.id}`, body)
    } else {
      await api.post('/api/users', body)
    }

    showToast('success', editingUser.value ? '用户已更新' : '用户创建成功')
    showModal.value = false
    fetchUsers()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '操作失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(u: UserItem) {
  const action = u.isActive ? '停用' : '恢复'
  if (!window.confirm(`确定要${action}用户「${u.username}」吗？`)) return

  try {
    await api.put(`/api/users/${u.id}`, { isActive: !u.isActive })
    showToast('success', `用户已${action}`)
    fetchUsers()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<style scoped>
.user-management {
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
.form-select {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: var(--bg-input);
  color: var(--text-primary);
  min-width: 140px;
  cursor: pointer;
}
.form-select:focus {
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
.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 0;
  color: var(--text-secondary);
}
.empty-icon {
  font-size: 48px;
}
.empty-state p {
  font-size: 16px;
  margin: 0;
}

.table-wrapper {
  background: var(--bg-card);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
}
.user-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: var(--text-primary);
}
.user-table thead {
  background: var(--bg-hover);
}
.user-table th {
  text-align: left;
  padding: 14px 16px;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  border-bottom: 1px solid var(--border-light);
}
.user-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.user-table tbody tr:hover {
  background: var(--bg-hover);
}
.row-deleted {
  opacity: 0.5;
}
.col-id {
  font-family: monospace;
  color: var(--text-muted);
  width: 50px;
}
.col-email {
  color: var(--text-secondary);
}
.col-date {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
}
.col-actions {
  display: flex;
  gap: 6px;
  white-space: nowrap;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}
.role-badge {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}
.role-user {
  background: var(--tag-bg);
  color: var(--text-secondary);
}
.role-admin {
  background: var(--warning-bg);
  color: var(--warning);
}
.role-super_admin {
  background: var(--accent-bg);
  color: var(--accent);
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.status-dot.active {
  background: var(--success);
}
.status-dot.inactive {
  background: var(--border-color);
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 24px;
  backdrop-filter: blur(4px);
}
.modal {
  background: var(--bg-card);
  border-radius: 18px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid var(--border-light);
}
.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
}
.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--text-muted);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}
.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.modal-body {
  padding: 24px 28px;
}
.modal-footer {
  padding: 16px 28px;
  border-top: 1px solid var(--border-light);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
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
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
  cursor: pointer;
  color: var(--text-primary);
}
.checkbox-label input {
  width: auto;
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
