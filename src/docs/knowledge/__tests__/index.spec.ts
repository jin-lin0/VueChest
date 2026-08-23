import { describe, expect, it } from 'vitest'
import { knowledgeSections } from '../index'
import { KNOWLEDGE_TAXONOMY } from '../taxonomy'

function leafIds(sectionId: string): string[] {
  const section = knowledgeSections.find((item) => item.id === sectionId)
  return (
    section?.items.flatMap((group) => group.children?.map((document) => document.id) ?? []) ?? []
  )
}

describe('knowledge navigation', () => {
  it('uses the declared category and group order', () => {
    expect(knowledgeSections.map(({ id, title }) => ({ id, title }))).toEqual(
      KNOWLEDGE_TAXONOMY.map(({ id, title }) => ({ id: `kb-${id}`, title })),
    )

    for (const category of KNOWLEDGE_TAXONOMY) {
      const section = knowledgeSections.find((item) => item.id === `kb-${category.id}`)
      expect(section?.items.map((group) => group.title)).toEqual(category.groups)
    }
  })

  it('keeps reusable knowledge out of the interview category', () => {
    expect(leafIds('kb-backend')).toEqual(
      expect.arrayContaining([
        'node-backend',
        'mysql-optimization',
        'docker-deploy',
        'observability',
      ]),
    )
    expect(leafIds('kb-frontend')).toContain('low-code')
    expect(leafIds('kb-interview')).not.toEqual(
      expect.arrayContaining(['node-backend', 'mysql-optimization', 'docker-deploy', 'low-code']),
    )
  })

  it('exposes globally unique document ids', () => {
    const ids = knowledgeSections.flatMap((section) => leafIds(section.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
