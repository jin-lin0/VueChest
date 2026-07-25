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
              placeholder="至少3个字符，不能使用邮箱格式"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label>邮箱</label>
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
            <label>验证码</label>
            <div class="code-row">
              <input
                v-model="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="6位验证码"
                class="form-input code-input"
                :disabled="authStore.isLoading"
                autocomplete="one-time-code"
              />
              <button
                type="button"
                class="send-code-btn"
                :disabled="!canSendCode || authStore.isLoading"
                @click="handleSendCode"
              >
                <span v-if="sendingCode" class="btn-spinner btn-spinner-sm"></span>
                {{ sendBtnText }}
              </button>
            </div>
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
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'

const router = useRouter()
const authStore = useAuthStore()
const marketStore = useMarketStore()

const username = ref('')
const email = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')

// 验证码倒计时
const countdown = ref(0)
const sendingCode = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const canSendCode = computed(() => EMAIL_RE.test(email.value) && countdown.value === 0)

const sendBtnText = computed(() => {
  if (sendingCode.value) return '发送中'
  if (countdown.value > 0) return `${countdown.value}s 后重发`
  return '发送验证码'
})

function startCountdown(seconds: number) {
  countdown.value = seconds
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      countdown.value = 0
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }, 1000)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

async function handleSendCode() {
  error.value = ''
  if (!EMAIL_RE.test(email.value)) {
    error.value = '请输入有效的邮箱地址'
    return
  }

  sendingCode.value = true
  const result = await authStore.sendVerificationCode(email.value)
  sendingCode.value = false

  if (result.success) {
    startCountdown(result.cooldown || 60)
  } else {
    error.value = result.message
  }
}

const isFormValid = computed(
  () =>
    username.value.length >= 3 &&
    !EMAIL_RE.test(username.value) &&
    EMAIL_RE.test(email.value) &&
    code.value.length === 6 &&
    password.value.length >= 6 &&
    password.value === confirmPassword.value,
)

async function handleRegister() {
  error.value = ''

  if (username.value.length < 3) {
    error.value = '用户名至少需要3个字符'
    return
  }
  if (EMAIL_RE.test(username.value)) {
    error.value = '用户名不能是邮箱格式，请使用普通用户名'
    return
  }
  if (!EMAIL_RE.test(email.value)) {
    error.value = '请输入有效的邮箱地址'
    return
  }
  if (code.value.length !== 6) {
    error.value = '请输入6位验证码'
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
    email: email.value,
    code: code.value,
  })

  if (result.success) {
    await syncInitialApps()
    router.push('/')
  }
}

async function syncInitialApps() {
  // 注册后把本地已安装的 App 同步到服务端
  await marketStore.syncToServer()
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-page) 0%, var(--bg-subtle) 100%);
  padding: 24px;
}

.register-container {
  width: 100%;
  max-width: 400px;
}

.register-card {
  background: var(--bg-card);
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
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-body);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
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

.code-row {
  display: flex;
  gap: 10px;
}

.code-input {
  flex: 1;
  letter-spacing: 4px;
  font-weight: 600;
}

.code-input::placeholder {
  font-weight: 400;
  letter-spacing: 0;
}

.send-code-btn {
  flex-shrink: 0;
  padding: 12px 16px;
  background: var(--bg-card);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.send-code-btn:hover:not(:disabled) {
  background: var(--accent);
  color: white;
}

.send-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: var(--border);
  color: var(--text-muted);
  background: var(--bg-subtle);
}

.btn-spinner-sm {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

.form-error {
  color: var(--danger);
  font-size: 14px;
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

.register-footer {
  text-align: center;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 14px;
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
