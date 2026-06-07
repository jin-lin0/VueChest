import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface UserInfo {
  id: number
  username: string
  email?: string
  avatar?: string
  role: 'user' | 'admin' | 'super_admin'
  isActive: boolean
  installedApps: number[]
  createdAt?: string
  lastLoginAt?: string
}

export interface LoginCredentials {
  username: string
  password: string
}

const TOKEN_KEY = 'admin_auth_token'
const USER_INFO_KEY = 'admin_info'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserInfo | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')

  const isAdmin = computed(() =>
    user.value?.role === 'admin' || user.value?.role === 'super_admin'
  )

  const isLoggedInUser = computed(() => isAuthenticated.value)

  async function initAuth() {
    if (!token.value) return

    try {
      const savedUser = localStorage.getItem(USER_INFO_KEY)
      if (savedUser) {
        const parsed = JSON.parse(savedUser)
        if (parsed.installedApps && typeof parsed.installedApps === 'string') {
          try {
            parsed.installedApps = JSON.parse(parsed.installedApps)
          } catch {
            parsed.installedApps = []
          }
        }
        user.value = parsed
      } else {
        await fetchUserInfo()
      }
    } catch {
      logout()
    }
  }

  async function login(credentials: LoginCredentials): Promise<{ success: boolean; message: string; role?: string }> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        error.value = data.error || '登录失败'
        return { success: false, message: data.error || '登录失败' }
      }

      token.value = data.data.token
      user.value = data.data.user

      localStorage.setItem(TOKEN_KEY, data.data.token)
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.data.user))

      return { success: true, message: '登录成功', role: data.data.user.role }
    } catch {
      error.value = '网络连接失败，请检查服务器是否运行'
      return { success: false, message: '网络连接失败，请检查服务器是否运行' }
    } finally {
      isLoading.value = false
    }
  }

  async function register(credentials: LoginCredentials & { email?: string }): Promise<{ success: boolean; message: string }> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        error.value = data.error || '注册失败'
        return { success: false, message: data.error || '注册失败' }
      }

      token.value = data.data.token
      user.value = data.data.user

      localStorage.setItem(TOKEN_KEY, data.data.token)
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.data.user))

      return { success: true, message: '注册成功' }
    } catch {
      error.value = '网络连接失败，请检查服务器是否运行'
      return { success: false, message: '网络连接失败，请检查服务器是否运行' }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUserInfo(): Promise<boolean> {
    if (!token.value) return false

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token.value}` },
      })

      if (!response.ok) {
        logout()
        return false
      }

      const data = await response.json()
      user.value = data.data
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.data))
      return true
    } catch {
      logout()
      return false
    }
  }

  async function syncInstalledApps(appIds: number[]) {
    if (!token.value || !user.value) return
    try {
      await fetch(`${API_BASE}/api/auth/installed-apps`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({ installedApps: appIds }),
      })
      user.value = { ...user.value, installedApps: appIds }
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(user.value))
    } catch {
      // ignore sync errors
    }
  }

  async function fetchInstalledApps(): Promise<number[]> {
    if (!token.value) return []
    try {
      const res = await fetch(`${API_BASE}/api/auth/installed-apps`, {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      const json = await res.json()
      if (json.success) return json.data
      return []
    } catch {
      return []
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_INFO_KEY)
    error.value = null
  }

  function clearError() {
    error.value = null
  }

  return {
    token,
    user,
    isLoading,
    error,
    isAuthenticated,
    isSuperAdmin,
    isAdmin,
    isLoggedInUser,
    initAuth,
    login,
    register,
    fetchUserInfo,
    syncInstalledApps,
    fetchInstalledApps,
    logout,
    clearError,
  }
})
