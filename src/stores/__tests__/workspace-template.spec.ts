import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>() }))

vi.mock('@/config', () => ({
  APP_MODULES: [
    { id: 1, name: 'API 管理', icon: 'A', route: '/api-manager', description: 'API' },
    {
      id: 11,
      name: '赛车',
      icon: 'R',
      route: '/racing',
      description: 'Racing',
      defaultHidden: true,
    },
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

  it('deduplicates repeated app cards when loading a workspace', () => {
    mocks.storage.set('workspace-config:guest', {
      version: 1,
      activeWorkspaceId: 'workspace-1',
      workspaces: [
        {
          id: 'workspace-1',
          name: '我的工作台',
          icon: '⌂',
          items: [{ appKey: 'builtin:1' }, { appKey: 'market:42' }, { appKey: 'market:42' }],
        },
      ],
      recentApps: [],
      knownApps: ['builtin:1', 'market:42'],
      preferences: {
        showWorkspaceBar: true,
        showAppDescriptions: true,
        cardDensity: 'standard',
      },
      layoutUpdatedAt: 1,
    })

    const store = useWorkspaceStore()
    store.init()

    expect(store.activeWorkspace?.items).toEqual([{ appKey: 'builtin:1' }, { appKey: 'market:42' }])
  })

  it('keeps an individually added game while excluding it from a new default workspace', () => {
    mocks.storage.set('workspace-config:guest', {
      version: 1,
      activeWorkspaceId: 'workspace-1',
      workspaces: [
        {
          id: 'workspace-1',
          name: '我的工作台',
          icon: '⌂',
          items: [{ appKey: 'builtin:1' }, { appKey: 'builtin:11' }],
        },
      ],
      recentApps: [],
      knownApps: ['builtin:1', 'builtin:11'],
      preferences: {
        showWorkspaceBar: true,
        showAppDescriptions: true,
        cardDensity: 'standard',
      },
      layoutUpdatedAt: 1,
    })

    const store = useWorkspaceStore()
    store.init()

    expect(store.activeWorkspace?.items).toEqual([
      { appKey: 'builtin:1' },
      { appKey: 'builtin:11' },
    ])

    mocks.storage.clear()
    setActivePinia(createPinia())
    const freshStore = useWorkspaceStore()
    freshStore.init()
    expect(freshStore.activeWorkspace?.items).toEqual([{ appKey: 'builtin:1' }])
    expect(freshStore.config.knownApps).toContain('builtin:11')
  })

  it('records a restored app as known without adding a duplicate card', () => {
    mocks.storage.set('workspace-config:guest', {
      version: 1,
      activeWorkspaceId: 'workspace-1',
      workspaces: [
        {
          id: 'workspace-1',
          name: '我的工作台',
          icon: '⌂',
          items: [{ appKey: 'builtin:1' }, { appKey: 'market:42' }],
        },
      ],
      recentApps: [],
      knownApps: ['builtin:1'],
      preferences: {
        showWorkspaceBar: true,
        showAppDescriptions: true,
        cardDensity: 'standard',
      },
      layoutUpdatedAt: 1,
    })

    const store = useWorkspaceStore()
    store.init()
    store.reconcileAvailableApps(['builtin:1', 'market:42'])

    expect(store.activeWorkspace?.items).toEqual([{ appKey: 'builtin:1' }, { appKey: 'market:42' }])
    expect(store.config.knownApps).toContain('market:42')
    expect(store.config.layoutUpdatedAt).toBe(1)
  })

  it('still adds a newly installed app that is absent from every workspace', () => {
    const store = useWorkspaceStore()
    store.init()

    store.reconcileAvailableApps(['builtin:1', 'market:42'])
    store.reconcileAvailableApps(['builtin:1', 'market:42'])

    expect(store.activeWorkspace?.items.filter((item) => item.appKey === 'market:42')).toEqual([
      { appKey: 'market:42' },
    ])
  })

  it('deduplicates cards passed back from workspace reordering', () => {
    const store = useWorkspaceStore()
    store.init()

    store.setActiveItems([
      { appKey: 'builtin:1' },
      { appKey: 'market:42' },
      { appKey: 'market:42' },
    ])

    expect(store.activeWorkspace?.items).toEqual([{ appKey: 'builtin:1' }, { appKey: 'market:42' }])
  })

  it('switches to the signed-in local workspace synchronously before cloud reconciliation', () => {
    mocks.storage.set('workspace-config:guest', {
      version: 1,
      activeWorkspaceId: 'guest',
      workspaces: [
        { id: 'guest', name: '访客工作台', icon: 'G', items: [{ appKey: 'builtin:1' }] },
      ],
      recentApps: [],
      knownApps: ['builtin:1'],
      preferences: {
        showWorkspaceBar: true,
        showAppDescriptions: true,
        cardDensity: 'standard',
      },
      layoutUpdatedAt: 1,
    })
    mocks.storage.set('workspace-config:7', {
      version: 1,
      activeWorkspaceId: 'user',
      workspaces: [
        { id: 'user', name: '用户工作台', icon: 'U', items: [{ appKey: 'market:42' }] },
      ],
      recentApps: [],
      knownApps: ['market:42'],
      preferences: {
        showWorkspaceBar: true,
        showAppDescriptions: true,
        cardDensity: 'standard',
      },
      layoutUpdatedAt: 2,
    })

    const store = useWorkspaceStore()
    store.init()
    expect(store.activeWorkspace?.items[0]?.appKey).toBe('builtin:1')

    store.switchToUser(7)

    expect(store.ownerId).toBe(7)
    expect(store.activeWorkspace?.items[0]?.appKey).toBe('market:42')
  })
})
