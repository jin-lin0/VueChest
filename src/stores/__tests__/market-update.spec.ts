import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  apiGet: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorage: (key: string) => mocks.storage.delete(key),
}))

vi.mock('@/lib/request', () => ({
  api: {
    get: mocks.apiGet,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: null,
    user: null,
    setInstalledApps: vi.fn(),
  }),
}))

import type { MarketAppItem } from '../market'
import { useMarketStore } from '../market'

const installed = {
  id: 1,
  name: '测试应用',
  icon: '🧩',
  route: '/market-installed/1',
  description: '旧版本',
  version: '1.0.0',
  installedAt: 100,
}

const latest: MarketAppItem = {
  id: 1,
  name: '测试应用',
  icon: '🧩',
  description: '新版本',
  version: '2.0.0',
  author: 'tester',
  category: '工具',
  size: 100,
  isOfficial: false,
  downloads: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

function mockMarketApi() {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === '/api/market/apps/1') return Promise.resolve({ data: latest })
    if (path === '/api/market/apps/1/download') {
      return Promise.resolve({
        data: { fileUrl: 'https://cdn.example.com/app.js', name: latest.name, version: latest.version },
      })
    }
    return Promise.reject(new Error(`unexpected path: ${path}`))
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.storage.clear()
  mocks.apiGet.mockReset()
  mocks.storage.set('market_installed_apps', [{ ...installed }])
  mocks.storage.set('market-bundle-1', 'old bundle')
  mockMarketApi()
})

describe('market app updates', () => {
  it('replaces the bundle only after a successful download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'new bundle' }),
    )
    const store = useMarketStore()
    store.initInstalledApps()

    await store.checkForUpdates({ force: true })
    expect(store.hasUpdate(1)).toBe(true)

    await store.updateApp(1)

    expect(store.installedApps[0].version).toBe('2.0.0')
    expect(store.installedApps[0].installedAt).toBe(100)
    expect(mocks.storage.get('market-bundle-1')).toBe('new bundle')
    expect(store.hasUpdate(1)).toBe(false)
  })

  it('keeps the old version and bundle when the download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' }),
    )
    const store = useMarketStore()
    store.initInstalledApps()
    await store.checkForUpdates({ force: true })

    await expect(store.updateApp(1)).rejects.toThrow('应用包下载失败 (404)')

    expect(store.installedApps[0].version).toBe('1.0.0')
    expect(mocks.storage.get('market-bundle-1')).toBe('old bundle')
    expect(store.updateErrors[1]).toContain('404')
  })
})
