import { describe, expect, it } from 'vitest'
import { splitSseLines } from '../stream'

describe('B站字幕 SSE 解析', () => {
  it('keeps an incomplete line for the next network chunk', () => {
    expect(splitSseLines('data: {"type":"delta"}\n\ndata: {"type"')).toEqual({
      lines: ['data: {"type":"delta"}', ''],
      rest: 'data: {"type"',
    })
  })

  it('returns an empty remainder for a complete event chunk', () => {
    expect(splitSseLines('data: [DONE]\n\n')).toEqual({
      lines: ['data: [DONE]', ''],
      rest: '',
    })
  })
})
