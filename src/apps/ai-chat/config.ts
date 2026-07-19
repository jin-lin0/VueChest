export const AI_CHAT_SESSIONS_KEY = 'ai-chat-sessions'
export const AI_CHAT_API_KEY_STORAGE = 'ai-chat-api-key'
export const AI_CHAT_MODEL_STORAGE = 'ai-chat-model'

export interface AiChatConfig {
  defaultApiUrl: string
  defaultMaxTokens: number
  defaultTemperature: number
  defaultModel: string
}

export const AI_CHAT_CONFIG: AiChatConfig = {
  defaultApiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  defaultMaxTokens: 4096,
  defaultTemperature: 0.7,
  defaultModel: 'deepseek-ai/DeepSeek-V3.2',
}

export interface AiChatModel {
  id: string
  name: string
}

export const AVAILABLE_MODELS: AiChatModel[] = [
  { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2' },
  { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
]
