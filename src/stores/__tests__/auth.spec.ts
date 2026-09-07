import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { TOKEN_KEY, USER_INFO_KEY } from '@/lib/constants'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

vi.mock('@/lib/request', () => ({
  api: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useAuthStore, type UserInfo } from '../auth'

const user: UserInfo = {
  id: 1,
  username: 'tester',
  role: 'user',
  isActive: true,
  installedApps: [],
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.apiGet.mockReset()
  mocks.apiPost.mockReset()
  const values = new Map<string, string>([
    [TOKEN_KEY, 'token'],
    [USER_INFO_KEY, JSON.stringify(user)],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

describe('auth initialization', () => {
  it('shares concurrent initialization and only validates the token once', async () => {
    mocks.apiGet.mockResolvedValue({ data: user })
    const store = useAuthStore()

    await Promise.all([store.initAuth(), store.initAuth(), store.initAuth()])
    await store.initAuth()

    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/auth/me', { timeoutMs: 10_000 })
    expect(store.isInitialized).toBe(true)
    expect(store.user).toEqual(user)
  })

  it('does not restore a logged-out user from a late profile response', async () => {
    let finish!: (value: { data: UserInfo }) => void
    mocks.apiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const store = useAuthStore()
    const pending = store.fetchUserInfo()
    store.clearAuth()
    finish({ data: user })
    expect(await pending).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem(USER_INFO_KEY)).toBeNull()
  })

  it('old 401 and logout responses cannot clear a new login', async () => {
    let fail!: (reason: unknown) => void
    mocks.apiGet.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    const store = useAuthStore()
    const old = store.fetchUserInfo()
    mocks.apiPost.mockResolvedValue({ data: { token: 'new-token', user: { ...user, id: 2 } } })
    await store.login({ username: 'new', password: 'local' })
    fail({ status: 401 })
    await old
    expect(store.token).toBe('new-token')
    let finish!: () => void
    mocks.apiPost.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const logout = store.logout()
    expect(store.token).toBeNull()
    await store.login({ username: 'new', password: 'local' })
    finish()
    await logout
    expect(store.token).toBe('new-token')
  })

  it('explicit auth clear invalidates a pending login and settles loading', async () => {
    let finish!: (value: unknown) => void
    mocks.apiPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const store = useAuthStore()
    const login = store.login({ username: 'old', password: 'local' })
    store.clearAuth()
    finish({ data: { token: 'old-token', user } })
    expect((await login).success).toBe(false)
    expect(store.token).toBeNull()
    expect(store.isLoading).toBe(false)
  })
})
