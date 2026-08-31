import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../request'

function abortablePendingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

describe('api request lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', { getItem: () => null })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('turns a stalled request into a stable timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn(abortablePendingFetch))

    const pending = api.get('/slow', { timeoutMs: 50 })
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT', status: 408 })

    await vi.advanceTimersByTimeAsync(50)
    await assertion
  })

  it('does not impose a timeout when the caller does not request one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      }),
    )

    await api.get('/normal')

    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves an explicit caller abort instead of reporting a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(abortablePendingFetch))
    const controller = new AbortController()

    const pending = api.get('/cancelled', { signal: controller.signal, timeoutMs: 500 })
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
