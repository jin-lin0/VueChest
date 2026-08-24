import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/request'
import { TOKEN_KEY, USER_INFO_KEY } from '@/lib/constants'

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

export interface UserSessionInfo {
  id: string
  deviceName: string
  ip?: string
  lastActiveAt: string
  expiresAt: string
  createdAt: string
  isCurrent: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserInfo | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const sessions = ref<UserSessionInfo[]>([])
  const isInitialized = ref(false)
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')

  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'super_admin')

  function initAuth(): Promise<void> {
    if (isInitialized.value) return Promise.resolve()
    if (initPromise) return initPromise

    initPromise = (async () => {
      if (!token.value) return
      try {
        const savedUser = localStorage.getItem(USER_INFO_KEY)
        if (savedUser) user.value = JSON.parse(savedUser)
        await fetchUserInfo()
      } catch {
        clearAuth()
      }
    })().finally(() => {
      isInitialized.value = true
      initPromise = null
    })

    return initPromise
  }

  async function login(
    credentials: LoginCredentials,
  ): Promise<{ success: boolean; message: string; role?: string }> {
    isLoading.value = true
    error.value = null

    try {
      const { data } = await api.post<{ data: { token: string; user: UserInfo } }>(
        '/api/auth/login',
        credentials,
        { auth: false },
      )

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

  async function sendVerificationCode(
    email: string,
  ): Promise<{ success: boolean; message: string; expiresIn?: number; cooldown?: number }> {
    isLoading.value = true
    error.value = null

    try {
      const { data } = await api.post<{ data: { expiresIn: number; cooldown: number } }>(
        '/api/auth/send-code',
        { email },
        { auth: false },
      )

      return {
        success: true,
        message: '验证码已发送',
        expiresIn: data.expiresIn,
        cooldown: data.cooldown,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '验证码发送失败'
      error.value = message
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }

  async function register(
    credentials: LoginCredentials & { email?: string; code?: string },
  ): Promise<{ success: boolean; message: string }> {
    isLoading.value = true
    error.value = null

    try {
      const { data } = await api.post<{ data: { token: string; user: UserInfo } }>(
        '/api/auth/register',
        credentials,
        { auth: false },
      )

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

  async function sendResetCode(
    email: string,
  ): Promise<{ success: boolean; message: string; expiresIn?: number; cooldown?: number }> {
    isLoading.value = true
    error.value = null

    try {
      const { data } = await api.post<{ data: { expiresIn: number; cooldown: number } }>(
        '/api/auth/forgot-password',
        { email },
        { auth: false },
      )

      return {
        success: true,
        message: '验证码已发送',
        expiresIn: data.expiresIn,
        cooldown: data.cooldown,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '验证码发送失败'
      error.value = message
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }

  async function resetPassword(payload: {
    email: string
    code: string
    newPassword: string
  }): Promise<{ success: boolean; message: string }> {
    isLoading.value = true
    error.value = null

    try {
      await api.post('/api/auth/reset-password', payload, { auth: false })
      return { success: true, message: '密码重置成功' }
    } catch (e) {
      const message = e instanceof Error ? e.message : '密码重置失败'
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
    } catch (error) {
      const status = (error as { status?: number })?.status
      if (status === 401 || status === 403) clearAuth()
      return false
    }
  }

  async function updateProfile(payload: {
    username?: string
  }): Promise<{ success: boolean; message: string }> {
    try {
      const { data } = await api.put<{ data: UserInfo }>('/api/auth/me', payload)
      user.value = data
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(data))
      return { success: true, message: '资料已更新' }
    } catch (e) {
      const message = e instanceof Error ? e.message : '资料更新失败，请稍后重试'
      error.value = message
      return { success: false, message }
    }
  }

  // 安装/卸载会改变本地已安装列表，同步刷新 auth_user_info 缓存里的 installedApps，
  // 否则下次启动 syncFromServer 会以陈旧的 auth_user_info 为准把已卸载应用拉回来。
  function setInstalledApps(ids: number[]) {
    if (!user.value) return
    user.value.installedApps = ids
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user.value))
  }

  function clearAuth() {
    token.value = null
    user.value = null
    sessions.value = []
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_INFO_KEY)
    error.value = null
  }

  async function logout() {
    if (token.value) await api.post('/api/auth/logout').catch(() => {})
    clearAuth()
  }

  async function fetchSessions() {
    const { data } = await api.get<{ data: UserSessionInfo[] }>('/api/auth/sessions')
    sessions.value = data
    return data
  }

  async function revokeSession(id: string) {
    const { data } = await api.delete<{ data: { revokedCurrent: boolean } }>(
      `/api/auth/sessions/${id}`,
    )
    if (data.revokedCurrent) clearAuth()
    else await fetchSessions()
  }

  async function revokeOtherSessions() {
    await api.delete('/api/auth/sessions/others')
    await fetchSessions()
  }

  return {
    token,
    user,
    isLoading,
    error,
    sessions,
    isInitialized,
    isAuthenticated,
    isSuperAdmin,
    isAdmin,
    initAuth,
    login,
    register,
    sendVerificationCode,
    sendResetCode,
    resetPassword,
    fetchUserInfo,
    updateProfile,
    setInstalledApps,
    fetchSessions,
    revokeSession,
    revokeOtherSessions,
    clearAuth,
    logout,
  }
})
