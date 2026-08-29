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
            <label>用户名 / 邮箱</label>
            <input
              v-model="username"
              type="text"
              placeholder="输入用户名或邮箱"
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
            <span v-if="authStore.isLoading" class="vc-btn-spinner"></span>
            {{ authStore.isLoading ? '登录中...' : '登录' }}
          </button>
        </form>

        <div class="login-footer">
          <span>还没有账号？</span>
          <router-link to="/register" class="link">立即注册</router-link>
        </div>
        <div class="login-footer">
          <router-link to="/forgot-password" class="link">忘记密码？</router-link>
          <span class="sep">·</span>
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
    // 登录后跨设备同步：以服务端实时列表为唯一真源对账，不再依赖登录响应里的 installedApps 缓存
    await marketStore.syncWithServer()

    const redirect = route.query.redirect
    const safeRedirect =
      typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/'
    router.push(safeRedirect)
  }
}
</script>

<style scoped>
.user-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-page) 0%, var(--bg-subtle) 100%);
  padding: 24px;
}

.login-container {
  width: 100%;
  max-width: 400px;
}

.login-card {
  background: var(--bg-card);
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
  font-size: var(--font-size-6xl);
}

.logo-link h1 {
  margin: 0;
  font-size: var(--font-size-4xl);
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-body);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: var(--font-size-body-lg);
  outline: none;
  transition: all 0.2s;
  background: var(--bg-card);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-error {
  color: var(--danger);
  font-size: var(--font-size-body);
  margin: 0 0 16px;
  text-align: center;
}

.submit-btn {
  width: 100%;
  padding: 13px;
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: var(--font-size-body-lg);
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

.login-footer {
  text-align: center;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}

.sep {
  margin: 0 8px;
  color: var(--border);
}

.link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}
</style>
