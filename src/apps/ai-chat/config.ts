import { api } from '@/lib/request'

export interface ModelOption {
  id: string
  name: string
  contextLength?: number | null
  expirationDate?: string | null
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

export interface ConversationSummary {
  id: string
  title: string
  provider: string | null
  model: string | null
  createdAt: number
  updatedAt: number
}

export function resolveModelSelection(provider: ProviderMeta, storedModel?: string | null) {
  if (storedModel && provider.models.some((model) => model.id === storedModel)) {
    return storedModel
  }
  return provider.models.some((model) => model.id === provider.defaultModel)
    ? provider.defaultModel
    : provider.models[0]?.id || ''
}

export async function fetchProviders(): Promise<ProviderMeta[]> {
  const res = await api.get<{ data: ProviderMeta[] }>('/api/ai-chat/providers', { auth: false })
  return res.data || []
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await api.get<{ data: ConversationSummary[] }>('/api/ai-chat/conversations')
  return res.data || []
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/api/ai-chat/conversations/${encodeURIComponent(id)}`)
}

export async function fetchConversation(id: string): Promise<{
  messages: ChatMessage[]
  provider: string | null
  model: string | null
  title: string
}> {
  const res = await api.get<{
    data: { messages: ChatMessage[]; provider: string | null; model: string | null; title: string }
  }>(`/api/ai-chat/conversations/${id}/messages`)
  return res.data
}
