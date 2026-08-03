import { marked, type Tokens } from 'marked'
// XSS 防护：marked 默认不净化 HTML，必须统一在出口消毒。
// 所有 markdown 渲染都经 renderMarkdown，在此一处净化即可覆盖全站（AI 回复 / R2 知识库 / 题库 / docs）。
import DOMPurify from 'dompurify'
// 仅引入核心 + 按需注册语言，避免全量 1MB+ 的 highlight.js 打包
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github-dark.css'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('plaintext', plaintext)

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
  const rawHtml = marked.parse(md, { renderer }) as string
  // 统一消毒：剥离 <script>/on* 事件处理器/javascript: 链接等，保留基础排版与代码高亮类。
  const clean = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
  })
  return clean as string
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
