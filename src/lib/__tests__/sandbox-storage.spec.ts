import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dbGetAll: vi.fn(),
  removeStorageAsync: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbGetAll: mocks.dbGetAll }))
vi.mock('@/lib/storage', () => ({
  setStorage: vi.fn(),
  removeStorage: vi.fn(),
  removeStorageAsync: mocks.removeStorageAsync,
}))

import { clearSandboxStorage, inspectSandboxStorage } from '../sandbox-bridge'

beforeEach(() => {
  mocks.dbGetAll.mockReset()
  mocks.removeStorageAsync.mockReset()
  mocks.removeStorageAsync.mockResolvedValue(undefined)
  mocks.dbGetAll.mockResolvedValue({
    'sandbox:1:name': 'VueChest',
    'sandbox:1:settings': { compact: true },
    'sandbox:2:secret': 'other app',
    special_days: ['shared host value'],
  })
})

describe('sandbox app storage management', () => {
  it('reports only the selected app namespace', async () => {
    const info = await inspectSandboxStorage(1)
    expect(info.entries).toBe(2)
    expect(info.bytes).toBeGreaterThan(0)
    expect(info.data).toEqual({ name: 'VueChest', settings: { compact: true } })
  })

  it('deletes only keys owned by the selected app', async () => {
    const count = await clearSandboxStorage(1)
    expect(count).toBe(2)
    expect(mocks.removeStorageAsync).toHaveBeenCalledTimes(2)
    expect(mocks.removeStorageAsync).toHaveBeenCalledWith('sandbox:1:name')
    expect(mocks.removeStorageAsync).toHaveBeenCalledWith('sandbox:1:settings')
    expect(mocks.removeStorageAsync).not.toHaveBeenCalledWith('sandbox:2:secret')
    expect(mocks.removeStorageAsync).not.toHaveBeenCalledWith('special_days')
  })
})
