import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  local: new Map<string, string>(),
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  workspace: {
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
}))

vi.mock('@/lib/request', () => ({ api: mocks.api }))
vi.mock('../workspace', () => ({ useWorkspaceStore: () => mocks.workspace }))

import { useCloudSyncStore } from '../cloudSync'

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
