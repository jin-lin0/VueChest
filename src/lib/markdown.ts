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
 * @param opts.tocLevel   若 > 0，为「单级」标题（如 2 = ##）注入连续锚点 id（mdh-0、mdh-1…）。
 * @param opts.tocLevels  若提供数组（如 [2,3]），为该数组内各级标题统一注入连续锚点 id，
 *                        供 extractToc 生成的「本页目录」多级跳转使用。
 *                        二者同时提供时，tocLevels 优先。
 */
export function renderMarkdown(
  md: string,
  opts: { tocLevel?: number; tocLevels?: number[] } = {},
): string {
  const tocLevels = opts.tocLevels
  let index = 0
  const renderer = new marked.Renderer()
  // 代码块默认在 parse 阶段同步高亮（输出带 hljs 类），调用方无需再后处理
  renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    return `<pre><code class="hljs language-${language}">${hljs.highlight(text, { language }).value}</code></pre>`
  }
  if (tocLevels && tocLevels.length) {
    renderer.heading = (token: Tokens.Heading) => {
      const inner = marked.parseInline(token.text)
      const id = tocLevels.includes(token.depth) ? ` id="${ANCHOR_PREFIX}${index++}"` : ''
      return `<h${token.depth}${id}>${inner}</h${token.depth}>`
    }
  } else if (opts.tocLevel && opts.tocLevel > 0) {
    const tocLevel = opts.tocLevel
    renderer.heading = (token: Tokens.Heading) => {
      const inner = marked.parseInline(token.text)
      const id = token.depth === tocLevel ? ` id="${ANCHOR_PREFIX}${index++}"` : ''
      return `<h${token.depth}${id}>${inner}</h${token.depth}>`
    }
  }
  return marked.parse(md, { renderer }) as string
}

/**
 * 从 markdown 提取标题作为「本页目录」。
 * @param levels  要提取的标题级别（如 [2] 仅二级、[2,3] 二级+三级），默认 [2]。
 *                 各级标题共用一个连续 id 计数器（mdh-0、mdh-1…），与 renderMarkdown
 *                 的 tocLevels 注入规则一致，确保点击跳转命中。
 * 跳过围栏代码块（```）内的标题，避免误匹配；多级别按从大到小匹配避免 ## 误吞 ###。
 */
export function extractToc(md: string, levels: number[] = [2]): TocItem[] {
  const items: TocItem[] = []
  let index = 0
  let inCodeBlock = false
  const sorted = [...levels].sort((a, b) => b - a) // 大级别优先，避免 ## 匹配到 ###
  const res = sorted.map((lv) => ({ lv, re: new RegExp(`^${'#'.repeat(lv)}\\s+(.+)$`) }))
  for (const line of md.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    for (const { lv, re } of res) {
      const m = re.exec(line)
      if (m) {
        items.push({ id: `${ANCHOR_PREFIX}${index++}`, text: m[1].trim(), depth: lv })
        break
      }
    }
  }
  return items
}
