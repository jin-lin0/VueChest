import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createJiti } from 'jiti'

const ROOT = resolve(import.meta.dirname, '../..')
const DOCS_ROOT = resolve(ROOT, 'src/docs/knowledge')
const jiti = createJiti(import.meta.url)
const { KNOWLEDGE_TAXONOMY } = await jiti.import(resolve(DOCS_ROOT, 'taxonomy.ts'))

const taxonomyByCategory = new Map(KNOWLEDGE_TAXONOMY.map((category) => [category.id, category]))
const documents = []
const errors = []

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const fullPath = join(directory, name)
    if (statSync(fullPath).isDirectory()) walk(fullPath)
    else if (name.endsWith('.md') && !name.startsWith('_')) documents.push(fullPath)
  }
}

function removeFencedCode(markdown) {
  const output = []
  let fence

  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (!fence && marker) {
      fence = { character: marker[1][0], length: marker[1].length }
      output.push('')
      continue
    }
    if (fence && marker) {
      const isClosing = marker[1][0] === fence.character && marker[1].length >= fence.length
      if (isClosing) fence = undefined
      output.push('')
      continue
    }
    output.push(fence ? '' : line)
  }

  return output.join('\n')
}

function parseDocument(file) {
  const text = readFileSync(file, 'utf8')
  const relativePath = relative(DOCS_ROOT, file)
  const [category] = relativePath.split('/')
  const id = basename(file, '.md')
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)

  if (!frontmatter) {
    errors.push(`${relativePath} 缺少 frontmatter`)
    return { file, relativePath, category, id, group: '', order: NaN, text }
  }

  const meta = Object.fromEntries(
    frontmatter[1]
      .split('\n')
      .map((line) => line.match(/^(\w+):\s*(.+)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, '')]),
  )
  const order = Number(meta.order)
  const h1 = [...removeFencedCode(frontmatter[2]).matchAll(/^#\s+(.+)$/gm)]

  if (!meta.group) errors.push(`${relativePath} 缺少 group`)
  if (!Number.isInteger(order) || order < 0) errors.push(`${relativePath} 的 order 必须是非负整数`)
  if (h1.length !== 1) errors.push(`${relativePath} 应且仅应包含一个 H1，实际 ${h1.length}`)

  return {
    file,
    relativePath,
    category,
    id,
    group: meta.group ?? '',
    order,
    title: h1[0]?.[1]?.trim() ?? id,
    text,
  }
}

walk(DOCS_ROOT)
const parsed = documents.map(parseDocument)
const byId = new Map()
const byGroupOrder = new Map()

for (const document of parsed) {
  const category = taxonomyByCategory.get(document.category)
  if (!category) {
    errors.push(`${document.relativePath} 位于未登记分类 ${document.category}`)
    continue
  }
  if (!category.groups.includes(document.group)) {
    errors.push(`${document.relativePath} 使用未登记分组「${document.group}」`)
  }

  const previousId = byId.get(document.id)
  if (previousId) {
    errors.push(
      `文档 id「${document.id}」重复：${previousId.relativePath} / ${document.relativePath}`,
    )
  } else byId.set(document.id, document)

  const orderKey = `${document.category}\0${document.group}\0${document.order}`
  const previousOrder = byGroupOrder.get(orderKey)
  if (previousOrder) {
    errors.push(
      `${document.category}/${document.group} 的 order ${document.order} 重复：` +
        `${previousOrder.relativePath} / ${document.relativePath}`,
    )
  } else byGroupOrder.set(orderKey, document)
}

for (const category of KNOWLEDGE_TAXONOMY) {
  const categoryDocuments = parsed.filter((document) => document.category === category.id)
  if (!categoryDocuments.some((document) => document.group === '开始这里')) {
    errors.push(`${category.id} 缺少「开始这里」入口文档`)
  }
}

for (const document of parsed) {
  const links = document.text.matchAll(/\]\(\.\/([\w-]+)\.md(?:#[^)]+)?\)/g)
  for (const link of links) {
    if (!byId.has(link[1])) {
      errors.push(`${document.relativePath} 引用了不存在的文档：./${link[1]}.md`)
    }
  }
}

console.log(`知识文档：${parsed.length}`)
for (const category of KNOWLEDGE_TAXONOMY) {
  const categoryDocuments = parsed.filter((document) => document.category === category.id)
  const groups = new Set(categoryDocuments.map((document) => document.group))
  console.log(`- ${category.title}：${categoryDocuments.length} 篇 / ${groups.size} 组`)
}

if (errors.length) {
  console.error(`结构校验失败：${errors.length} 项`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('结构校验通过：分类、分组、排序、文档 ID 与站内链接均有效')
