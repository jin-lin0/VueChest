import { describe, expect, it } from 'vitest'
import { isKnowledgeDocId } from '../access'

describe('knowledge document access lookup', () => {
  it('recognizes registered knowledge documents without loading their content', () => {
    expect(isKnowledgeDocId('frontend-overview')).toBe(true)
    expect(isKnowledgeDocId('niuke')).toBe(true)
  })

  it('does not classify help or meta documents as knowledge documents', () => {
    expect(isKnowledgeDocId('site-donate')).toBe(false)
    expect(isKnowledgeDocId('_template')).toBe(false)
    expect(isKnowledgeDocId(undefined)).toBe(false)
    expect(isKnowledgeDocId(['niuke'])).toBe(false)
  })
})
