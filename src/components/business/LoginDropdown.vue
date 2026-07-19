<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores'
import { api } from '@/lib/request'

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

async function uploadAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) return window.alert('头像不能超过 2MB')

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
    window.alert(error instanceof Error ? error.message : '头像上传失败，请稍后重试')
  }
}
</script>

<template>
  <div class="login-dropdown" @click.stop>
    <button class="user-btn" @click="toggleDropdown">
      <span class="user-icon">
        <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="用户头像" />
        <span v-else>👤</span>
      </span>
      <span v-if="authStore.isAuthenticated" class="user-name">{{ authStore.user?.username }}</span>
    </button>

    <div v-if="showDropdown" class="dropdown-menu" @click="closeDropdown">
      <template v-if="authStore.isAuthenticated">
        <div class="dropdown-info">
          <div class="profile-row">
            <div class="profile-avatar">
              <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="用户头像" />
              <span v-else>{{ authStore.user?.username?.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="profile-meta">
              <strong>{{ authStore.user?.username }}</strong>
              <span class="dropdown-role">{{ getRoleLabel(authStore.user?.role) }}</span>
            </div>
            <label class="avatar-upload">
              更换
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden @change="uploadAvatar" />
            </label>
          </div>
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
  background: var(--bg-glass);
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
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
}

.user-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.profile-avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 700;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-meta strong {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar-upload {
  flex: 0 0 auto;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--accent-light);
  border-radius: 6px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 0.85rem;
  cursor: pointer;
}

.avatar-upload:hover {
  background: var(--accent-light);
}

.user-name {
  color: var(--text-primary);
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
  background: var(--bg-glass);
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
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.dropdown-role {
  font-weight: 500;
}

.dropdown-divider {
  height: 1px;
  background: var(--border-light);
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
  color: var(--text-primary);
  transition: background-color 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(102, 126, 234, 0.06);
}

.dropdown-item.logout {
  color: var(--danger);
}

.upload-link {
  color: var(--accent);
  font-weight: 600;
}
</style>
