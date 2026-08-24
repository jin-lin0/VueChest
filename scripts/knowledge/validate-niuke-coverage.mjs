import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SOURCE = resolve(ROOT, 'src/docs/knowledge/interview/niuke.md')
const ANSWER_DIR = resolve(ROOT, 'src/docs/knowledge/interview')

const SECTION_FILES = new Map([
  ['一、JavaScript / TypeScript 基础', 'niuke-js-ts-full-qa.md'],
  ['二、框架原理（React / Vue）', 'niuke-framework-full-qa.md'],
  ['三、CSS / 渲染与布局', 'niuke-css-full-qa.md'],
  ['四、网络 / 浏览器', 'niuke-browser-network-full-qa.md'],
  ['五、工程化 / 性能 / 部署', 'niuke-engineering-full-qa.md'],
  ['六、AI / Agent（前端 Agent / AI 研发）', 'niuke-agent-full-qa.md'],
  ['七、场景 / 手写编程题', 'niuke-coding-scenario-full-qa.md'],
  ['八、HR / 软技能 / 开放题', 'niuke-hr-full-qa.md'],
  ['九、Agent 应用开发（不限技术栈：后端 / TS / 全栈）', 'niuke-agent-engineering-full-qa.md'],
])

const normalize = (value) => value.replace(/\s+/g, ' ').trim()

function parseSource(text) {
  const questions = []
  let section = ''
  let subsection = ''
  for (const [index, line] of text.split('\n').entries()) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim()
      subsection = ''
      continue
    }
    if (line.startsWith('### ')) {
      subsection = line.slice(4).trim()
      continue
    }
    if (!line.startsWith('- ') || !SECTION_FILES.has(section)) continue
    questions.push({
      question: normalize(line.slice(2)),
      subsection: normalize(subsection || section),
      filename: SECTION_FILES.get(section),
      sourceLine: index + 1,
    })
  }
  return questions
}

function parseAnswers(filename, text) {
  const lines = text.split('\n')
  const entries = []
  let subsection = ''
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('## ')) {
      subsection = normalize(line.slice(3))
      continue
    }
    if (!line.startsWith('### ')) continue

    let end = index + 1
    while (end < lines.length && !/^#{2,3} /.test(lines[end])) end += 1
    const block = lines.slice(index + 1, end).join('\n')
    const answer = normalize(block.replace(/^---\s*$/gm, '').replace(/^>\s?/gm, ''))
    entries.push({
      question: normalize(line.slice(4)),
      subsection,
      answer,
      filename,
      line: index + 1,
    })
    index = end - 1
  }
  return entries
}

const source = parseSource(readFileSync(SOURCE, 'utf8'))
const answers = [...SECTION_FILES.values()].flatMap((filename) =>
  parseAnswers(filename, readFileSync(resolve(ANSWER_DIR, filename), 'utf8')),
)
const errors = []
const sourceByQuestion = new Map()
const answerByQuestion = new Map()

for (const item of source) {
  if (sourceByQuestion.has(item.question)) errors.push(`源题重复：${item.question}`)
  else sourceByQuestion.set(item.question, item)
}

for (const answer of answers) {
  const previous = answerByQuestion.get(answer.question)
  if (previous) {
    errors.push(`答案重复：${answer.question}（${previous.filename} / ${answer.filename}）`)
  } else answerByQuestion.set(answer.question, answer)
}

for (const item of source) {
  const answer = answerByQuestion.get(item.question)
  if (!answer) {
    errors.push(`缺少答案：${item.question}（源文件第 ${item.sourceLine} 行）`)
    continue
  }
  if (answer.filename !== item.filename) {
    errors.push(`答案文件错误：${item.question}，应在 ${item.filename}，实际在 ${answer.filename}`)
  }
  if (answer.subsection !== item.subsection) {
    errors.push(
      `答案小节错误：${item.question}，应在“${item.subsection}”，实际在“${answer.subsection}”`,
    )
  }
  if (!answer.answer) errors.push(`答案为空：${item.question}`)
  else if (answer.answer.length < 40) {
    errors.push(`答案过短：${item.question}（${answer.answer.length} 字符）`)
  }
}

for (const answer of answers) {
  if (!sourceByQuestion.has(answer.question)) {
    errors.push(`答案不存在于源题：${answer.question}（${answer.filename}:${answer.line}）`)
  }
}

console.log(`牛客源题：${source.length}`)
console.log(`答案文件：${SECTION_FILES.size}`)
console.log(`答案条目：${answers.length}`)

if (errors.length) {
  console.error(`覆盖校验失败：${errors.length} 项`)
  errors.slice(0, 30).forEach((error) => console.error(`- ${error}`))
  if (errors.length > 30) console.error(`- 其余 ${errors.length - 30} 项已省略`)
  process.exit(1)
}

console.log(`覆盖校验通过：${source.length} / ${source.length}，题目文本、答案文件和小节均一致`)
