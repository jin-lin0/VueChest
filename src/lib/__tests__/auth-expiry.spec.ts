// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { TOKEN_KEY } from '../constants'
import { api } from '../request'
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})
describe('authenticated request expiry', () => {
  it('clears the current session on a protected 401, including a non-JSON error body', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('expired', { status: 401 })))
    await expect(api.get('/protected')).rejects.toBeInstanceOf(Error)
    expect(auth.token).toBeNull()
    auth.$dispose()
  })
  it('does not expire a new token when an older protected request returns 401', async () => {
    localStorage.setItem(TOKEN_KEY, 'old')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    let finish!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const pending = api.get('/protected')
    localStorage.setItem(TOKEN_KEY, 'new')
    auth.token = 'new'
    finish(new Response('{"error":"expired"}', { status: 401 }))
    await expect(pending).rejects.toBeInstanceOf(Error)
    expect(auth.token).toBe('new')
    auth.$dispose()
  })
})
