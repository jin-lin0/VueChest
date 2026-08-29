<template>
  <div class="admin-layout" :class="{ 'dark-mode': isDark }">
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <AdminSidebar
        :collapsed="isCollapsed"
        :menu-items="menuItems"
        :user="authStore.user"
        :is-dark="isDark"
        :role-label="getRoleLabel(authStore.user?.role ?? '')"
        @select="mobileOpen = false"
        @toggle-collapse="toggleSidebar"
        @toggle-dark="toggleDark"
        @logout="handleLogout"
        @upload-avatar="uploadAvatar"
      />
    </aside>

    <Drawer :open="mobileOpen" :width="260" :no-padding="true" @close="mobileOpen = false">
      <AdminSidebar
        :collapsed="false"
        :mobile="true"
        :menu-items="menuItems"
        :user="authStore.user"
        :is-dark="isDark"
        :role-label="getRoleLabel(authStore.user?.role ?? '')"
        @select="mobileOpen = false"
        @toggle-collapse="toggleSidebar"
        @toggle-dark="toggleDark"
        @logout="handleLogout"
        @upload-avatar="uploadAvatar"
      />
    </Drawer>

    <main class="main-content">
      <header class="top-header">
        <div class="header-left">
          <button class="mobile-menu-btn" @click="mobileOpen = true">☰</button>
          <nav class="breadcrumb">
            <span class="breadcrumb-item">后台管理</span>
            <span class="breadcrumb-sep">/</span>
            <span class="breadcrumb-item active">{{ currentPageTitle }}</span>
          </nav>
        </div>
        <div class="header-right">
          <button class="header-btn" @click="goToHome" title="返回前台">
            <span>🏠</span>
            <span class="header-btn-text">返回前台</span>
          </button>
        </div>
      </header>

      <div class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/request'
import { useTheme } from '@/composables/useTheme'
import { Toast, Drawer } from '@/components'
import AdminSidebar from './AdminSidebar.vue'
import { roleText } from '@/utils/common'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const isCollapsed = ref(false)
const mobileOpen = ref(false)
// 主题状态与公开页共享同一份（composables/useTheme 模块级单例）
const { isDark, toggleTheme } = useTheme()

async function uploadAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    showToast('error', '头像不能超过 2MB')
    return
  }

  try {
    const { data } = await api.post<{ data: { key: string; uploadUrl: string } }>(
      '/api/uploads/presign',
      { kind: 'avatar', contentType: file.type, size: file.size, name: file.name },
    )
    const uploaded = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!uploaded.ok) throw new Error('upload failed')
    await api.post('/api/uploads/complete', { kind: 'avatar', key: data.key })
    await authStore.fetchUserInfo()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '头像上传失败，请稍后重试')
  }
}

const menuItems = computed(() => {
  const items = [
    { path: '/admin', name: '仪表盘', icon: '📊' },
    { path: '/admin/questions', name: '问题管理', icon: '📚' },
    { path: '/admin/categories', name: '分类管理', icon: '📂' },
    { path: '/admin/apps', name: '应用管理', icon: '📱' },
  ]
  if (authStore.isSuperAdmin) {
    items.push({ path: '/admin/users', name: '用户管理', icon: '👥' })
  }
  return items
})

const currentPageTitle = computed(() => {
  const items = menuItems.value
  const matched = items.find(
    (item: { path: string; name: string }) =>
      route.path === item.path || route.path.startsWith(item.path + '/'),
  )
  return matched?.name ?? (route.meta.title as string) ?? '仪表盘'
})

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}

function toggleDark() {
  // 切换到全局主题（同步 html.dark + localStorage + 公开页状态）
  toggleTheme()
}

function getRoleLabel(role: string) {
  return roleText(role)
}

async function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function goToHome() {
  router.push('/')
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100%;
  background: #f3f4f6;
  color: #111827;
  transition:
    background 0.3s,
    color 0.3s;
}

.admin-layout.dark-mode {
  background: #111827;
  color: #f3f4f6;
}

/* ===== Sidebar ===== */
.sidebar {
  width: 260px;
  background: var(--bg-card);
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  transition:
    width 0.3s ease,
    transform 0.3s ease;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 50;
}

.dark-mode .sidebar {
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-right-color: #334155;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
}

.sidebar.collapsed {
  width: 72px;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
}

/* ===== Main Content ===== */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.top-header {
  flex-shrink: 0;
  background: var(--bg-card);
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  gap: 12px;
}

.dark-mode .top-header {
  background: #1e293b;
  border-color: #334155;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  font-size: var(--font-size-heading);
  cursor: pointer;
  color: #374151;
  padding: 4px;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: block;
  }
}

.dark-mode .mobile-menu-btn {
  color: #f3f4f6;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-body);
  color: var(--text-muted);
}

.breadcrumb-item.active {
  color: #111827;
  font-weight: 500;
}

.dark-mode .breadcrumb-item.active {
  color: #f3f4f6;
}

.breadcrumb-sep {
  color: #d1d5db;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  font-size: var(--font-size-body-lg);
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.header-btn:hover {
  background: #e5e7eb;
  transform: translateY(-1px);
}

.header-btn-text {
  font-size: var(--font-size-control);
}

@media (max-width: 480px) {
  .header-btn-text {
    display: none;
  }
}

.dark-mode .header-btn {
  background: #334155;
  color: #f3f4f6;
}

.dark-mode .header-btn:hover {
  background: #475569;
}

.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Page transition */
.page-enter-active {
  transition: all 0.25s ease;
}
.page-leave-active {
  transition: all 0.15s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
