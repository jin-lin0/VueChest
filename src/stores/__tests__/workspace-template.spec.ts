import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>() }))

vi.mock('@/config', () => ({
  APP_MODULES: [
    { id: 1, name: 'API 管理', icon: 'A', route: '/api-manager', description: 'API' },
  ],
  STORAGE_KEYS: {
    HOME_APP_ORDER: 'home_app_order',
    HOME_APP_HIDDEN: 'home_app_hidden',
    WORKSPACE_CONFIG_PREFIX: 'workspace-config',
  },
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => mocks.storage.set(key, value),
}))

vi.mock('@/lib/request', () => ({
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { useWorkspaceStore } from '../workspace'

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.storage.clear()
})

describe('workspace templates', () => {
  it('exports and imports app order without private app data', () => {
    const store = useWorkspaceStore()
    store.init()
    const exported = store.exportActiveWorkspace()
    expect(exported.version).toBe(1)
    expect(exported).not.toHaveProperty('recentApps')
    expect(exported).not.toHaveProperty('preferences')

    const id = store.importWorkspace({
      version: 1,
      name: '模板工作区',
      icon: 'T',
      appKeys: ['builtin:1', 'market:42', 'invalid-key', 'builtin:1'],
    })
    const imported = store.config.workspaces.find((item) => item.id === id)
    expect(imported?.items).toEqual([{ appKey: 'builtin:1' }, { appKey: 'market:42' }])
    expect(store.config.activeWorkspaceId).toBe(id)
  })
})
