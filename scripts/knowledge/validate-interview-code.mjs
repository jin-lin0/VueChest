import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const ROOT = resolve(import.meta.dirname, '../..')
const DOCS = resolve(ROOT, 'src/docs/knowledge/interview')
const files = readdirSync(DOCS).filter((name) => name.endsWith('.md'))
const errors = []
let snippets = 0
const snippetsByFile = new Map()

for (const filename of files) {
  const markdown = readFileSync(resolve(DOCS, filename), 'utf8')
  const pattern = /^(`{3,})(?:js|javascript)\s*\n([\s\S]*?)^\1\s*$/gm
  let match

  while ((match = pattern.exec(markdown))) {
    snippets++
    snippetsByFile.set(filename, (snippetsByFile.get(filename) ?? 0) + 1)
    const code = match[2]
    const markdownLine = markdown.slice(0, match.index).split('\n').length + 1
    const source = ts.createSourceFile(
      `${filename}-snippet-${snippets}.mjs`,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    )

    for (const diagnostic of source.parseDiagnostics) {
      const position = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      errors.push(
        `${filename}:${markdownLine + position.line + 1}:${position.character + 1} ${message}`,
      )
    }
  }
}

console.log(`面试文档 JavaScript 代码块：${snippets}`)
for (const [filename, count] of snippetsByFile) console.log(`- ${filename}: ${count}`)

if (errors.length) {
  console.error(`代码语法校验失败：${errors.length} 项`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('代码语法校验通过')
