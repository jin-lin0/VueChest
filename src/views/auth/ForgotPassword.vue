<template>
  <div class="forgot-page">
    <div class="forgot-container">
      <div class="forgot-card">
        <div class="forgot-header">
          <router-link to="/" class="logo-link">
            <span class="logo-icon">🧰</span>
            <h1>VueChest</h1>
          </router-link>
          <p class="subtitle">重置你的密码</p>
        </div>

        <form @submit.prevent="handleReset" class="forgot-form">
          <div class="form-group">
            <label>邮箱</label>
            <input
              v-model="email"
              type="email"
              placeholder="注册时使用的邮箱"
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
                <span v-if="sendingCode" class="vc-btn-spinner vc-spinner-sm"></span>
                {{ sendBtnText }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>新密码</label>
            <input
              v-model="newPassword"
              type="password"
              placeholder="至少6个字符"
              class="form-input"
              :disabled="authStore.isLoading"
              autocomplete="new-password"
            />
          </div>

          <div class="form-group">
            <label>确认新密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="再次输入新密码"
              class="form-input"
              :disabled="authStore.isLoading"
            />
          </div>

          <p v-if="error" class="form-error">{{ error }}</p>
          <p v-if="authStore.error && !error" class="form-error">{{ authStore.error }}</p>

          <button type="submit" class="submit-btn" :disabled="authStore.isLoading || !isFormValid">
            <span v-if="authStore.isLoading" class="vc-btn-spinner"></span>
            {{ authStore.isLoading ? '重置中...' : '重置密码' }}
          </button>
        </form>

        <div class="forgot-footer">
          <router-link to="/login" class="link">返回登录</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCountdown } from '@/composables/useCountdown'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')

// 验证码倒计时
const { count: countdown, start: startCountdown } = useCountdown(60)
const sendingCode = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const canSendCode = computed(() => EMAIL_RE.test(email.value) && countdown.value === 0)

const sendBtnText = computed(() => {
  if (sendingCode.value) return '发送中'
  if (countdown.value > 0) return `${countdown.value}s 后重发`
  return '发送验证码'
})

async function handleSendCode() {
  error.value = ''
  if (!EMAIL_RE.test(email.value)) {
    error.value = '请输入有效的邮箱地址'
    return
  }

  sendingCode.value = true
  const result = await authStore.sendResetCode(email.value)
  sendingCode.value = false

  if (result.success) {
    startCountdown(result.cooldown || 60)
  } else {
    error.value = result.message
  }
}

const isFormValid = computed(
  () =>
    EMAIL_RE.test(email.value) &&
    code.value.length === 6 &&
    newPassword.value.length >= 6 &&
    newPassword.value === confirmPassword.value,
)

async function handleReset() {
  error.value = ''

  if (!EMAIL_RE.test(email.value)) {
    error.value = '请输入有效的邮箱地址'
    return
  }
  if (code.value.length !== 6) {
    error.value = '请输入6位验证码'
    return
  }
  if (newPassword.value.length < 6) {
    error.value = '新密码至少需要6个字符'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  const result = await authStore.resetPassword({
    email: email.value,
    code: code.value,
    newPassword: newPassword.value,
  })

  if (result.success) {
    router.push('/login')
  }
}
</script>

<style scoped>
.forgot-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-page) 0%, var(--bg-subtle) 100%);
  padding: 24px;
}

.forgot-container {
  width: 100%;
  max-width: 400px;
}

.forgot-card {
  background: var(--bg-card);
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.forgot-header {
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

.forgot-footer {
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
