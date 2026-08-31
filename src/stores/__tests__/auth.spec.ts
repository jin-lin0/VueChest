import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { TOKEN_KEY, USER_INFO_KEY } from '@/lib/constants'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/lib/request', () => ({
  api: {
    get: mocks.apiGet,
    post: vi.fn(),
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
})
