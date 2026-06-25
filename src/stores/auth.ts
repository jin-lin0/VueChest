import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/request'

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
      const { data } = await api.post<{ data: { token: string; user: UserInfo } }>('/api/auth/login', credentials, { auth: false })

      token.value = data.token
      user.value = data.user

      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.user))

      return { success: true, message: '登录成功', role: data.user.role }
    } catch (e) {
      const message = e instanceof Error ? e.message : '网络连接失败，请检查服务器是否运行'
      error.value = message
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }

  async function register(credentials: LoginCredentials & { email?: string }): Promise<{ success: boolean; message: string }> {
    isLoading.value = true
    error.value = null

    try {
      const { data } = await api.post<{ data: { token: string; user: UserInfo } }>('/api/auth/register', credentials, { auth: false })

      token.value = data.token
      user.value = data.user

      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.user))

      return { success: true, message: '注册成功' }
    } catch (e) {
      const message = e instanceof Error ? e.message : '网络连接失败，请检查服务器是否运行'
      error.value = message
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUserInfo(): Promise<boolean> {
    if (!token.value) return false

    try {
      const { data } = await api.get<{ data: UserInfo }>('/api/auth/me')
      user.value = data
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data))
      return true
    } catch {
      logout()
      return false
    }
  }

  async function syncInstalledApps(appIds: number[]) {
    if (!token.value || !user.value) return
    try {
      await api.put('/api/auth/installed-apps', { installedApps: appIds })
      user.value = { ...user.value, installedApps: appIds }
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(user.value))
    } catch {
      // ignore sync errors
    }
  }

  async function fetchInstalledApps(): Promise<number[]> {
    if (!token.value) return []
    try {
      const { data } = await api.get<{ data: number[] }>('/api/auth/installed-apps')
      return data
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
