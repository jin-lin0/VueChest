import type { DocItem, DocSection } from '../types'
import { KNOWLEDGE_TAXONOMY } from './taxonomy'
import { KNOWLEDGE_CATALOG, type KnowledgeCatalogEntry } from './generated-catalog'

// 正文保持动态 import；进入知识库只加载轻量目录，选中文档后才下载对应 Markdown。
const rawLoaders = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

function bodyOf(markdown: string): string {
  return markdown.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/)?.[1] ?? markdown
}

function loadContent(path: string) {
  const loader = rawLoaders[path]
  if (!loader) return async () => `# 文档加载失败\n\n未找到文档模块：${path}`
  return async () => bodyOf(await loader())
}

function buildSections(catalog: KnowledgeCatalogEntry[]): DocSection[] {
  return KNOWLEDGE_TAXONOMY.filter((category) =>
    catalog.some((document) => document.category === category.id),
  ).map((category) => {
    const documents = catalog.filter((document) => document.category === category.id)
    const groups: Record<string, KnowledgeCatalogEntry[]> = {}
    for (const document of documents) (groups[document.group] ||= []).push(document)
    const groupOrder = new Map(category.groups.map((group, index) => [group, index] as const))
    const items: DocItem[] = Object.entries(groups)
      .sort(([left], [right]) => {
        const a = groupOrder.get(left) ?? Number.MAX_SAFE_INTEGER
        const b = groupOrder.get(right) ?? Number.MAX_SAFE_INTEGER
        return a - b || left.localeCompare(right, 'zh-CN')
      })
      .map(([groupTitle, entries], index) => ({
        id: `grp-${category.id}-${index}`,
        title: groupTitle,
        children: entries
          .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'))
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            loadContent: loadContent(entry.path),
          })),
      }))
    return { id: `kb-${category.id}`, title: category.title, items }
  })
}

export const knowledgeSections: DocSection[] = buildSections(KNOWLEDGE_CATALOG)
export const allKnowledgeDocs: DocItem[] = knowledgeSections.flatMap((section) => section.items)
