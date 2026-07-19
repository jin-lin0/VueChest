import { marked, type Tokens } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// 全站统一的 markdown 渲染配置（断行 + GitHub 风格表格/删除线等）
marked.setOptions({ breaks: true, gfm: true })

export interface TocItem {
  id: string
  text: string
  depth: number
}

// 标题锚点 id 前缀，extractToc 与 renderMarkdown 共用以保证 id 对齐
const ANCHOR_PREFIX = 'mdh-'

/**
 * 渲染 markdown 为 HTML。
 * @param md        原始 markdown 文本
 * @param tocLevel  若 > 0，则为该级标题（如 2 = ##）注入连续锚点 id（mdh-0、mdh-1…），
 *                  供 extractToc 生成的目录跳转使用；只对该级计数，其余标题不加 id。
 */
export function renderMarkdown(md: string, opts: { tocLevel?: number } = {}): string {
  const tocLevel = opts.tocLevel ?? 0
  let index = 0
  const renderer = new marked.Renderer()
  // 代码块默认在 parse 阶段同步高亮（输出带 hljs 类），调用方无需再后处理
  renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    return `<pre><code class="hljs language-${language}">${hljs.highlight(text, { language }).value}</code></pre>`
  }
  if (tocLevel > 0) {
    renderer.heading = (token: Tokens.Heading) => {
      const inner = marked.parseInline(token.text)
      const id = token.depth === tocLevel ? ` id="${ANCHOR_PREFIX}${index++}"` : ''
      return `<h${token.depth}${id}>${inner}</h${token.depth}>`
    }
  }
  return marked.parse(md, { renderer }) as string
}

/**
 * 从 markdown 提取标题作为目录（默认二级标题）。
 * 跳过围栏代码块（```）内的标题，避免误匹配。
 * 锚点 id 生成规则与 renderMarkdown 保持一致，确保点击跳转命中。
 */
export function extractToc(md: string, level = 2): TocItem[] {
  const items: TocItem[] = []
  let index = 0
  let inCodeBlock = false
  const re = new RegExp(`^${'#'.repeat(level)}\\s+(.+)$`)
  for (const line of md.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const m = re.exec(line)
    if (m) items.push({ id: `${ANCHOR_PREFIX}${index++}`, text: m[1].trim(), depth: level })
  }
  return items
}

