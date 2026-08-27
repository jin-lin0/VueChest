import { describe, expect, it } from 'vitest'
import {
  conversationToJson,
  conversationToMarkdown,
  safeConversationFilename,
} from '../conversation-utils'

const conversation = {
  id: '1',
  title: '测试 / 会话',
  provider: 'openrouter',
  model: 'model:free',
  createdAt: 1,
  updatedAt: 2,
}
const messages = [{ role: 'user' as const, content: '你好', timestamp: 1 }]

describe('conversation export', () => {
  it('builds Markdown and JSON exports', () => {
    expect(conversationToMarkdown(conversation, messages)).toContain('## 我\n\n你好')
    expect(JSON.parse(conversationToJson(conversation, messages)).messages).toEqual(messages)
  })

  it('sanitizes filenames', () => {
    expect(safeConversationFilename(conversation.title)).toBe('测试 - 会话')
  })
})
