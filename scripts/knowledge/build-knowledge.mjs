// 知识库聚合脚本
// 读取 src/apps/stock/knowledge/data/raw/<domain>.json（每个文件是 KnowledgeAtom[]），
// 聚合为前端运行时的三个必需产物：atoms.json（全量原子）/ index.json（统计与分类标签筛选）/
// graph.json（知识图谱）。其余 tags/citations/faq/cases/stats/meta 与 knowledge-base.md /
// research-plan.md 此前为冗余预聚合/可读导出，前端从不 fetch，已全部移除（数据均可从 atoms 重算）。
//
// 用法：node scripts/knowledge/build-knowledge.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getR2, uploadFile, listObjects } from './r2-kb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const RAW_DIR = join(ROOT, 'src/apps/stock/knowledge/data/raw')
const OUT_DIR = join(ROOT, 'src/apps/stock/knowledge/data/generated')

const CATEGORIES = [
  '基础知识', '交易制度', '市场规律', '交易体系', '情绪周期', '盘口', '竞价',
  '龙头战法', '资金流', '游资', '机构', '板块', '案例', '统计', '风险', '心理',
  '术语', 'FAQ', '经验', '观点', '待验证',
]

function normAtom(a, file) {
  const id = String(a.id || '').trim()
  if (!id) throw new Error(`[${file}] 缺少 id：${JSON.stringify(a).slice(0, 80)}`)
  const category = CATEGORIES.includes(a.category) ? a.category : '经验'
  return {
    id,
    title: String(a.title || id),
    summary: String(a.summary || ''),
    category,
    tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
    keywords: Array.isArray(a.keywords) ? a.keywords.map(String) : [],
    confidence: Number.isFinite(a.confidence) ? Math.max(0, Math.min(100, a.confidence)) : 50,
    body: String(a.body || ''),
    citations: Array.isArray(a.citations) ? a.citations : [],
    related: Array.isArray(a.related) ? a.related.map(String) : [],
    futureResearch: Array.isArray(a.futureResearch) ? a.futureResearch.map(String) : [],
    updatedAt: String(a.updatedAt || new Date().toISOString().slice(0, 10)),
    status: a.status || 'unverified',
    caseType: a.caseType,
    author: a.author || file.replace(/\.json$/, ''),
  }
}

async function main() {
  if (!existsSync(RAW_DIR)) {
    console.error('raw 目录不存在：', RAW_DIR)
    process.exit(1)
  }
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))

  // 防误覆盖：发布前比对本地 raw 与 R2 raw，若 R2 上有本地缺失的文件，
  // 直接发布会把聚合产物（atoms.json 等）覆盖成子集，漏掉已存原子。
  const r2Check = getR2()
  if (r2Check) {
    try {
      const localNames = new Set(files)
      const r2Keys = await listObjects(r2Check, `${r2Check.prefix}/raw/`)
      const r2Names = new Set(r2Keys.map((k) => k.split('/').pop()).filter(Boolean))
      const missing = [...r2Names].filter((n) => !localNames.has(n))
      if (missing.length > 0) {
        console.error(
          `\n⚠️  本地 raw 比 R2 少 ${missing.length} 个文件，直接发布会把聚合产物覆盖成「子集」` +
            `（漏掉 R2 上已有的原子）：`,
        )
        for (const m of missing.slice(0, 20)) console.error('     - ' + m)
        if (missing.length > 20) console.error(`     …（其余 ${missing.length - 20} 个省略）`)
        console.error('\n请先拉全量 raw 再发布：')
        console.error('    node scripts/knowledge/kb-sync-raw.mjs --pull')
        console.error('    node scripts/knowledge/build-knowledge.mjs\n')
        if (!process.argv.includes('--force')) {
          console.error('已中止。若确认要以本地 raw 为准整体覆盖，可加 --force 跳过本检查。\n')
          process.exit(1)
        }
        console.error('（--force 已指定，继续以本地 raw 聚合）\n')
      }
    } catch (e) {
      console.warn(`（跳过 R2 raw 比对：无法列举 R2 raw —— ${e.message}）`)
    }
  }
  const atoms = []
  const seen = new Map()
  for (const f of files) {
    const full = join(RAW_DIR, f)
    let arr
    try {
      arr = JSON.parse(readFileSync(full, 'utf8'))
    } catch (e) {
      console.error(`解析失败 ${f}:`, e.message)
      process.exit(1)
    }
    if (!Array.isArray(arr)) {
      console.error(`跳过 ${f}：应为数组`)
      continue
    }
    for (const raw of arr) {
      const a = normAtom(raw, f)
      if (seen.has(a.id)) {
        console.warn(`重复 ID 已忽略：${a.id} (in ${f})`)
        continue
      }
      seen.set(a.id, true)
      atoms.push(a)
    }
  }
  atoms.sort((x, y) => x.id.localeCompare(y.id))

  // index
  const byCategory = {}
  const byTag = {}
  for (const a of atoms) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1
    for (const t of a.tags) byTag[t] = (byTag[t] || 0) + 1
  }
  const allCats = CATEGORIES.filter((c) => byCategory[c])
  const index = {
    total: atoms.length,
    generatedAt: new Date().toISOString(),
    byCategory: allCats.map((c) => ({ category: c, count: byCategory[c] })),
    byTag: Object.entries(byTag)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count })),
    avgConfidence: Math.round(atoms.reduce((s, a) => s + a.confidence, 0) / Math.max(1, atoms.length)),
  }

  // graph.json
  const idSet = new Set(atoms.map((a) => a.id))
  const nodes = atoms.map((a) => ({ id: a.id, title: a.title, category: a.category, tags: a.tags, confidence: a.confidence }))
  const edgeKey = new Set()
  const edges = []
  const addEdge = (s, t, kind, weight = 1) => {
    if (s === t) return
    const k = [s, t].sort().join('|') + '|' + kind
    if (edgeKey.has(k)) return
    edgeKey.add(k)
    edges.push({ source: s, target: t, kind, weight })
  }
  for (const a of atoms) {
    for (const r of a.related) if (idSet.has(r)) addEdge(a.id, r, 'related')
  }
  // 标签共现（共享 >=2 个标签才连边，限制图规模）
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const shared = atoms[i].tags.filter((t) => atoms[j].tags.includes(t))
      if (shared.length >= 2) addEdge(atoms[i].id, atoms[j].id, 'tag', shared.length)
    }
  }

  // 写出前端运行时的三个必需产物
  const write = (name, obj) => writeFileSync(join(OUT_DIR, name), JSON.stringify(obj, null, 2), 'utf8')
  write('atoms.json', atoms)
  write('index.json', index)
  write('graph.json', { nodes, edges })

  // 发布到 R2（可选）：仅上传前端运行时拉取的 3 个产物到 stock/knowledge/generated/
  const r2 = getR2()
  if (r2) {
    console.log('→ 发布到 R2：')
    const outFiles = ['atoms.json', 'index.json', 'graph.json']
    for (const name of outFiles) {
      const url = await uploadFile(r2, join(OUT_DIR, name), `${r2.prefix}/generated/${name}`)
      console.log('   ↑', url)
    }
  } else {
    console.log('（未配置 R2 环境变量，跳过上传，仅本地产出）')
  }

  console.log(`✓ 知识库聚合完成：${atoms.length} 个原子 / ${allCats.length} 分类 / ${index.byTag.length} 标签 / ${edges.length} 关联边`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
