<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores'

const router = useRouter()
const authStore = useAuthStore()

const showDropdown = ref(false)

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function closeDropdown() {
  showDropdown.value = false
}

function goToLogin() {
  showDropdown.value = false
  router.push('/login')
}

function getRoleLabel(role?: string) {
  const roles: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    user: '普通用户',
  }
  return roles[role || ''] || role || ''
}

function handleLogout() {
  authStore.logout()
  showDropdown.value = false
}
</script>

<template>
  <div class="login-dropdown" @click.stop>
    <button class="user-btn" @click="toggleDropdown">
      <span class="user-icon">👤</span>
      <span v-if="authStore.isAuthenticated" class="user-name">{{ authStore.user?.username }}</span>
    </button>

    <div v-if="showDropdown" class="dropdown-menu" @click="closeDropdown">
      <template v-if="authStore.isAuthenticated">
        <div class="dropdown-info">
          <span class="dropdown-role">{{ getRoleLabel(authStore.user?.role) }}</span>
        </div>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item upload-link" @click.stop="$router.push('/market/upload')">
          📤 上传应用
        </button>
        <button v-if="authStore.isAdmin" class="dropdown-item" @click.stop="$router.push('/admin')">
          ⚙️ 管理后台
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item logout" @click.stop="handleLogout">
          退出登录
        </button>
      </template>
      <template v-else>
        <button class="dropdown-item" @click.stop="goToLogin">
          登录
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.login-dropdown {
  position: relative;
}

.user-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.user-btn:hover {
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
}

.user-icon {
  font-size: 1.1rem;
}

.user-name {
  color: #2c3e50;
  font-weight: 600;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  animation: dropIn 0.15s ease;
  overflow: hidden;
}

@keyframes dropIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-info {
  padding: 0.8rem 1rem;
  color: #8e99a4;
  font-size: 0.8rem;
}

.dropdown-role {
  font-weight: 500;
}

.dropdown-divider {
  height: 1px;
  background: #f0f0f0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #2c3e50;
  transition: background-color 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(102, 126, 234, 0.06);
}

.dropdown-item.logout {
  color: #e74c3c;
}

.upload-link {
  color: #667eea;
  font-weight: 600;
}
</style>
