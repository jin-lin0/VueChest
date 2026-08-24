import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const DOCS_ROOT = resolve(ROOT, 'src/docs/knowledge')
const OUTPUT = resolve(DOCS_ROOT, 'generated-catalog.ts')
const write = process.argv.includes('--write')
const entries = []

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const fullPath = join(directory, name)
    if (statSync(fullPath).isDirectory()) walk(fullPath)
    else if (name.endsWith('.md') && !name.startsWith('_')) parse(fullPath)
  }
}

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const rel = `./${relative(DOCS_ROOT, file).replaceAll('\\', '/')}`
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!frontmatter) throw new Error(`${rel} 缺少 frontmatter`)
  const meta = Object.fromEntries(
    frontmatter[1]
      .split('\n')
      .map((line) => line.match(/^(\w+):\s*(.+)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, '')]),
  )
  const title = frontmatter[2].match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (!title) throw new Error(`${rel} 缺少 H1`)
  entries.push({
    id: basename(file, '.md'),
    path: rel,
    category: relative(DOCS_ROOT, file).split(/[\\/]/)[0],
    group: meta.group || '未分组',
    order: Number(meta.order) || 9999,
    title,
  })
}

walk(DOCS_ROOT)
entries.sort((a, b) => a.path.localeCompare(b.path))
const output = `// 此文件由 scripts/knowledge/generate-doc-catalog.mjs 生成，请勿手改。\n` +
  `export interface KnowledgeCatalogEntry {\n  id: string\n  path: string\n  category: string\n  group: string\n  order: number\n  title: string\n}\n\n` +
  `export const KNOWLEDGE_CATALOG: KnowledgeCatalogEntry[] = ${JSON.stringify(entries, null, 2)}\n`

const current = (() => {
  try { return readFileSync(OUTPUT, 'utf8') } catch { return '' }
})()
if (write) {
  if (current !== output) writeFileSync(OUTPUT, output)
  console.log(`知识目录已生成：${entries.length} 篇`)
} else if (current !== output) {
  console.error('知识目录已过期，请运行：pnpm docs:catalog')
  process.exitCode = 1
} else {
  console.log(`知识目录校验通过：${entries.length} 篇`)
}
