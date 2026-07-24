import type { DocItem, DocSection } from './types'
import { helpSections } from './help'
import { knowledgeSections } from './knowledge'

/**
 * 文档中心公共出口。
 * - `helpSections`：帮助中心（src/docs/help）
 * - `knowledgeSections`：知识库（src/docs/knowledge）
 * 两个注册表各自放在独立子文件夹，按 Tab 分类；Docs.vue 通过
 * 「doc id 属于哪个注册表」来推导当前 Tab，无需在 id 上加前缀。
 *
 * 文档支持多级子目录：DocItem 可带 `children`，形成树形；
 * 侧边栏递归渲染、可折叠。
 */
export { helpSections } from './help'
export { knowledgeSections } from './knowledge'

export const allDocs: DocItem[] = [
  ...helpSections.flatMap((s) => s.items),
  ...knowledgeSections.flatMap((s) => s.items),
]

export function findDoc(id: string | undefined | null): DocItem | undefined {
  if (!id) return undefined
  return allDocs.find((d) => d.id === id)
}

/* ---------------- 树形辅助函数 ---------------- */

/** 递归扁平化（含文件夹节点），用于 tab 推导、id 存在性判断等 */
export function flattenDocs(items: DocItem[]): DocItem[] {
  const out: DocItem[] = []
  const walk = (list: DocItem[]) => {
    for (const it of list) {
      out.push(it)
      if (it.children) walk(it.children)
    }
  }
  walk(items)
  return out
}

/** 取树中第一个「叶子文档」（有 content 且无 children） */
export function firstLeaf(items: DocItem[]): DocItem | undefined {
  for (const it of items) {
    if (it.children?.length) {
      const f = firstLeaf(it.children)
      if (f) return f
    } else if (it.content) {
      return it
    }
  }
  return undefined
}

/** 取某 Tab 注册表下的第一个叶子文档 id（用于默认选中） */
export function firstLeafIdOf(sections: DocSection[]): string | undefined {
  for (const s of sections) {
    const f = firstLeaf(s.items)
    if (f) return f.id
  }
  return undefined
}

/** 判断某节点子树是否包含目标 id（用于默认展开路径） */
export function containsId(items: DocItem[], id: string): boolean {
  return flattenDocs(items).some((d) => d.id === id)
}
