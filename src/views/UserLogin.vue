<template>
  <div class="user-login-page">
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <router-link to="/" class="logo-link">
            <span class="logo-icon">🧰</span>
            <h1>VueChest</h1>
          </router-link>
          <p class="subtitle">登录你的账号</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label>用户名</label>
            <input
              v-model="username"
              type="text"
              placeholder="输入用户名"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label>密码</label>
            <input
              v-model="password"
              type="password"
              placeholder="输入密码"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="current-password"
            />
          </div>

          <p v-if="authStore.error" class="form-error">{{ authStore.error }}</p>

          <button type="submit" class="submit-btn" :disabled="authStore.isLoading">
            <span v-if="authStore.isLoading" class="btn-spinner"></span>
            {{ authStore.isLoading ? '登录中...' : '登录' }}
          </button>
        </form>

        <div class="login-footer">
          <span>还没有账号？</span>
          <router-link to="/register" class="link">立即注册</router-link>
        </div>
        <div class="login-footer">
          <router-link to="/" class="link">返回首页</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const marketStore = useMarketStore()

const username = ref('')
const password = ref('')

async function handleLogin() {
  if (!username.value || !password.value) return

  const result = await authStore.login({
    username: username.value,
    password: password.value,
  })

  if (result.success) {
    // 登录后跨设备同步：
    // 1. 服务端有但本地没有 → 下载恢复
    // 2. 本地有但服务端没有 → 推送上去
    const serverIds = authStore.user?.installedApps || []
    const localIds = marketStore.installedApps.map((a) => a.id)
    const hasMissingOnLocal = serverIds.some((id) => !localIds.includes(id))
    const hasMissingOnServer = localIds.some((id) => !serverIds.includes(id))

    if (hasMissingOnLocal) {
      await marketStore.syncFromServer(serverIds)
    }
    if (hasMissingOnServer) {
      await marketStore.syncToServer()
    }

    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  }
}
</script>

<style scoped>
.user-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  padding: 24px;
}

.login-container {
  width: 100%;
  max-width: 400px;
}

.login-card {
  background: white;
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.login-header {
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
  to {
    transform: rotate(360deg);
  }
}

.login-footer {
  text-align: center;
  margin-top: 20px;
  color: #6b7280;
  font-size: 14px;
}

.sep {
  margin: 0 8px;
  color: #d1d5db;
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
