const knowledgeDocIds = new Set(
  Object.keys(import.meta.glob('./**/*.md'))
    .map((path) => path.split('/').pop()?.replace(/\.md$/, '') ?? '')
    .filter((id) => id && !id.startsWith('_')),
)

/**
 * 判断路由中的 doc 参数是否指向知识库文档。
 * 这里只读取 Vite glob 的文件名，不加载 Markdown 正文，供路由守卫做轻量权限判断。
 */
export function isKnowledgeDocId(value: unknown): value is string {
  return typeof value === 'string' && knowledgeDocIds.has(value)
}
