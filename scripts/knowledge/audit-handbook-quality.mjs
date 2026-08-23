import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const knowledgeRoot = path.join(projectRoot, 'src/docs/knowledge')
const categories = ['frontend', 'ai', 'backend', 'interview']
const overviewFiles = new Set(['frontend-overview.md', 'ai-overview.md', 'backend-overview.md'])

function stripFrontmatter(markdown) {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
}

function stripCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

function knowledgeUnits(markdown) {
  return (stripCode(markdown).match(/[\p{Script=Han}]|[A-Za-z0-9_]+/gu) ?? []).length
}

function externalLinks(markdown) {
  const markdownLinks = [...markdown.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map(
    (match) => match[1],
  )
  const autolinks = [...markdown.matchAll(/<(https?:\/\/[^>]+)>/g)].map((match) => match[1])
  return [...new Set([...markdownLinks, ...autolinks])]
}

function handbookSignals(markdown) {
  const plain = stripCode(markdown)
  return {
    depth: knowledgeUnits(markdown) >= 1000,
    structure: (plain.match(/^## /gm) ?? []).length >= 7,
    examples: (markdown.match(/^```/gm) ?? []).length >= 4,
    pitfalls: /常见坑|高频坑|注意事项|边界条件|误区|陷阱|排障/.test(plain),
    decisions: /检查清单|实践清单|决策清单|决策树|选型清单|最佳实践|落地清单/.test(plain),
    sources:
      /参考来源|参考资料|延伸阅读|权威来源/.test(plain) && externalLinks(markdown).length >= 2,
  }
}

const rows = []
for (const category of categories) {
  const categoryRoot = path.join(knowledgeRoot, category)
  for (const filename of fs.readdirSync(categoryRoot).filter((name) => name.endsWith('.md'))) {
    const markdown = fs.readFileSync(path.join(categoryRoot, filename), 'utf8')
    const body = stripFrontmatter(markdown)
    const profile =
      category === 'interview' ? 'interview' : overviewFiles.has(filename) ? 'overview' : 'handbook'
    const signals = handbookSignals(body)
    rows.push({ category, filename, profile, units: knowledgeUnits(body), signals })
  }
}

const handbookRows = rows.filter((row) => row.profile === 'handbook')
const signalNames = ['depth', 'structure', 'examples', 'pitfalls', 'decisions', 'sources']

console.log(`知识文档：${rows.length}`)
console.log(`通用技术手册：${handbookRows.length}`)
for (const category of ['frontend', 'ai', 'backend']) {
  const categoryRows = handbookRows.filter((row) => row.category === category)
  const complete = categoryRows.filter((row) =>
    signalNames.every((name) => row.signals[name]),
  ).length
  console.log(`- ${category}: ${complete}/${categoryRows.length} 达到六维门槛`)
}

const incomplete = handbookRows
  .map((row) => ({
    ...row,
    score: signalNames.filter((name) => row.signals[name]).length,
    missing: signalNames.filter((name) => !row.signals[name]),
  }))
  .filter((row) => row.missing.length)
  .sort((a, b) => a.score - b.score || a.units - b.units)

console.log(`\n待完善：${incomplete.length}`)
for (const row of incomplete) {
  console.log(
    `${row.category}/${row.filename}: ${row.score}/6, ${row.units} units, 缺少 ${row.missing.join(', ')}`,
  )
}

function count(markdown, pattern) {
  return (markdown.match(pattern) ?? []).length
}

function readInterview(filename) {
  return stripFrontmatter(fs.readFileSync(path.join(knowledgeRoot, 'interview', filename), 'utf8'))
}

const interviewChecks = []
const interviewProblems = []

for (const [filename, minimumQuestions] of [
  ['frontend-core-qa.md', 25],
  ['agent-core-qa.md', 25],
  ['agent-engineering-qa.md', 15],
  ['vuechest-project-qa.md', 20],
]) {
  const markdown = readInterview(filename)
  const questions = count(markdown, /^### Q\d+[：:]/gm)
  const answers = count(markdown, /^\*\*面试者标准回答(?:模板)?：\*\*/gm)
  const ready = questions >= minimumQuestions && questions === answers
  interviewChecks.push(`${filename}: ${questions} 问 / ${answers} 答`)
  if (!ready) interviewProblems.push(`${filename} 的问题与面试者标准回答未一一对应`)
}

for (const filename of ['algorithm.md', 'scenario.md']) {
  const markdown = readInterview(filename)
  const questions = count(markdown, /^\*\*📌 原题\*\*/gm)
  const answers = count(markdown, /^\*\*✅ 标准答案\*\*/gm)
  const javascript = count(markdown, /^```(?:js|javascript)\s*$/gm)
  const ready = questions > 0 && questions === answers && answers === javascript
  interviewChecks.push(`${filename}: ${questions} 题 / ${answers} 答 / ${javascript} 段 JS`)
  if (!ready) interviewProblems.push(`${filename} 的手写题、标准答案与 JS 代码未一一对应`)
}

for (const filename of ['frontend.md', 'agent.md']) {
  const markdown = readInterview(filename)
  const questions = count(markdown, /^\*\*高频问题\*\*[：:]/gm)
  const answers = count(markdown, /^\*\*答案要点\*\*[：:]/gm)
  const ready = questions >= 50 && questions === answers
  interviewChecks.push(`${filename}: ${questions} 问 / ${answers} 组要点`)
  if (!ready) interviewProblems.push(`${filename} 的速查问题与答案要点未一一对应`)
}

{
  const filename = 'mock-interviews.md'
  const markdown = readInterview(filename)
  const questions = count(markdown, /^### \d+\./gm)
  const answers = count(markdown, /^\*\*(?:标准回答(?:模板)?|讲解标准)：\*\*/gm)
  interviewChecks.push(`${filename}: ${questions} 问 / ${answers} 答`)
  if (questions < 20 || questions !== answers)
    interviewProblems.push(`${filename} 的模拟问题与标准回答未一一对应`)
}

{
  const filename = 'vuechest-project-qa.md'
  const markdown = readInterview(filename)
  for (const signal of ['项目亮点地图', '90 秒', '简历']) {
    if (!markdown.includes(signal)) interviewProblems.push(`${filename} 缺少“${signal}”亮点信号`)
  }
}

console.log(`\n非牛客面试材料：${interviewProblems.length ? '需修正' : '结构就绪'}`)
for (const result of interviewChecks) console.log(`- ${result}`)
for (const problem of interviewProblems) console.log(`- 问题：${problem}`)

if (process.argv.includes('--strict') && (incomplete.length || interviewProblems.length)) {
  process.exitCode = 1
}
