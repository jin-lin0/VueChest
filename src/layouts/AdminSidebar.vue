<script setup lang="ts">
import { useRoute } from 'vue-router'
import type { UserInfo } from '@/stores/auth'

interface AdminMenuItem {
  path: string
  name: string
  icon: string
}

defineProps<{
  collapsed: boolean
  mobile?: boolean
  menuItems: AdminMenuItem[]
  user: UserInfo | null
  isDark: boolean
  roleLabel: string
}>()

const emit = defineEmits<{
  select: []
  'toggle-collapse': []
  'toggle-dark': []
  logout: []
  'upload-avatar': [event: Event]
}>()

const route = useRoute()

function isRouteActive(path: string) {
  if (path === '/admin') return route.path === '/admin'
  return route.path === path || route.path.startsWith(path + '/')
}
</script>

<template>
  <div class="admin-sidebar" :class="{ 'dark-mode': isDark }">
    <div class="sidebar-header">
      <div class="logo">
        <span class="logo-icon">⚙️</span>
        <span v-if="!collapsed" class="logo-text">VueChest 后台</span>
      </div>
      <button
        v-if="!mobile"
        class="collapse-btn"
        @click="emit('toggle-collapse')"
        :title="collapsed ? '展开' : '收起'"
      >
        {{ collapsed ? '→' : '←' }}
      </button>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section-label" v-if="!collapsed">导航菜单</div>
      <router-link
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isRouteActive(item.path) }"
        @click="emit('select')"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span v-if="!collapsed" class="nav-text">{{ item.name }}</span>
        <span v-if="!collapsed && isRouteActive(item.path)" class="nav-indicator"></span>
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <div class="user-info" v-if="user">
        <label class="user-avatar" title="更换头像">
          <img v-if="user.avatar" :src="user.avatar" alt="用户头像" />
          <span v-else>{{ user.username.charAt(0).toUpperCase() }}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            @change="emit('upload-avatar', $event)"
          />
        </label>
        <div v-if="!collapsed" class="user-details">
          <div class="user-name">{{ user.username }}</div>
          <div class="user-role">{{ roleLabel }}</div>
        </div>
      </div>
      <div class="footer-actions">
        <button
          class="theme-toggle"
          @click="emit('toggle-dark')"
          :title="isDark ? '亮色模式' : '暗色模式'"
        >
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <button class="logout-btn" @click="emit('logout')" title="退出登录">
          <span>🚪</span>
          <span v-if="!collapsed">退出登录</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== Sidebar header ===== */
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
  color: var(--text-muted);
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

/* ===== Navigation ===== */
.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
  min-height: 0;
}

.nav-section-label {
  font-size: 11px;
  color: var(--text-muted);
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
  color: var(--text-secondary);
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
  background: var(--bg-glass-soft);
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

/* ===== Sidebar footer ===== */
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
  color: var(--text-secondary);
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
  color: var(--text-secondary);
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
</style>
