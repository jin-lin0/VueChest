<template>
  <div class="admin-login-page">
    <div class="login-bg-shapes">
      <div class="shape shape-1"></div>
      <div class="shape shape-2"></div>
      <div class="shape shape-3"></div>
    </div>

    <div class="login-container">
      <div class="login-header">
        <div class="logo">
          <span class="logo-icon">⚙️</span>
          <h1>管理后台</h1>
        </div>
        <p class="subtitle">VueChest 管理系统</p>
      </div>

      <div class="login-form-wrapper">
        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label for="username">
              <span class="label-icon">👤</span>
              用户名
            </label>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              class="form-input"
              :disabled="isLoading"
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label for="password">
              <span class="label-icon">🔒</span>
              密码
            </label>
            <div class="password-input-wrapper">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                class="form-input"
                :disabled="isLoading"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="toggle-password"
                @click="showPassword = !showPassword"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              >
                {{ showPassword ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>

          <div class="form-options">
            <label class="remember-me">
              <input type="checkbox" v-model="rememberMe" />
              <span>记住我</span>
            </label>
          </div>

          <div v-if="errorMessage" class="error-message">
            <span class="error-icon">⚠️</span>
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            class="login-btn"
            :disabled="isLoading || !username || !password"
          >
            <span v-if="isLoading" class="loading-spinner"></span>
            <span v-else class="btn-text">登录</span>
          </button>
        </form>

        <div class="login-footer">
          <a href="/" class="back-to-home">
            <span class="icon">←</span>
            返回首页
          </a>
        </div>
      </div>

      <div class="login-hint">
        <p>💡 管理员账号请联系系统管理员获取</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const rememberMe = ref(false)

const isLoading = computed(() => authStore.isLoading)
const errorMessage = computed(() => authStore.error)

onMounted(() => {
  const saved = localStorage.getItem('admin_remembered_username')
  if (saved) {
    username.value = saved
    rememberMe.value = true
  }
})

async function handleLogin() {
  if (!username.value.trim() || !password.value) return

  if (rememberMe.value) {
    localStorage.setItem('admin_remembered_username', username.value.trim())
  } else {
    localStorage.removeItem('admin_remembered_username')
  }

  const result = await authStore.login({
    username: username.value.trim(),
    password: password.value,
  })

  if (result.success) {
    const redirect = (route.query.redirect as string) || '/admin'
    router.push(redirect)
  }
}
</script>

<style scoped>
.admin-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.login-bg-shapes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.shape {
  position: absolute;
  border-radius: 50%;
  opacity: 0.05;
}

.shape-1 {
  width: 600px;
  height: 600px;
  background: #667eea;
  top: -200px;
  right: -100px;
}

.shape-2 {
  width: 400px;
  height: 400px;
  background: #764ba2;
  bottom: -100px;
  left: -100px;
}

.shape-3 {
  width: 300px;
  height: 300px;
  background: #667eea;
  bottom: 30%;
  right: 10%;
}

.login-container {
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 10px;
}

.logo-icon {
  font-size: 36px;
}

.logo h1 {
  margin: 0;
  font-size: 28px;
  color: white;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.login-form-wrapper {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.label-icon {
  font-size: 15px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 14px;
  transition: all 0.2s;
  outline: none;
  background: white;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.form-input:disabled {
  background: #f9fafb;
  cursor: not-allowed;
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-wrapper .form-input {
  padding-right: 48px;
}

.toggle-password {
  position: absolute;
  right: 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
  line-height: 1;
}

.toggle-password:hover {
  opacity: 1;
}

.form-options {
  display: flex;
  align-items: center;
}

.remember-me {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
}

.remember-me input {
  width: 16px;
  height: 16px;
  accent-color: #667eea;
  cursor: pointer;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #dc2626;
  font-size: 14px;
  animation: shake 0.4s ease;
}

.error-icon {
  flex-shrink: 0;
  font-size: 16px;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

.login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-text {
  letter-spacing: 2px;
}

.loading-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-footer {
  margin-top: 24px;
  text-align: center;
}

.back-to-home {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  color: #6b7280;
  text-decoration: none;
  font-size: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  transition: all 0.2s;
  background: white;
}

.back-to-home:hover {
  color: #667eea;
  border-color: #667eea;
  background: #f9fafb;
}

.back-to-home .icon {
  font-size: 16px;
}

.login-hint {
  margin-top: 24px;
  text-align: center;
  padding: 14px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
