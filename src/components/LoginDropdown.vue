<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores'

const authStore = useAuthStore()

const showDropdown = ref(false)
const showLoginModal = ref(false)
const username = ref('')
const password = ref('')
const loginError = ref('')
const isLoggingIn = ref(false)

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function closeDropdown() {
  showDropdown.value = false
}

function openLoginModal() {
  showLoginModal.value = true
  showDropdown.value = false
  loginError.value = ''
  username.value = ''
  password.value = ''
}

async function handleLogin() {
  if (!username.value || !password.value) {
    loginError.value = '请输入用户名和密码'
    return
  }
  isLoggingIn.value = true
  loginError.value = ''
  const result = await authStore.login({
    username: username.value,
    password: password.value,
  })
  isLoggingIn.value = false
  if (result.success) {
    showLoginModal.value = false
  } else {
    loginError.value = result.message
  }
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
      <span v-if="authStore.isAuthenticated" class="user-name">{{ authStore.admin?.username }}</span>
    </button>

    <div v-if="showDropdown" class="dropdown-menu" @click="closeDropdown">
      <template v-if="authStore.isAuthenticated">
        <div class="dropdown-info">
          <span class="dropdown-role">{{ authStore.admin?.role === 'super_admin' ? '超级管理员' : '管理员' }}</span>
        </div>
        <div class="dropdown-divider"></div>
        <button v-if="authStore.isAdmin" class="dropdown-item upload-link" @click.stop="$router.push('/market/upload')">
          📤 上传应用
        </button>
        <button class="dropdown-item" @click.stop="$router.push('/admin')">
          ⚙️ 管理后台
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item logout" @click.stop="handleLogout">
          退出登录
        </button>
      </template>
      <template v-else>
        <button class="dropdown-item" @click.stop="openLoginModal">
          登录
        </button>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="showLoginModal" class="modal-overlay" @click.self="showLoginModal = false">
        <div class="login-modal">
          <div class="modal-header">
            <h3>管理员登录</h3>
            <button class="modal-close" @click="showLoginModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>用户名</label>
              <input
                v-model="username"
                type="text"
                placeholder="请输入用户名"
                @keyup.enter="handleLogin"
              />
            </div>
            <div class="form-group">
              <label>密码</label>
              <input
                v-model="password"
                type="password"
                placeholder="请输入密码"
                @keyup.enter="handleLogin"
              />
            </div>
            <p v-if="loginError" class="login-error">{{ loginError }}</p>
            <button class="login-btn" :disabled="isLoggingIn" @click="handleLogin">
              {{ isLoggingIn ? '登录中...' : '登录' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.login-modal {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #8e99a4;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  transition: all 0.15s ease;
  line-height: 1;
}

.modal-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #2c3e50;
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.4rem;
}

.form-group input {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.login-error {
  color: #e74c3c;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}

.login-btn {
  width: 100%;
  padding: 0.75rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.login-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
