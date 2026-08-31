import { effectScope, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/config/storage-keys'

const { getStorageMock, setStorageMock } = vi.hoisted(() => ({
  getStorageMock: vi.fn(),
  setStorageMock: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getStorage: getStorageMock,
  setStorage: setStorageMock,
}))

import { useApiManagerPersistence } from '../useApiManagerPersistence'

describe('API manager persistence boundary', () => {
  beforeEach(() => {
    getStorageMock.mockReset()
    setStorageMock.mockReset()
    getStorageMock.mockImplementation((_key: string, fallback?: unknown) => fallback ?? null)
  })

  it('hydrates defaults and persists later workspace mutations', async () => {
    const scope = effectScope()
    const state = scope.run(() => useApiManagerPersistence())!

    state.hydrate()

    expect(state.environments.value).toHaveLength(1)
    expect(state.collections.value).toHaveLength(1)
    expect(state.activeEnvironmentId.value).toBe(state.environments.value[0].id)
    expect(state.activeCollectionId.value).toBe(state.collections.value[0].id)

    state.collections.value.push({ id: 'second', name: '第二集合', color: '#000000' })
    await nextTick()

    expect(setStorageMock).toHaveBeenCalledWith(
      STORAGE_KEYS.API_MANAGER_COLLECTIONS,
      state.collections.value,
    )
    scope.stop()
  })
})
