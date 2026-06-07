<template>
  <div class="register-page">
    <div class="register-container">
      <div class="register-card">
        <div class="register-header">
          <router-link to="/" class="logo-link">
            <span class="logo-icon">🧰</span>
            <h1>VueChest</h1>
          </router-link>
          <p class="subtitle">创建新账号</p>
        </div>

        <form @submit.prevent="handleRegister" class="register-form">
          <div class="form-group">
            <label>用户名</label>
            <input
              v-model="username"
              type="text"
              placeholder="至少3个字符"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label>邮箱（选填）</label>
            <input
              v-model="email"
              type="email"
              placeholder="example@email.com"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label>密码</label>
            <input
              v-model="password"
              type="password"
              placeholder="至少6个字符"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="new-password"
            />
          </div>

          <div class="form-group">
            <label>确认密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              class="form-input"
              :disabled="authStore.isLoading"
            />
          </div>

          <p v-if="error" class="form-error">{{ error }}</p>
          <p v-if="authStore.error && !error" class="form-error">{{ authStore.error }}</p>

          <button type="submit" class="submit-btn" :disabled="authStore.isLoading || !isFormValid">
            <span v-if="authStore.isLoading" class="btn-spinner"></span>
            {{ authStore.isLoading ? '注册中...' : '注册' }}
          </button>
        </form>

        <div class="register-footer">
          <span>已有账号？</span>
          <router-link to="/login" class="link">立即登录</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'

const router = useRouter()
const authStore = useAuthStore()
const marketStore = useMarketStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')

const isFormValid = computed(() =>
  username.value.length >= 3 &&
  password.value.length >= 6 &&
  password.value === confirmPassword.value
)

async function handleRegister() {
  error.value = ''

  if (username.value.length < 3) {
    error.value = '用户名至少需要3个字符'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少需要6个字符'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  const result = await authStore.register({
    username: username.value,
    password: password.value,
    email: email.value || undefined,
  })

  if (result.success) {
    await syncInitialApps()
    router.push('/')
  }
}

async function syncInitialApps() {
  const localInstalled = marketStore.installedApps.map((a) => a.id)
  if (localInstalled.length > 0) {
    await authStore.syncInstalledApps(localInstalled)
  }
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  padding: 24px;
}

.register-container {
  width: 100%;
  max-width: 400px;
}

.register-card {
  background: white;
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.register-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.logo-icon {
  font-size: 32px;
}

.logo-link h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 15px;
  outline: none;
  transition: all 0.2s;
  background: white;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-error {
  color: #dc2626;
  font-size: 14px;
  margin: 0 0 16px;
  text-align: center;
}

.submit-btn {
  width: 100%;
  padding: 13px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.35);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.register-footer {
  text-align: center;
  margin-top: 20px;
  color: #6b7280;
  font-size: 14px;
}

.link {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}
</style>
