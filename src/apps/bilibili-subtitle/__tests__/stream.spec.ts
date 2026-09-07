import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamBilibiliRequest } from '../stream'

vi.mock('@/lib/request', () => ({ API_BASE: 'https://api.example.com', getAuthToken: () => null }))
afterEach(() => vi.unstubAllGlobals())

describe('B站字幕流式请求', () => {
  it('handles split UTF-8 chunks, publishes progress and returns the completed result', async () => {
    const bytes = new TextEncoder().encode(
      'data:{"type":"progress","done":1,"total":2,"label":"分析中"}\r\n\r\n' +
        'data:{"type":"delta","delta":"你好"}\n\n' +
        'data:{"type":"complete","data":{"content":"你好"}}\n\ndata:[DONE]\n\n',
    )
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
          controller.close()
        },
      }),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const onDelta = vi.fn()
    const onProgress = vi.fn()
    await expect(streamBilibiliRequest('/analyze', {}, { onDelta, onProgress })).resolves.toEqual({
      content: '你好',
    })
    expect(onDelta).toHaveBeenCalledWith('你好')
    expect(onProgress).toHaveBeenCalledWith({ done: 1, total: 2, label: '分析中' })
    expect(response.body?.locked).toBe(false)
  })

  it('reports an incomplete response instead of treating partial text as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('data:{"type":"delta","delta":"部分内容"}\n\n')),
    )
    const onDelta = vi.fn()
    await expect(streamBilibiliRequest('/analyze', {}, { onDelta })).rejects.toThrow()
    expect(onDelta).toHaveBeenCalledWith('部分内容')
  })
})
