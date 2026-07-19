import { AI_CHAT_CONFIG } from '../config'

export interface ChatStreamMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamChatParams {
  apiKey: string
  model: string
  messages: ChatStreamMessage[]
  apiUrl?: string
  maxTokens?: number
  temperature?: number
}

export function useChatStream() {
  async function* streamChat(params: StreamChatParams): AsyncGenerator<string> {
    const {
      apiKey,
      model,
      messages,
      apiUrl = AI_CHAT_CONFIG.defaultApiUrl,
      maxTokens = AI_CHAT_CONFIG.defaultMaxTokens,
      temperature = AI_CHAT_CONFIG.defaultTemperature,
    } = params

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => null)
      throw new Error(
        (errData as { error?: { message?: string } } | null)?.error?.message ||
          `请求失败: ${response.status}`,
      )
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let done = false

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
          const delta = json?.choices?.[0]?.delta?.content
          if (delta) {
            yield delta
          }
        } catch {}
      }
    }
  }

  return { streamChat }
}
