import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, getActivePinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  patch: vi.fn(),
  local: new Map<string, string>(),
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  workspace: {
    ownerId: 1 as number | null,
    config: { workspaces: [{ id: 'local', name: 'Local' }] },
    fetchCloudWorkspace: vi.fn(),
    applyCloudWorkspace: vi.fn(),
    restoreLocalConfig: vi.fn(),
    lastSyncedAt: null as number | null,
    pushToServer: vi.fn(),
    downloadCloudWorkspace: vi.fn(),
    deleteCloudWorkspace: vi.fn(),
    setCloudSyncEnabled: vi.fn(),
  },
}))

vi.mock('@/config', () => ({
  STORAGE_KEYS: {
    INTERVIEW_PRACTICED: 'interview-practiced',
    INTERVIEW_LEARNING: 'interview-learning',
    API_MANAGER_USER_APIS: 'api-user',
    API_MANAGER_PINNED_IDS: 'api-pinned',
    API_MANAGER_ENVIRONMENTS: 'api-envs',
    API_MANAGER_ACTIVE_ENVIRONMENT: 'api-active-env',
    API_MANAGER_COLLECTIONS: 'api-collections',
    API_MANAGER_ACTIVE_COLLECTION: 'api-active-collection',
    API_MANAGER_SAVED_REQUESTS: 'api-requests',
    MUSIC_VOLUME: 'music-volume',
    MUSIC_SEARCH_HISTORY: 'music-search',
    MUSIC_QUEUE: 'music-queue',
    MUSIC_PLAY_MODE: 'music-mode',
    STOCK_FAVORITES: 'stock-favorites',
    STOCK_ALERTS: 'stock-alerts',
    STOCK_NOTES: 'stock-notes',
    STOCK_POSITIONS: 'stock-positions',
  },
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
  removeStorage: (key: string) => mocks.storage.delete(key),
  applyStoragePatch: mocks.patch,
}))

vi.mock('@/lib/request', () => ({ api: mocks.api }))
vi.mock('../workspace', async () => {
  const { reactive } = await import('vue')
  mocks.workspace = reactive(mocks.workspace)
  return { useWorkspaceStore: () => mocks.workspace }
})

import { useCloudSyncStore } from '../cloudSync'

afterEach(() => {
  disposePinia(getActivePinia()!)
  vi.unstubAllGlobals()
})

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.storage.clear()
  mocks.local.clear()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mocks.local.get(key) ?? null,
    setItem: (key: string, value: string) => mocks.local.set(key, value),
    removeItem: (key: string) => mocks.local.delete(key),
  })
  mocks.workspace.ownerId = 1
  mocks.patch.mockReset().mockImplementation(async (data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value === null) mocks.storage.delete(key)
      else mocks.storage.set(key, structuredClone(value))
    }
  })
  mocks.workspace.fetchCloudWorkspace.mockResolvedValue(null)
  mocks.workspace.applyCloudWorkspace.mockResolvedValue(undefined)
  mocks.workspace.restoreLocalConfig.mockResolvedValue(undefined)
  mocks.workspace.pushToServer.mockResolvedValue(true)
})

describe('selective cloud sync', () => {
  it('uses conservative defaults and persists category choices', () => {
    const store = useCloudSyncStore()
    expect(store.selection).toEqual(['workspace', 'toolbox', 'interview'])

    store.setCategoryEnabled('api-manager', true)
    expect(store.selection).toContain('api-manager')
    expect(mocks.storage.get('cloud-sync:selection')).toContain('api-manager')
    expect(mocks.workspace.setCloudSyncEnabled).toHaveBeenLastCalledWith(true)
  })

  it('uploads only selected category snapshots while preserving existing cloud categories', async () => {
    mocks.storage.set('cloud-sync:selection', ['toolbox', 'interview'])
    mocks.storage.set('interview-learning', { version: 1, records: { 1: { status: 'mastered' } } })
    mocks.local.set('dev-toolbox:pipeline:presets', '[{"name":"clean"}]')
    const store = useCloudSyncStore()
    store.remote = {
      version: 1,
      selection: ['music'],
      categories: {
        music: { updatedAt: 1, data: { storage: { 'music-mode': 'random' } } },
      },
      updatedAt: 1,
    }
    mocks.api.get.mockResolvedValue({
      data: { config: store.remote, updatedAt: new Date().toISOString() },
    })
    mocks.api.put.mockImplementation(async (_path: string, body: { config: unknown }) => ({
      data: { config: body.config, updatedAt: new Date().toISOString() },
    }))

    await store.uploadSelected()

    const body = mocks.api.put.mock.calls[0][1]
    expect(body.config.selection).toEqual(['toolbox', 'interview'])
    expect(body.config.categories.music).toBeTruthy()
    expect(body.config.categories.toolbox.data.localStorage['dev-toolbox:pipeline:presets']).toBe(
      '[{"name":"clean"}]',
    )
    expect(body.config.categories.interview.data.storage['interview-learning']).toBeTruthy()
    expect(mocks.workspace.pushToServer).not.toHaveBeenCalled()
  })

  it('downloads only selected categories and reports missing cloud copies', async () => {
    mocks.storage.set('cloud-sync:selection', ['interview', 'music'])
    const remote = {
      version: 1 as const,
      selection: ['interview', 'music'] as const,
      categories: {
        interview: {
          updatedAt: 2,
          data: { storage: { 'interview-learning': { version: 1, records: {} } } },
        },
      },
      updatedAt: 2,
    }
    mocks.api.get.mockResolvedValue({
      data: { config: remote, updatedAt: new Date().toISOString() },
    })
    const store = useCloudSyncStore()

    const result = await store.downloadSelected()

    expect(result.applied).toEqual(['interview'])
    expect(result.missing).toEqual(['music'])
    expect(mocks.storage.get('interview-learning')).toEqual({ version: 1, records: {} })
  })
})

