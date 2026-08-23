import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SOURCE = resolve(ROOT, 'src/docs/knowledge/interview/niuke.md')
const OUTPUT_DIR = resolve(ROOT, 'src/docs/knowledge/interview')

const FILES = new Map([
  ['一、JavaScript / TypeScript 基础', ['niuke-js-ts-full-qa.md', 51]],
  ['二、框架原理（React / Vue）', ['niuke-framework-full-qa.md', 52]],
  ['三、CSS / 渲染与布局', ['niuke-css-full-qa.md', 53]],
  ['四、网络 / 浏览器', ['niuke-browser-network-full-qa.md', 54]],
  ['五、工程化 / 性能 / 部署', ['niuke-engineering-full-qa.md', 55]],
  ['六、AI / Agent（前端 Agent / AI 研发）', ['niuke-agent-full-qa.md', 56]],
  ['七、场景 / 手写编程题', ['niuke-coding-scenario-full-qa.md', 57]],
  ['八、HR / 软技能 / 开放题', ['niuke-hr-full-qa.md', 58]],
  [
    '九、Agent 应用开发（不限技术栈：后端 / TS / 全栈）',
    ['niuke-agent-engineering-full-qa.md', 59],
  ],
])

function parseQuestions(text) {
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
    if (!line.startsWith('- ') || !FILES.has(section)) continue

    questions.push({
      id: `NQ-${String(questions.length + 1).padStart(3, '0')}`,
      section,
      subsection,
      question: line.slice(2).trim(),
      sourceLine: index + 1,
    })
  }
  return questions
}

function render(section, order, questions) {
  const parts = [
    '---',
    'group: 牛客全量答案',
    `order: ${order}`,
    '---',
    '',
    `# 牛客全量标准答案 · ${section}`,
    '',
    '> 本文逐条对应《牛客面试题库》，编号由源题顺序生成。每题均需保留 `niuke-id` 标记，供覆盖校验器检查。',
    '',
  ]

  let lastSubsection = null
  for (const item of questions) {
    const subsection = item.subsection || section
    if (subsection !== lastSubsection) {
      parts.push('---', '', `## ${subsection}`, '')
      lastSubsection = subsection
    }

    parts.push(
      `### ${item.id}`,
      '',
      `<!-- niuke-id:${item.id} source-line:${item.sourceLine} -->`,
      '',
      `**问题：** ${item.question}`,
      '',
      '**面试者标准回答：**',
      '',
      `> TODO ${item.id}`,
      '',
    )
  }

  parts.push(
    '---',
    '',
    '## 参考来源',
    '',
    '- [牛客网面试经验](https://www.nowcoder.com/discuss)',
    '',
  )
  return parts.join('\n')
}

const questions = parseQuestions(readFileSync(SOURCE, 'utf8'))
if (questions.length !== 400) {
  throw new Error(`预期解析 400 条牛客题，实际 ${questions.length} 条；请先检查源题结构`)
}

for (const [section, [filename, order]] of FILES) {
  const target = resolve(OUTPUT_DIR, filename)
  if (existsSync(target)) {
    throw new Error(`目标文件已存在，拒绝覆盖：${target}`)
  }
  const selected = questions.filter((item) => item.section === section)
  writeFileSync(target, render(section, order, selected))
  console.log(`${filename}: ${selected.length} 题`)
}

console.log(`共生成 ${questions.length} 条答案骨架`)
