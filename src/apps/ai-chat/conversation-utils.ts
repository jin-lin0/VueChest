import type { ConversationSummary } from './config'

export interface ExportableMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export function safeConversationFilename(title: string) {
  return (title || 'conversation')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export function conversationToMarkdown(
  conversation: ConversationSummary,
  messages: ExportableMessage[],
) {
  const body = messages
    .map((message) => {
      const speaker = message.role === 'user' ? '我' : message.role === 'assistant' ? 'AI' : '系统'
      return `## ${speaker}\n\n${message.content}`
    })
    .join('\n\n')
  return `# ${conversation.title}\n\n${body}\n`
}

export function conversationToJson(
  conversation: ConversationSummary,
  messages: ExportableMessage[],
) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      conversation,
      messages: messages.map(({ role, content, timestamp }) => ({ role, content, timestamp })),
    },
    null,
    2,
  )
}
