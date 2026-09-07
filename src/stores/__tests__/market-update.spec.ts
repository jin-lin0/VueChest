import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  applyPatch: vi.fn(),
  auth: {
    token: null as string | null,
    user: null as { id: number } | null,
    setInstalledApps: vi.fn(),
  },
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorage: (key: string) => mocks.storage.delete(key),
  applyStoragePatch: mocks.applyPatch,
}))

vi.mock('@/lib/request', () => ({
  api: {
    get: mocks.apiGet,
    post: vi.fn(),
    put: mocks.apiPut,
    delete: vi.fn(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mocks.auth,
}))

import type { MarketAppItem } from '../market'
import { useMarketStore } from '../market'

afterEach(() => vi.unstubAllGlobals())

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
        data: {
          fileUrl: 'https://cdn.example.com/app.js',
          name: latest.name,
          version: latest.version,
        },
      })
    }
    return Promise.reject(new Error(`unexpected path: ${path}`))
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.storage.clear()
  mocks.apiGet.mockReset()
  mocks.apiPut.mockReset().mockResolvedValue({})
  mocks.auth.token = null
  mocks.auth.user = null
  mocks.applyPatch.mockReset().mockImplementation(async (patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) mocks.storage.delete(key)
      else mocks.storage.set(key, JSON.parse(JSON.stringify(value)))
    }
  })
  mocks.storage.set('market_installed_apps', [{ ...installed }])
  mocks.storage.set('market-bundle-1', 'old bundle')
  mockMarketApi()
})

describe('market app updates', () => {
  it('keeps displayed metadata unchanged when saving refreshed app information fails', async () => {
    const store = useMarketStore()
    store.initInstalledApps()
    mocks.applyPatch.mockRejectedValueOnce(new Error('磁盘空间不足'))
    await store.checkForUpdates({ force: true })
    expect(store.installedApps[0].description).toBe('旧版本')
    expect(store.updateCheckError).toBe('磁盘空间不足')
  })

  it('restores the installed version on a cache miss and discards it after uninstall', async () => {
    mocks.storage.delete('market-bundle-1')
    const original = mocks.apiGet.getMockImplementation()!
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/api/market/apps/1/versions')
        return Promise.resolve({ data: [{ id: 11, version: '1.0.0', status: 'active' }] })
      if (path === '/api/market/apps/1/versions/11/download')
        return Promise.resolve({ data: { fileUrl: 'https://cdn.example.com/old.js' } })
      return original(path)
    })
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const store = useMarketStore()
    store.initInstalledApps()
    const pending = store.ensureBundle(1)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/old.js'))
    await store.uninstallApp(1)
    finish(new Response('old bundle'))
    expect(await pending).toBeNull()
    expect(mocks.storage.has('market-bundle-1')).toBe(false)
  })

  it('uploads installation snapshots in order and ignores queued work after switching accounts', async () => {
    mocks.auth.token = 'account-one'
    mocks.auth.user = { id: 1 }
    const store = useMarketStore()
    let finish!: () => void
    mocks.apiPut.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const first = store.syncToServer([1])
    await vi.waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
    const second = store.syncToServer([1, 2])
    expect(mocks.apiPut).toHaveBeenCalledTimes(1)
    finish()
    await Promise.all([first, second])
    expect(mocks.apiPut.mock.calls[1][1]).toEqual({ installedApps: [1, 2] })
    const obsolete = store.syncToServer([1, 2, 3])
    mocks.auth.token = 'account-two'
    await obsolete
    expect(mocks.apiPut).toHaveBeenCalledTimes(2)
  })

  it('replaces the bundle only after a successful download', async () => {
    const bundle = new TextEncoder().encode('new bundle')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => bundle.buffer,
      }),
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
    expect(store.hasRollback(1)).toBe(true)

    await store.rollbackApp(1)
    expect(store.installedApps[0].version).toBe('1.0.0')
    expect(mocks.storage.get('market-bundle-1')).toBe('old bundle')
  })

  it('keeps the old version and bundle when the download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    )
    const store = useMarketStore()
    store.initInstalledApps()
    await store.checkForUpdates({ force: true })

    await expect(store.updateApp(1)).rejects.toThrow('应用包下载失败 (404)')

    expect(store.installedApps[0].version).toBe('1.0.0')
    expect(mocks.storage.get('market-bundle-1')).toBe('old bundle')
    expect(store.updateErrors[1]).toContain('404')
  })

  it('keeps the bundle, metadata and rollback point unchanged if durable commit fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('new bundle')))
    const store = useMarketStore()
    store.initInstalledApps()
    mocks.applyPatch.mockRejectedValueOnce(new Error('磁盘空间不足'))
    await expect(store.updateApp(1)).rejects.toThrow('磁盘空间不足')
    expect(store.installedApps[0].version).toBe('1.0.0')
    expect(mocks.storage.get('market-bundle-1')).toBe('old bundle')
    expect(store.hasRollback(1)).toBe(false)
  })

  it('does not expose the staged bundle when permissions need approval', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('expanded bundle')))
    const original = mocks.apiGet.getMockImplementation()!
    mocks.apiGet.mockImplementation((path: string) =>
      path.endsWith('/download')
        ? Promise.resolve({
            data: {
              fileUrl: 'https://cdn.example.com/app.js',
              version: '2.0.0',
              name: '测试',
              allowNetwork: ['new.example.com'],
            },
          })
        : original(path),
    )
    const store = useMarketStore()
    store.initInstalledApps()
    await expect(store.updateApp(1)).rejects.toThrow('新增联网权限')
    expect(mocks.applyPatch).not.toHaveBeenCalled()
    expect(mocks.storage.get('market-bundle-1')).toBe('old bundle')
  })

  it('coalesces duplicate installs and keeps uninstall unchanged on storage failure', async () => {
    let resolveFetch!: (value: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const store = useMarketStore()
    const first = store.installApp(1)
    const second = store.installApp(1)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    resolveFetch(new Response('new bundle'))
    await Promise.all([first, second])
    expect(store.installedApps).toHaveLength(1)
    mocks.applyPatch.mockRejectedValueOnce(new Error('持久化失败'))
    await expect(store.uninstallApp(1)).rejects.toThrow('持久化失败')
    expect(store.installedApps).toHaveLength(1)
    expect(mocks.storage.get('market-bundle-1')).toBe('new bundle')
  })
})
