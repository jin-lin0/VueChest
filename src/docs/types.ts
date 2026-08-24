export interface DocItem {
  /** 唯一 id，同时作为路由 query（?doc=xxx）与 .md 文件名 */
  id: string
  /** 侧边栏与内容标题 */
  title: string
  /** 原始 Markdown 内容；文件夹节点（含 children）可省略 */
  content?: string
  /** 知识库正文按需加载；目录渲染不触发下载。 */
  loadContent?: () => Promise<string>
  /** 子目录（可多级嵌套）；存在即为「文件夹」节点，仅作分组不单独展示正文 */
  children?: DocItem[]
}

export interface DocSection {
  id: string
  title: string
  items: DocItem[]
}

/** 判断节点是否为文件夹（分组）节点 */
export function isFolder(item: DocItem): boolean {
  return Array.isArray(item.children) && item.children.length > 0
}
