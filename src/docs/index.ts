import type { DocItem } from './types'
import { helpSections } from './help'
import { knowledgeSections } from './knowledge'

/**
 * 文档中心公共出口。
 * - `helpSections`：帮助中心（src/docs/help）
 * - `knowledgeSections`：知识库（src/docs/knowledge）
 * 两个注册表各自放在独立子文件夹，按 Tab 分类；Docs.vue 通过
 * 「doc id 属于哪个注册表」来推导当前 Tab，无需在 id 上加前缀。
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
