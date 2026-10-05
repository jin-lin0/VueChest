import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dbGetAll: vi.fn(),
  removeStorageAsync: vi.fn(),
  setStorage: vi.fn(),
  removeStorage: vi.fn(),
  addToast: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  user: { id: 7, username: 'alice', avatar: null as string | null },
}))

vi.mock('@/lib/db', () => ({ dbGetAll: mocks.dbGetAll }))
vi.mock('@/lib/storage', () => ({
  setStorage: mocks.setStorage,
  removeStorage: mocks.removeStorage,
  removeStorageAsync: mocks.removeStorageAsync,
}))
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ addToast: mocks.addToast, removeToast: vi.fn() }),
}))
vi.mock('@/lib/request', () => ({
  api: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
    delete: mocks.apiDelete,
  },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))

import { handleSandboxMessage, type SandboxCapabilities } from '../sandbox-bridge'

/** 收集一次能力调用的回包，返回 { value, error }。 */
async function callCapability(
  name: string,
  args: unknown[],
  caps: SandboxCapabilities,
): Promise<{ value?: unknown; error?: string }> {
  const responses: { value?: unknown; error?: string }[] = []
  await handleSandboxMessage({ kind: 'capability', id: 'c1', name, args }, 42, caps, (msg) => {
    const payload = msg as { value?: unknown; error?: string }
    responses.push({ value: payload.value, error: payload.error })
  })
  return responses[0] || {}
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.dbGetAll.mockResolvedValue({})
  mocks.user = { id: 7, username: 'alice', avatar: null }
})

describe('sandbox capability permissions', () => {
  it('rejects a capability the app did not declare', async () => {
    const res = await callCapability('notify', [{ body: 'hi' }], { permissions: [] })
    expect(res.error).toContain('未授权的能力')
    expect(mocks.addToast).not.toHaveBeenCalled()
  })

  it('routes notify through the host toast when granted', async () => {
    const res = await callCapability(
      'notify',
      [{ body: '同步完成', level: 'success' }],
      { permissions: ['notify'] },
    )
    expect(res.value).toBe(true)
    expect(mocks.addToast).toHaveBeenCalledWith('success', '同步完成')
  })

  it('keeps base storage working without any declared permission', async () => {
    const res = await callCapability('storage.set', ['todo', [1, 2]], { permissions: [] })
    expect(res.value).toBe(true)
    expect(mocks.setStorage).toHaveBeenCalledWith('sandbox:42:todo', [1, 2])
  })

  it('scopes cloud writes to the calling app id', async () => {
    mocks.apiPut.mockResolvedValue({ success: true, data: {} })
    const res = await callCapability(
      'cloud.set',
      ['notes', { text: 'a' }],
      { permissions: ['cloud'] },
    )
    expect(res.value).toBe(true)
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/app-data/42/notes', { value: { text: 'a' } })
  })

  it('rejects profile when the user is not signed in', async () => {
    mocks.user = null as unknown as typeof mocks.user
    const res = await callCapability('profile', [], { permissions: ['profile'] })
    expect(res.error).toContain('需要登录')
  })

  it('returns the profile when signed in and granted', async () => {
    const res = await callCapability('profile', [], { permissions: ['profile'] })
    expect(res.value).toEqual({ id: 7, username: 'alice', avatar: null })
  })

  it('forwards ai.chat to the app AI proxy and returns the content', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, data: { content: '你好', model: 'm1' } })
    const res = await callCapability(
      'ai.chat',
      [{ messages: [{ role: 'user', content: 'hi' }] }],
      { permissions: ['ai'] },
    )
    expect(res.value).toEqual({ content: '你好', model: 'm1' })
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/app-ai/chat',
      { appId: 42, messages: [{ role: 'user', content: 'hi' }] },
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
  })

  it('rejects an oversized cloud value', async () => {
    const res = await callCapability(
      'cloud.set',
      ['big', 'x'.repeat(200_001)],
      { permissions: ['cloud'] },
    )
    expect(res.error).toContain('过大')
    expect(mocks.apiPut).not.toHaveBeenCalled()
  })
})
