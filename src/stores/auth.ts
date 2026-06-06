import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface AdminInfo {
  id: number
  username: string
  email?: string
  role: 'super_admin' | 'admin'
  isActive: boolean
  createdAt?: string
  lastLoginAt?: string
}

export interface LoginCredentials {
  username: string
  password: string
}

const TOKEN_KEY = 'admin_auth_token'
const ADMIN_INFO_KEY = 'admin_info'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const admin = ref<AdminInfo | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const isAuthenticated = computed(() => !!token.value && !!admin.value)

  const isAdmin = computed(() => admin.value?.role === 'super_admin')

  // Actions
  /**
   * 初始化认证状态（从localStorage恢复）
   */
  async function initAuth() {
    if (!token.value) return

    try {
      const savedAdmin = localStorage.getItem(ADMIN_INFO_KEY)
      if (savedAdmin) {
        admin.value = JSON.parse(savedAdmin)
      } else {
        // 如果没有保存的管理员信息，尝试获取
        await fetchAdminInfo()
      }
    } catch (err) {
      console.error('恢复认证状态失败:', err)
      logout()
    }
  }

  /**
   * 管理员登录
   */
  async function login(credentials: LoginCredentials): Promise<{ success: boolean; message: string }> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        error.value = data.error || '登录失败'
        return { success: false, message: data.error || '登录失败' }
      }

      // 保存token和管理员信息
      token.value = data.data.token
      admin.value = data.data.admin

      localStorage.setItem(TOKEN_KEY, data.data.token)
      localStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(data.data.admin))

      return { success: true, message: '登录成功' }
    } catch (err) {
      console.error('登录错误:', err)
      error.value = '网络连接失败，请检查服务器是否运行'
      return { success: false, message: '网络连接失败，请检查服务器是否运行' }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 获取当前管理员信息
   */
  async function fetchAdminInfo(): Promise<boolean> {
    if (!token.value) return false

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token.value}`,
        },
      })

      if (!response.ok) {
        logout()
        return false
      }

      const data = await response.json()
      admin.value = data.data
      localStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(data.data))
      return true
    } catch (err) {
      console.error('获取管理员信息失败:', err)
      logout()
      return false
    }
  }

  /**
   * 登出
   */
  function logout() {
    token.value = null
    admin.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ADMIN_INFO_KEY)
    error.value = null
  }

  /**
   * 清除认证错误
   */
  function clearError() {
    error.value = null
  }

  return {
    // State
    token,
    admin,
    isLoading,
    error,
    // Getters
    isAuthenticated,
    isAdmin,
    // Actions
    initAuth,
    login,
    fetchAdminInfo,
    logout,
    clearError,
  }
})