describe('cloud backup and recovery', () => {
  function prepareRemote(ids: string[] = ['interview']) {
    mocks.storage.set('cloud-sync:selection', ids)
    mocks.storage.set('interview-learning', { records: { local: true } })
    mocks.api.get.mockResolvedValue({
      data: {
        config: {
          version: 1,
          selection: ids,
          updatedAt: 2,
          categories: {
            interview: {
              updatedAt: 2,
              data: { storage: { 'interview-learning': { records: { cloud: true } } } },
            },
          },
        },
        updatedAt: '2026-09-07',
      },
    })
    return useCloudSyncStore()
  }

  it('previews without changing local data, saves a durable backup first, and can undo a restore', async () => {
    const store = prepareRemote()
    const preview = await store.prepareDownload()
    expect(mocks.storage.get('interview-learning')).toEqual({ records: { local: true } })
    expect(preview.entries[0]).toMatchObject({ id: 'interview', available: true })
    await store.downloadSelected(preview)
    expect(mocks.patch.mock.calls[0][0]).toHaveProperty('cloud-sync:backup:1')
    expect(mocks.storage.get('interview-learning')).toEqual({ records: { cloud: true } })
    await store.restoreBackup()
    expect(mocks.storage.get('interview-learning')).toEqual({ records: { local: true } })
    await store.restoreBackup()
    expect(mocks.storage.get('interview-learning')).toEqual({ records: { cloud: true } })
  })

  it('never overwrites local data if the backup cannot be persisted', async () => {
    const store = prepareRemote()
    const preview = await store.prepareDownload()
    mocks.patch.mockRejectedValueOnce(new Error('磁盘空间不足'))
    await expect(store.downloadSelected(preview)).rejects.toThrow('磁盘空间不足')
    expect(mocks.storage.get('interview-learning')).toEqual({ records: { local: true } })
    expect(store.isSyncing).toBe(false)
  })

  it('uses the reviewed snapshot even if the selection or cloud changes afterwards', async () => {
    const store = prepareRemote()
    const preview = await store.prepareDownload()
    store.setCategoryEnabled('interview', false)
    store.setCategoryEnabled('stock', true)
    store.remote!.categories.interview!.data.storage!['interview-learning'] = {
      records: { newer: true },
    }
    const result = await store.downloadSelected(preview)
    expect(result.applied).toEqual(['interview'])
    expect(mocks.storage.get('interview-learning')).toEqual({ records: { cloud: true } })
    await expect(store.downloadSelected(preview)).rejects.toThrow('重新预览')
  })

  it('distinguishes missing data from write failures and keeps the recovery point', async () => {
    const store = prepareRemote(['interview', 'music'])
    const realPatch = mocks.patch.getMockImplementation()!
    mocks.patch.mockImplementation(async (data: Record<string, unknown>) => {
      if ('interview-learning' in data) throw new Error('本地写入失败')
      await realPatch(data)
    })
    const result = await store.downloadSelected()
    expect(result.applied).toEqual([])
    expect(result.missing).toEqual(['music'])
    expect(result.failed).toEqual([{ id: 'interview', message: '本地写入失败' }])
    expect(store.localBackup?.categories.interview?.data.storage?.['interview-learning']).toEqual({
      records: { local: true },
    })
  })

  it('rejects a snapshot from an account that has since signed out', async () => {
    const store = prepareRemote()
    const preview = await store.prepareDownload()
    mocks.workspace.ownerId = null
    await expect(store.downloadSelected(preview)).rejects.toThrow('账号已切换')
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('restores workspaces locally without uploading the recovered state', async () => {
    const store = prepareRemote(['workspace'])
    mocks.workspace.fetchCloudWorkspace.mockResolvedValue({
      version: 1,
      workspaces: [{ id: 'cloud', name: 'Cloud' }],
      updatedAt: 2,
    })
    await store.downloadSelected()
    expect(mocks.workspace.applyCloudWorkspace).toHaveBeenCalledOnce()
    await store.restoreBackup()
    expect(mocks.workspace.restoreLocalConfig).toHaveBeenCalledWith(mocks.workspace.config)
    expect(mocks.workspace.pushToServer).not.toHaveBeenCalled()
  })

  it('invalidates a reviewed snapshot after switching away and back to its account', async () => {
    const store = prepareRemote()
    const preview = await store.prepareDownload()
    mocks.workspace.ownerId = 2
    mocks.workspace.ownerId = 1
    await expect(store.downloadSelected(preview)).rejects.toThrow('重新预览')
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('does not write an old recovery point under a new account after a restore failure', async () => {
    const store = prepareRemote()
    await store.downloadSelected()
    const original = mocks.patch.getMockImplementation()!
    mocks.patch.mockImplementation(async (patch: Record<string, unknown>) => {
      if ('interview-learning' in patch) {
        mocks.workspace.ownerId = 2
        throw new Error('Write failed')
      }
      await original(patch)
    })
    await expect(store.restoreBackup()).rejects.toThrow('账号已切换')
    expect(mocks.storage.has('cloud-sync:backup:2')).toBe(false)
    expect(store.localBackup).toBeNull()
  })
})
