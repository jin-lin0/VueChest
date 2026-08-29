import { API_BASE, getAuthToken } from '@/lib/request'

interface StreamHandlers {
  onDelta?: (delta: string) => void
  onProgress?: (progress: { done: number; total: number; label: string }) => void
}

interface StreamPayload<T> {
  type?: 'delta' | 'progress' | 'complete' | 'error'
  delta?: unknown
  done?: unknown
  total?: unknown
  label?: unknown
  data?: T
  error?: unknown
  code?: unknown
}

export class BilibiliStreamError extends Error {
  code: string

  constructor(message: string, code = 'BILIBILI_STREAM_ERROR') {
    super(message)
    this.name = 'BilibiliStreamError'
    this.code = code
  }
}

export function splitSseLines(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split('\n')
  return { lines: lines.slice(0, -1), rest: lines.at(-1) || '' }
}

export async function streamBilibiliRequest<T>(
  path: string,
  body: unknown,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    let code = 'AI_REQUEST_FAILED'
    try {
      const payload = await response.json()
      message = payload?.error || message
      code = payload?.code || code
    } catch {}
    throw new BilibiliStreamError(message, code)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new BilibiliStreamError('无法读取 AI 响应流', 'INVALID_STREAM')

  const decoder = new TextDecoder()
  let buffer = ''
  let completed: T | undefined
  let streamDone = false

  const processLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data: ')) return
    const data = trimmed.slice(6)
    if (data === '[DONE]') {
      streamDone = true
      return
    }
    let payload: StreamPayload<T>
    try {
      payload = JSON.parse(data) as StreamPayload<T>
    } catch {
      return
    }
    if (payload.type === 'error' || payload.error) {
      throw new BilibiliStreamError(
        String(payload.error || 'AI 响应流中断'),
        typeof payload.code === 'string' ? payload.code : 'AI_STREAM_ERROR',
      )
    }
    if (payload.type === 'delta' && typeof payload.delta === 'string') {
      handlers.onDelta?.(payload.delta)
    }
    if (payload.type === 'progress') {
      handlers.onProgress?.({
        done: typeof payload.done === 'number' ? payload.done : 0,
        total: typeof payload.total === 'number' ? payload.total : 0,
        label: typeof payload.label === 'string' ? payload.label : '正在生成…',
      })
    }
    if (payload.type === 'complete' && payload.data !== undefined) {
      completed = payload.data
    }
  }

  try {
    while (!streamDone) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const split = splitSseLines(buffer)
      buffer = split.rest
      for (const line of split.lines) processLine(line)
    }
    buffer += decoder.decode()
    if (buffer) processLine(buffer)
  } finally {
    try {
      await reader.cancel()
    } catch {}
  }

  if (completed === undefined) {
    throw new BilibiliStreamError('AI 响应未正常完成', 'INCOMPLETE_STREAM')
  }
  return completed
}
