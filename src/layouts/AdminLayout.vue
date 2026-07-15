<template>
  <div class="admin-layout" :class="{ 'dark-mode': isDark }">
    <div v-if="mobileOpen" class="sidebar-mask" @click="mobileOpen = false"></div>

    <aside class="sidebar" :class="{ collapsed: isCollapsed, 'mobile-open': mobileOpen }">
      <div class="sidebar-header">
        <div class="logo">
          <span class="logo-icon">⚙️</span>
          <span v-if="!isCollapsed" class="logo-text">VueChest 后台</span>
        </div>
        <button class="collapse-btn" @click="toggleSidebar" :title="isCollapsed ? '展开' : '收起'">
          {{ isCollapsed ? '→' : '←' }}
        </button>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-label" v-if="!isCollapsed">导航菜单</div>
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isRouteActive(item.path) }"
          @click="mobileOpen = false"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span v-if="!isCollapsed" class="nav-text">{{ item.name }}</span>
          <span v-if="!isCollapsed && isRouteActive(item.path)" class="nav-indicator"></span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="user-info" v-if="authStore.user">
          <label class="user-avatar" title="更换头像">
            <img v-if="authStore.user.avatar" :src="authStore.user.avatar" alt="用户头像" />
            <span v-else>{{ authStore.user.username.charAt(0).toUpperCase() }}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden @change="uploadAvatar" />
          </label>
          <div v-if="!isCollapsed" class="user-details">
            <div class="user-name">{{ authStore.user.username }}</div>
            <div class="user-role">{{ getRoleLabel(authStore.user.role) }}</div>
          </div>
        </div>
        <div class="footer-actions">
          <button class="theme-toggle" @click="toggleDark" :title="isDark ? '亮色模式' : '暗色模式'">
            {{ isDark ? '☀️' : '🌙' }}
          </button>
          <button class="logout-btn" @click="handleLogout" title="退出登录">
            <span>🚪</span>
            <span v-if="!isCollapsed">退出登录</span>
          </button>
        </div>
      </div>
    </aside>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/utils/request'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isCollapsed = ref(false)
const mobileOpen = ref(false)
const isDark = ref(false)

async function uploadAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    window.alert('头像不能超过 2MB')
    return
  }

  try {
    const { data } = await api.post<{ data: { key: string; uploadUrl: string } }>(
      '/api/uploads/presign',
      { kind: 'avatar', contentType: file.type, size: file.size },
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
    window.alert(error instanceof Error ? error.message : '头像上传失败，请稍后重试')
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
    (item: { path: string; name: string }) => route.path === item.path || route.path.startsWith(item.path + '/')
  )
  return matched?.name ?? (route.meta.title as string) ?? '仪表盘'
})

function isRouteActive(path: string) {
  if (path === '/admin') return route.path === '/admin'
  return route.path === path || route.path.startsWith(path + '/')
}

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

function getRoleLabel(role: string) {
  const roles: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    user: '普通用户',
  }
  return roles[role] || role
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
  height: 100vh;
  background: #f3f4f6;
  color: #111827;
  transition: background 0.3s, color 0.3s;
}

.admin-layout.dark-mode {
  background: #111827;
  color: #f3f4f6;
}

.sidebar-mask {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 40;
}

@media (max-width: 768px) {
  .sidebar-mask {
    display: block;
  }
}

/* ===== Sidebar ===== */
.sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, transform 0.3s ease;
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
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    transform: translateX(-100%);
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }
}

/* Sidebar header */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.dark-mode .sidebar-header {
  border-bottom-color: #334155;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.logo-icon {
  font-size: 26px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 17px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
}

.dark-mode .logo-text {
  color: white;
}

.collapse-btn {
  background: none;
  border: 1px solid #d1d5db;
  color: #9ca3af;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.dark-mode .collapse-btn {
  border-color: #475569;
  color: #94a3b8;
}

.dark-mode .collapse-btn:hover {
  background: #334155;
  color: white;
}

@media (max-width: 768px) {
  .collapse-btn {
    display: none;
  }
}

/* Navigation */
.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
}

.nav-section-label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 8px 12px 4px;
  font-weight: 600;
}

.dark-mode .nav-section-label {
  color: #64748b;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  margin: 2px 0;
  border-radius: 8px;
  color: #6b7280;
  text-decoration: none;
  transition: all 0.2s;
  position: relative;
}

.nav-item:hover {
  background: #f3f4f6;
  color: #111827;
}

.dark-mode .nav-item {
  color: #94a3b8;
}

.dark-mode .nav-item:hover {
  background: #334155;
  color: white;
}

.nav-item.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.nav-indicator {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 3px 0 0 3px;
}

.nav-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.nav-text {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

/* Sidebar footer */
.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
}

.dark-mode .sidebar-footer {
  border-top-color: #334155;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  overflow: hidden;
}

.user-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 15px;
  flex-shrink: 0;
  overflow: hidden;
  cursor: pointer;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dark-mode .user-name {
  color: white;
}

.user-role {
  font-size: 12px;
  color: #6b7280;
  margin-top: 1px;
}

.dark-mode .user-role {
  color: #94a3b8;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.theme-toggle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px;
  background: #f3f4f6;
  border: none;
  border-radius: 8px;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-toggle:hover {
  background: #e5e7eb;
  color: #111827;
}

.dark-mode .theme-toggle {
  background: #334155;
  color: #94a3b8;
}

.dark-mode .theme-toggle:hover {
  background: #475569;
  color: white;
}

.logout-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px;
  background: #fef2f2;
  border: none;
  border-radius: 8px;
  color: #dc2626;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: #fee2e2;
}

.dark-mode .logout-btn {
  background: #4a1a1a;
  color: #fca5a5;
}

.dark-mode .logout-btn:hover {
  background: #450a0a;
  color: #f87171;
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
  background: white;
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
  font-size: 22px;
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
  font-size: 14px;
  color: #9ca3af;
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
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.header-btn:hover {
  background: #e5e7eb;
  transform: translateY(-1px);
}

.header-btn-text {
  font-size: 13px;
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

<style>
/* CSS custom properties for child admin pages */
.admin-layout {
  --bg-page: #f3f4f6;
  --bg-card: #ffffff;
  --bg-hover: #f3f4f6;
  --bg-input: #ffffff;
  --bg-row-hover: #f3f4f6;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --border-color: #d1d5db;
  --border-light: #e5e7eb;
  --accent: #667eea;
  --accent-bg: #eef2ff;
  --danger: #dc2626;
  --danger-bg: #fee2e2;
  --success: #059669;
  --success-bg: #d1fae5;
  --warning: #d97706;
  --warning-bg: #fef3c7;
  --tag-bg: #f3f4f6;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
}

.admin-layout.dark-mode {
  --bg-page: #0f172a;
  --bg-card: #1e293b;
  --bg-hover: #334155;
  --bg-input: #0f172a;
  --bg-row-hover: #334155;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border-color: #334155;
  --border-light: #334155;
  --accent-bg: #1e293b;
  --danger-bg: #450a0a;
  --success-bg: #064e3b;
  --warning-bg: #78350f;
  --tag-bg: #334155;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.15);
}
</style>
