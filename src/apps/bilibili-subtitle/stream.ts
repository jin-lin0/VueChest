import { API_BASE, getAuthToken } from '@/lib/request'
import { readSseData } from '@/lib/sse'

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

export async function streamBilibiliRequest<T>(
  path: string,
  body: unknown,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new DOMException('请求已取消', 'AbortError')
    }
    throw new BilibiliStreamError('AI 服务连接中断', 'NETWORK_ERROR')
  }
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

  if (!response.body) throw new BilibiliStreamError('无法读取 AI 响应流', 'INVALID_STREAM')
  let completed: T | undefined
  const processData = (data: string) => {
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
    for await (const data of readSseData(response.body, signal)) {
      if (data === '[DONE]') break
      processData(data)
    }
  } catch (error) {
    if (error instanceof BilibiliStreamError) throw error
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new BilibiliStreamError('AI 响应连接中断', 'NETWORK_ERROR')
  }

  if (completed === undefined) {
    throw new BilibiliStreamError('AI 响应未正常完成', 'INCOMPLETE_STREAM')
  }
  return completed
}
