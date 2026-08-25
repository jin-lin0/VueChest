import { describe, expect, it } from 'vitest'
import { resolveModelSelection, type ProviderMeta } from '../config'

const provider: ProviderMeta = {
  id: 'openrouter',
  name: 'OpenRouter',
  models: [
    { id: 'vendor/first:free', name: 'First Free' },
    { id: 'vendor/second:free', name: 'Second Free' },
  ],
  defaultModel: 'vendor/first:free',
}

describe('AI model selection', () => {
  it('keeps a stored model that still exists', () => {
    expect(resolveModelSelection(provider, 'vendor/second:free')).toBe('vendor/second:free')
  })

  it('replaces the legacy random free router with the first concrete free model', () => {
    expect(resolveModelSelection(provider, 'openrouter/free')).toBe('vendor/first:free')
  })

  it('falls back to the first model when the advertised default is invalid', () => {
    expect(resolveModelSelection({ ...provider, defaultModel: 'missing' }, null)).toBe(
      'vendor/first:free',
    )
  })
})
