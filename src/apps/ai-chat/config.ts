import { api } from '@/lib/request'

export const AI_CHAT_SESSIONS_KEY = 'ai-chat-sessions'
export const AI_CHAT_PROVIDER_STORAGE = 'ai-chat-provider'

export interface ModelOption {
  id: string
  name: string
}

export interface ProviderMeta {
  id: string
  name: string
  models: ModelOption[]
  defaultModel: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: number
  timestamp?: number
}

export const modelStorageKey = (providerId: string) => `ai-chat-model-${providerId}`

export async function fetchProviders(): Promise<ProviderMeta[]> {
  const res = await api.get<{ data: ProviderMeta[] }>('/api/ai-chat/providers', { auth: false })
  return res.data || []
}

export async function fetchConversation(id: string): Promise<{
  messages: ChatMessage[]
  provider: string | null
  model: string | null
  title: string
}> {
  const res = await api.get<{
    data: { messages: ChatMessage[]; provider: string | null; model: string | null; title: string }
  }>(`/api/ai-chat/conversations/${id}/messages`, { auth: false })
  return res.data
}
