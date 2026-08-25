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
    } = params

    const token = getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${API_BASE}/api/ai-chat/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, provider, model, messages, maxTokens, temperature }),
      signal,
    })

    if (!response.ok) {
      let msg = `请求失败: ${response.status}`
      try {
        const j = await response.json()
        msg = j?.error || msg
      } catch {}
      throw new Error(msg)
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

          try {
            const json = JSON.parse(data)
            if (typeof json?.model === 'string') onModelResolved?.(json.model)
            const delta = json?.choices?.[0]?.delta?.content
            if (delta) {
              yield delta
            }
          } catch {}
        }
      }
    } finally {
      // 无论正常结束、出错还是被 abort，都取消 reader 释放底层网络流
      try {
        await reader.cancel()
      } catch {}
    }
  }

  return { streamChat }
}
