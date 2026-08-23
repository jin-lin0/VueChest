import type { DocItem } from './types'
import { helpSections } from './help'
import { knowledgeSections } from './knowledge'
import { flattenDocs } from './tree'

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
export { containsId, firstLeaf, firstLeafIdOf, flattenDocs, folderIdsOfSections } from './tree'

export const allDocs: DocItem[] = flattenDocs([
  ...helpSections.flatMap((section) => section.items),
  ...knowledgeSections.flatMap((section) => section.items),
])

export function findDoc(id: string | undefined | null): DocItem | undefined {
  if (!id) return undefined
  return allDocs.find((d) => d.id === id)
}
