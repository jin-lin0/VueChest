import type { DocSection, DocItem } from '../types'

/**
 * 知识库文档注册表（自动扫描版）。
 *
 * 约定（取代手写 `import` + 手写分组树）：
 * - 在 `knowledge/<category>/` 下新增 `.md` 即自动注册，无需改动本文件。
 * - `<category>` 取一级目录名：`frontend` / `ai` / `interview`（决定顶层 Tab）。
 * - 每篇 md 顶部用 frontmatter 声明所属分组与排序：
 *     ---
 *     group: CSS 与样式   # 二级分组名（同 category 内唯一即可），决定左侧子菜单归属
 *     order: 1            # 可选，跨库全局排序，越小越靠前
 *     ---
 *   标题自动取正文首个 `# H1`，因此内容里照常写 `# 标题` 即可。
 * - `_template.md` / `_backlog.md` 为元文件，不注册。
 *
 * 渲染链无需改动：`DocNavTree` 递归渲染 `DocItem.children`，`docs/index.ts`
 * 的 `flattenDocs / firstLeaf / containsId` 均递归处理 children。
 */

interface DocMeta {
  group?: string
  order?: number
}

// 自动收集 knowledge 下所有 .md（递归、eager 同步加载原文）
const rawModules = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function parseFrontmatter(text: string): { meta: DocMeta; body: string } {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: text }
  const meta: DocMeta = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (!kv) continue
    const key = kv[1]
    const val = kv[2].trim().replace(/^["']|["']$/g, '')
    if (key === 'order') meta.order = Number(val)
    else if (key === 'group') meta.group = val
  }
  return { meta, body: m[2] }
}

function firstH1(body: string): string | undefined {
  const m = body.match(/^#\s+(.+)$/m)
  return m?.[1]?.trim()
}

interface Parsed {
  id: string
  category: string
  group: string
  order: number
  title: string
  content: string
}

const CATEGORY_TITLE: Record<string, string> = {
  frontend: '前端开发',
  ai: 'AI / Agent',
  interview: '面试题库',
}

function parseAll(): Parsed[] {
  const out: Parsed[] = []
  for (const [path, content] of Object.entries(rawModules)) {
    const name = path.split('/').pop()!
    if (name === '_template.md' || name === '_backlog.md') continue
    const { meta, body } = parseFrontmatter(content)
    const segs = path.split('/')
    const category = segs[1] || ''
    const id = name.replace(/\.md$/, '')
    out.push({
      id,
      category,
      group: meta.group || '未分组',
      order: meta.order ?? 9999,
      title: firstH1(body) || id,
      content: body,
    })
  }
  return out
}

function buildSections(): DocSection[] {
  const all = parseAll()
  const categories = ['frontend', 'ai', 'interview']
  return categories
    .filter((cat) => all.some((d) => d.category === cat))
    .map((cat) => {
      const docs = all.filter((d) => d.category === cat).sort((a, b) => a.order - b.order)
      const groups: Record<string, Parsed[]> = {}
      for (const d of docs) (groups[d.group] ||= []).push(d)
      const items: DocItem[] = Object.entries(groups)
        .sort(
          (a, b) =>
            Math.min(...a[1].map((d) => d.order)) - Math.min(...b[1].map((d) => d.order)),
        )
        .map(([groupTitle, list], i) => ({
          id: `grp-${cat}-${i}`,
          title: groupTitle,
          children: list.map(({ id, title, content }) => ({ id, title, content })),
        }))
      return { id: `kb-${cat}`, title: CATEGORY_TITLE[cat] || cat, items }
    })
}

export const knowledgeSections: DocSection[] = buildSections()
export const allKnowledgeDocs: DocItem[] = knowledgeSections.flatMap((s) => s.items)
