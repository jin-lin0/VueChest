import { API_BASE, getAuthToken } from '@/lib/request'

export interface ChatStreamMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamChatParams {
  conversationId: string
  provider: string
  model: string
  messages: ChatStreamMessage[]
  maxTokens?: number
  temperature?: number
  /** 用于切换会话/卸载时中止当前流，避免旧流继续推送 */
  signal?: AbortSignal
  /** OpenRouter 触发模型降级时，同步最终实际使用的模型。 */
  onModelResolved?: (model: string) => void
  mode?: 'normal' | 'edit' | 'regenerate'
  replaceFromMessageId?: number
  onPersisted?: (result: {
    userMessageId: number | null
    assistantMessageId: number | null
    title: string
  }) => void
}

export class ChatStreamError extends Error {
  code: string

  constructor(message: string, code = 'AI_STREAM_ERROR') {
    super(message)
    this.name = 'ChatStreamError'
    this.code = code
  }
}

interface StreamPayload {
  model?: unknown
  error?: unknown
  code?: unknown
  choices?: Array<{ delta?: { content?: unknown } }>
  persisted?: {
    userMessageId?: unknown
    assistantMessageId?: unknown
    title?: unknown
  }
}

const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TEMPERATURE = 0.7

export function useChatStream() {
  async function* streamChat(params: StreamChatParams): AsyncGenerator<string> {
    const {
      conversationId,
      provider,
      model,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      temperature = DEFAULT_TEMPERATURE,
      signal,
      onModelResolved,
      mode = 'normal',
      replaceFromMessageId,
      onPersisted,
    } = params

    const token = getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    let response: Response
    try {
      response = await fetch(`${API_BASE}/api/ai-chat/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId,
          provider,
          model,
          messages,
          maxTokens,
          temperature,
          mode,
          replaceFromMessageId,
        }),
        signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new ChatStreamError('AI 服务连接中断', 'NETWORK_ERROR')
    }

    if (!response.ok) {
      let msg = `请求失败: ${response.status}`
      let code = 'AI_REQUEST_FAILED'
      try {
        const j = await response.json()
        msg = j?.error || msg
        code = j?.code || code
      } catch {}
      throw new ChatStreamError(msg, code)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let done = false

    try {
      while (!done) {
        const { done: readDone, value } = await reader.read()
        if (readDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            done = true
            break
          }

          let json: StreamPayload
          try {
            json = JSON.parse(data)
          } catch {
            continue
          }
          if (json?.error) {
            throw new ChatStreamError(
              String(json.error),
              typeof json.code === 'string' ? json.code : 'AI_STREAM_ERROR',
            )
          }
          if (typeof json.model === 'string') onModelResolved?.(json.model)
          if (json.persisted) {
            onPersisted?.({
              userMessageId:
                typeof json.persisted.userMessageId === 'number'
                  ? json.persisted.userMessageId
                  : null,
              assistantMessageId:
                typeof json.persisted.assistantMessageId === 'number'
                  ? json.persisted.assistantMessageId
                  : null,
              title: typeof json.persisted.title === 'string' ? json.persisted.title : '新对话',
            })
          }
          const delta = json?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) yield delta
        }
      }
    } catch (error) {
      if (error instanceof ChatStreamError) throw error
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new ChatStreamError('AI 响应连接中断', 'NETWORK_ERROR')
    } finally {
      // 无论正常结束、出错还是被 abort，都取消 reader 释放底层网络流
      try {
        await reader.cancel()
      } catch {}
    }
  }

  return { streamChat }
}
