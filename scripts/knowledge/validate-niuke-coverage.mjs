import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SOURCE = resolve(ROOT, 'src/docs/knowledge/interview/niuke.md')
const ANSWER_DIR = resolve(ROOT, 'src/docs/knowledge/interview')

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function parseSource(text) {
  const questions = []
  let section = ''

  for (const [index, line] of text.split('\n').entries()) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim()
      continue
    }
    if (!line.startsWith('- ') || section === '参考来源 / 延伸阅读') continue
    questions.push({
      id: `NQ-${String(questions.length + 1).padStart(3, '0')}`,
      question: normalize(line.slice(2)),
      sourceLine: index + 1,
    })
  }
  return questions
}

function parseAnswers(filename, text) {
  const entries = []
  const blocks = text.split(/(?=^### NQ-\d{3}\s*$)/m)

  for (const block of blocks) {
    const heading = block.match(/^### (NQ-\d{3})\s*$/m)
    if (!heading) continue
    const marker = block.match(/<!-- niuke-id:(NQ-\d{3}) source-line:(\d+) -->/)
    const question = block.match(/^\*\*问题：\*\* (.+)$/m)
    const answerStart = block.indexOf('**面试者标准回答：**')
    const answer =
      answerStart >= 0
        ? block
            .slice(answerStart + '**面试者标准回答：**'.length)
            .split(/^---$|^## |^### NQ-/m)[0]
            .replace(/^>\s?/gm, '')
            .trim()
        : ''

    entries.push({
      id: heading[1],
      markerId: marker?.[1],
      sourceLine: Number(marker?.[2]),
      question: question ? normalize(question[1]) : '',
      answer: normalize(answer),
      filename,
    })
  }
  return entries
}

const source = parseSource(readFileSync(SOURCE, 'utf8'))
const answerFiles = readdirSync(ANSWER_DIR).filter((name) => /^niuke-.*-full-qa\.md$/.test(name))
const answers = answerFiles.flatMap((filename) =>
  parseAnswers(filename, readFileSync(resolve(ANSWER_DIR, filename), 'utf8')),
)
const byId = new Map()
const errors = []

for (const answer of answers) {
  if (byId.has(answer.id))
    errors.push(`${answer.id} 重复：${byId.get(answer.id).filename} / ${answer.filename}`)
  byId.set(answer.id, answer)
}

for (const item of source) {
  const answer = byId.get(item.id)
  if (!answer) {
    errors.push(`${item.id} 缺少答案（源文件第 ${item.sourceLine} 行）`)
    continue
  }
  if (answer.markerId !== item.id) errors.push(`${item.id} 标记缺失或不一致：${answer.filename}`)
  if (answer.sourceLine !== item.sourceLine) {
    errors.push(`${item.id} source-line 应为 ${item.sourceLine}，实际 ${answer.sourceLine}`)
  }
  if (answer.question !== item.question)
    errors.push(`${item.id} 问题文本与源题不一致：${answer.filename}`)
  if (!answer.answer || answer.answer.includes(`TODO ${item.id}`))
    errors.push(`${item.id} 尚未填写标准答案`)
  if (answer.answer.length < 40)
    errors.push(`${item.id} 标准答案过短（${answer.answer.length} 字符）`)
}

for (const answer of answers) {
  if (!source.some((item) => item.id === answer.id))
    errors.push(`${answer.id} 不存在于源题：${answer.filename}`)
}

console.log(`牛客源题：${source.length}`)
console.log(`答案文件：${answerFiles.length}`)
console.log(`答案条目：${answers.length}`)

if (errors.length) {
  console.error(`覆盖校验失败：${errors.length} 项`)
  errors.slice(0, 30).forEach((error) => console.error(`- ${error}`))
  if (errors.length > 30) console.error(`- 其余 ${errors.length - 30} 项已省略`)
  process.exit(1)
}

console.log('覆盖校验通过：400 / 400，问题文本一致且全部有标准答案')
