import { api } from '@/lib/request'

export interface ModelOption {
  id: string
  name: string
  contextLength?: number | null
  expirationDate?: string | null
  health?: 'healthy' | 'cooldown'
  cooldownUntil?: number | null
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

export interface ConversationPage {
  items: ConversationSummary[]
  page: number
  total: number
  hasMore: boolean
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

export async function fetchConversationPage(
  options: {
    query?: string
    page?: number
    limit?: number
  } = {},
): Promise<ConversationPage> {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    limit: String(options.limit || 50),
  })
  if (options.query?.trim()) params.set('q', options.query.trim())
  const res = await api.get<{
    data: ConversationSummary[]
    pagination?: { page: number; total: number; hasMore: boolean }
  }>(`/api/ai-chat/conversations?${params}`)
  return {
    items: res.data || [],
    page: res.pagination?.page || 1,
    total: res.pagination?.total || res.data?.length || 0,
    hasMore: res.pagination?.hasMore === true,
  }
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  return (await fetchConversationPage()).items
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await api.put(`/api/ai-chat/conversations/${encodeURIComponent(id)}`, { title })
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
