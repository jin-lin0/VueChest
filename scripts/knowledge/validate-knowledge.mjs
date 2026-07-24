// 知识原子质量门禁：检查 raw/*.json 中每个原子是否符合规范。
// 用法：node scripts/knowledge/validate-knowledge.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW = resolve(__dirname, '../../src/apps/stock/knowledge/data/raw')
const CATS = new Set([
  '基础知识',
  '交易制度',
  '市场规律',
  '交易体系',
  '情绪周期',
  '盘口',
  '竞价',
  '龙头战法',
  '资金流',
  '游资',
  '机构',
  '板块',
  '案例',
  '统计',
  '风险',
  '心理',
  '术语',
  'FAQ',
  '经验',
  '观点',
  '待验证',
])
const SECTIONS = [
  '## 是什么',
  '## 为什么会发生',
  '## 什么时候成立',
  '## 什么时候失效',
  '## 案例',
  '## 反例',
  '## 争议与不同流派',
  '## 可信度与依据',
  '## 未来研究方向',
]

let files = readdirSync(RAW).filter((f) => f.endsWith('.json'))
let total = 0
let errors = 0
let warns = 0
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(RAW, f), 'utf8'))
  for (const a of arr) {
    total++
    const e = []
    if (!a.id) e.push('缺 id')
    if (!a.title) e.push('缺 title')
    if (!a.summary) e.push('缺 summary')
    if (!CATS.has(a.category)) e.push('分类非法: ' + a.category)
    if (typeof a.confidence !== 'number' || a.confidence < 0 || a.confidence > 100)
      e.push('confidence 越界: ' + a.confidence)
    if (!Array.isArray(a.tags) || !a.tags.length) e.push('缺 tags')
    if (!a.body || typeof a.body !== 'string') e.push('缺 body')
    else {
      for (const s of SECTIONS) if (!a.body.includes(s)) e.push('body 缺小节 ' + s)
    }
    if (!Array.isArray(a.citations) || !a.citations.length) e.push('缺 citations')
    else {
      const hasReal = a.citations.some((c) => c.source && c.source !== '经验观点')
      const hasExp = a.citations.some((c) => c.source === '经验观点')
      if (!hasReal && !hasExp) e.push('citations 无有效来源')
    }
    if (!a.futureResearch || !a.futureResearch.length) e.push('缺 futureResearch')
    if (e.length) {
      errors++
      console.log(`✗ [${f}] ${a.id || '?'}: ${e.join('; ')}`)
    } else {
      // 软警告
      if (a.confidence >= 80 && a.citations.every((c) => c.source === '经验观点')) {
        warns++
        console.log(`⚠ [${f}] ${a.id}: 高可信度却仅经验观点`)
      }
      if (a.body.length < 400) {
        warns++
        console.log(`⚠ [${f}] ${a.id}: body 偏短(${a.body.length})`)
      }
    }
  }
}
console.log(`\n校验完成：原子 ${total} ｜ 错误 ${errors} ｜ 警告 ${warns}`)
process.exit(errors ? 1 : 0)
