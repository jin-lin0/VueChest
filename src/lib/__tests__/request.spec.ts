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

describe('api request failure messages', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('把 fetch 的网络层异常翻译成中文，而不是把英文 TypeError 丢给用户', async () => {
    // 浏览器在后端没启动 / 断网时就是抛这个
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    })
    await expect(api.get('/anything')).rejects.toThrow('网络连接失败')
  })

  it('后端返回 HTML（如网关 502 页）时按解析失败处理，不冒充网络故障', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      }),
    )

    await expect(api.get('/gateway')).rejects.toMatchObject({
      code: 'PARSE_ERROR',
      status: 502,
    })
  })

  it('响应体是合法 JSON 但不是对象时不报成网络故障', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      }),
    )

    await expect(api.get('/null')).rejects.toMatchObject({ code: 'PARSE_ERROR' })
  })

  it('数组响应体仍按成功返回（有些接口就是裸数组）', async () => {
    const rows = [{ id: 1 }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => rows,
      }),
    )

    await expect(api.get('/list')).resolves.toEqual(rows)
  })

  it('HTTP 失败时优先用响应体里的 error 文案与 code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: '题目标题不能为空', code: 'VALIDATION' }),
      }),
    )

    await expect(api.post('/questions', {})).rejects.toMatchObject({
      message: '题目标题不能为空',
      code: 'VALIDATION',
      status: 400,
    })
  })
})
