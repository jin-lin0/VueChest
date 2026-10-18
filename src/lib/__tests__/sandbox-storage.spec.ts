// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useNotesStore } from '../../../market-apps/notes/src/store'

const mocks = vi.hoisted(() => ({
  dbGetAll: vi.fn(),
  removeStorageAsync: vi.fn(),
  setStorage: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbGetAll: mocks.dbGetAll }))
vi.mock('@/lib/storage', () => ({
  setStorage: mocks.setStorage,
  removeStorage: vi.fn(),
  removeStorageAsync: mocks.removeStorageAsync,
}))
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ addToast: mocks.addToast, removeToast: vi.fn() }),
}))

import { clearSandboxStorage, handleSandboxMessage, inspectSandboxStorage } from '../sandbox-bridge'

beforeEach(() => {
  mocks.dbGetAll.mockReset()
  mocks.removeStorageAsync.mockReset()
  mocks.setStorage.mockReset()
  mocks.addToast.mockReset()
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

describe('本地存储兼容整张列表与原始键名', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, '__VueChest__')
  })

  it('便签保存超过 20 万字符后，宿主收到完整列表', async () => {
    const requests: Promise<void>[] = []
    const replies: unknown[] = []
    const storage = {
      getStorage: () => [],
      setStorage: (key: string, value: unknown) => {
        requests.push(
          handleSandboxMessage(
            { kind: 'capability', id: 'save', name: 'storage.set', args: [key, value] },
            1,
            { permissions: [] },
            (reply) => replies.push(reply),
          ),
        )
      },
    }
    Object.assign(window, { __VueChest__: { storage } })
    setActivePinia(createPinia())
    const store = useNotesStore()
    store.createNewNote()
    const content = 'x'.repeat(200_100)
    store.editingNote!.content = content
    store.saveNote()
    await nextTick()
    await Promise.all(requests)
    expect(store.isEditing).toBe(false)
    expect(mocks.setStorage).toHaveBeenCalledWith('sandbox:1:notes', [
      expect.objectContaining({ content }),
    ])
    expect(replies).toEqual([{ kind: 'capability-response', id: 'save', value: true }])
  })

  it('本地键名不裁剪空白、不套用云端字段长度，避免与沙箱缓存不一致', async () => {
    const key = ` ${'k'.repeat(121)} `
    await handleSandboxMessage(
      { kind: 'capability', id: 'save', name: 'storage.set', args: [key, 1] },
      1,
      { permissions: [] },
      vi.fn(),
    )
    expect(mocks.setStorage).toHaveBeenCalledWith(`sandbox:1:${key}`, 1)
  })
})
