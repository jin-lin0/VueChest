import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  get: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/config', () => ({
  APP_MODULES: [{ id: 1 }],
  STORAGE_KEYS: {
    HOME_APP_ORDER: 'order',
    HOME_APP_HIDDEN: 'hidden',
    WORKSPACE_CONFIG_PREFIX: 'workspace-config',
  },
}))
vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) => mocks.storage.get(key) ?? fallback,
  setStorage: (key: string, value: unknown) =>
    mocks.storage.set(key, JSON.parse(JSON.stringify(value))),
  applyStoragePatch: async (patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch))
      mocks.storage.set(key, JSON.parse(JSON.stringify(value)))
  },
}))
vi.mock('@/lib/request', () => ({ api: { get: mocks.get, put: mocks.put, delete: vi.fn() } }))
import { useWorkspaceStore } from '../workspace'
beforeEach(() => {
  setActivePinia(createPinia())
  mocks.storage.clear()
  mocks.get.mockReset()
  mocks.put.mockReset().mockResolvedValue({})
})

describe('workspace sync ownership', () => {
  it('keeps local layouts across store recreation and does not copy another account into a new one', () => {
    const store = useWorkspaceStore()
    store.init()
    store.createWorkspace('Guest')
    store.switchToUser(1)
    store.createWorkspace('Only account one')
    store.switchToUser(2)
    expect(store.config.workspaces.map((item) => item.name)).not.toContain('Only account one')
    setActivePinia(createPinia())
    const reloaded = useWorkspaceStore()
    reloaded.switchToUser(1)
    expect(reloaded.config.workspaces.map((item) => item.name)).toContain('Only account one')
  })

  it('ignores a cloud download completed after logout', async () => {
    let finish!: (value: unknown) => void
    mocks.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const store = useWorkspaceStore()
    const pending = store.syncWithServer(1)
    store.switchToGuest()
    finish({
      data: {
        config: {
          version: 1,
          updatedAt: Date.now() + 10_000,
          workspaces: [{ id: 'remote', name: 'Other account cloud', icon: 'X', items: [] }],
        },
        updatedAt: new Date().toISOString(),
      },
    })
    await pending
    expect(store.ownerId).toBeNull()
    expect(store.config.workspaces.map((item) => item.id)).not.toContain('remote')
    expect(store.syncState).toBe('local')
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('serializes cloud writes so the latest layout is persisted last', async () => {
    const store = useWorkspaceStore()
    store.switchToUser(1)
    store.createWorkspace('first')
    let finish!: () => void
    mocks.put.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const first = store.pushToServer(true)
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1))
    store.updateWorkspace(store.activeWorkspace.id, { name: 'latest', icon: 'X' })
    const second = store.pushToServer(true)
    expect(mocks.put).toHaveBeenCalledTimes(1)
    finish()
    await Promise.all([first, second])
    expect(mocks.put).toHaveBeenCalledTimes(2)
    expect(mocks.put.mock.calls[1][1].config.workspaces.at(-1).name).toBe('latest')
    expect(store.syncState).toBe('synced')
  })
})
