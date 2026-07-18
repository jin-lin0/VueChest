export interface DocItem {
  /** 唯一 id，同时作为路由 query（?doc=xxx）与 .md 文件名 */
  id: string
  /** 侧边栏与内容标题 */
  title: string
  /** 原始 Markdown 内容 */
  content: string
}

export interface DocSection {
  id: string
  title: string
  items: DocItem[]
}
