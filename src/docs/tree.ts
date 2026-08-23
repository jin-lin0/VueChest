import type { DocItem, DocSection } from './types'

/** 递归扁平化（含文件夹节点），用于 Tab 推导、id 存在性判断等。 */
export function flattenDocs(items: DocItem[]): DocItem[] {
  const result: DocItem[] = []
  const walk = (nodes: DocItem[]) => {
    for (const node of nodes) {
      result.push(node)
      if (node.children) walk(node.children)
    }
  }
  walk(items)
  return result
}

/** 取树中第一个有正文的叶子文档。 */
export function firstLeaf(items: DocItem[]): DocItem | undefined {
  for (const item of items) {
    if (item.children?.length) {
      const child = firstLeaf(item.children)
      if (child) return child
    } else if (item.content) {
      return item
    }
  }
  return undefined
}

/** 取一个文档注册表中的第一个叶子文档 id。 */
export function firstLeafIdOf(sections: DocSection[]): string | undefined {
  for (const section of sections) {
    const leaf = firstLeaf(section.items)
    if (leaf) return leaf.id
  }
  return undefined
}

/** 判断文档树是否包含目标 id。 */
export function containsId(items: DocItem[], id: string): boolean {
  return flattenDocs(items).some((doc) => doc.id === id)
}

/** 收集文档注册表中指定深度内的目录 id；一级是 DocSection，all 会递归包含所有目录。 */
export function folderIdsOfSections(
  sections: DocSection[],
  maxDepth: number | 'all' = 'all',
): string[] {
  if (maxDepth !== 'all' && maxDepth < 1) return []

  const result = sections.map((section) => section.id)
  if (maxDepth === 1) return result

  const walk = (items: DocItem[], depth: number) => {
    if (maxDepth !== 'all' && depth > maxDepth) return
    for (const item of items) {
      if (!item.children?.length) continue
      result.push(item.id)
      walk(item.children, depth + 1)
    }
  }
  sections.forEach((section) => walk(section.items, 2))
  return result
}
