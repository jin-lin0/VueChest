import { describe, expect, it } from 'vitest'
import type { ModelOption } from '../config'
import { findNextAvailableModel, resolveModelFailure } from '../model-failure'

const models: ModelOption[] = [
  { id: 'vendor/first:free', name: 'First' },
  { id: 'vendor/limited:free', name: 'Limited' },
  { id: 'vendor/second:free', name: 'Second' },
]

describe('AI model failure notice', () => {
  it('suggests the next available model in list order', () => {
    expect(findNextAvailableModel(models, 'vendor/first:free')?.id).toBe('vendor/limited:free')
    expect(resolveModelFailure(models, 'vendor/first:free', 'NETWORK_ERROR')).toMatchObject({
      message: '模型「First」连接中断，未收到完整响应。建议切换到「Limited」后重试。',
      suggestedModel: { id: 'vendor/limited:free' },
    })
  })

  it('wraps to the first model when the last one fails', () => {
    expect(findNextAvailableModel(models, 'vendor/second:free')?.id).toBe('vendor/first:free')
  })

  it('does not suggest switching when the provider has a single model', () => {
    expect(findNextAvailableModel([{ id: 'openrouter/free', name: 'Free' }], 'openrouter/free')).toBe(
      null,
    )
  })

  it('does not suggest switching for context or authentication errors', () => {
    expect(resolveModelFailure(models, 'vendor/first:free', 'CONTEXT_TOO_LONG')).toMatchObject({
      message: '模型「First」无法处理当前对话：上下文过长，请新建对话或精简内容。',
      suggestedModel: null,
    })
    expect(resolveModelFailure(models, 'vendor/first:free', 'UPSTREAM_AUTH').suggestedModel).toBe(
      null,
    )
    expect(resolveModelFailure(models, 'vendor/first:free', 'TOKEN_EXPIRED').message).toBe(
      '登录状态已失效，请重新登录。',
    )
  })
})
