import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatStreamError, useChatStream } from '../composables/useChatStream'

const params = {
  conversationId: 'conversation',
  provider: 'openrouter',
  model: 'vendor/model:free',
  messages: [{ role: 'user' as const, content: 'hello' }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI chat stream errors', () => {
  it('replaces the browser Failed to fetch message with a stable network error code', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const stream = useChatStream().streamChat(params)
    await expect(stream.next()).rejects.toEqual(
      expect.objectContaining<Partial<ChatStreamError>>({
        message: 'AI 服务连接中断',
        code: 'NETWORK_ERROR',
      }),
    )
  })

  it('keeps the structured backend error code for actionable notices', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: '请求过多', code: 'RATE_LIMIT' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const stream = useChatStream().streamChat(params)
    await expect(stream.next()).rejects.toEqual(
      expect.objectContaining<Partial<ChatStreamError>>({
        message: '请求过多',
        code: 'RATE_LIMIT',
      }),
    )
  })

  it('normalizes a connection failure after the response stream has started', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('connection reset'))
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const stream = useChatStream().streamChat(params)
    await expect(stream.next()).rejects.toEqual(
      expect.objectContaining<Partial<ChatStreamError>>({
        message: 'AI 响应连接中断',
        code: 'NETWORK_ERROR',
      }),
    )
  })
})
