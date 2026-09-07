import { describe, expect, it, vi } from 'vitest'
import { readSseData } from '../sse'

async function collect(stream: AsyncIterable<string>) {
  const result = []
  for await (const value of stream) result.push(value)
  return result
}

describe('SSE transport boundaries', () => {
  it('decodes split UTF-8, CRLF, multiline data and optional spaces', async () => {
    const encoded = new TextEncoder().encode(
      ': heartbeat\r\ndata:你\r\ndata: 好\r\n\r\ndata: next\r\r',
    )
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of encoded) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    expect(await collect(readSseData(body))).toEqual(['你\n好', 'next'])
    expect(body.locked).toBe(false)
  })

  it('does not publish an unfinished event when the connection closes', async () => {
    const body = new Response('data: complete\n\ndata: truncated\n').body!
    expect(await collect(readSseData(body))).toEqual(['complete'])
  })

  it('cancels a pending read immediately and releases the reader on abort', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const controller = new AbortController()
    const pending = readSseData(body, controller.signal).next()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('releases a still-open connection when the consumer stops at DONE', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      },
      cancel,
    })
    for await (const data of readSseData(body)) {
      expect(data).toBe('[DONE]')
      break
    }
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })
})
