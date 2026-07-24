// 知识库 raw 原子 与 R2 的双向同步
// 用法：
//   node scripts/knowledge/kb-sync-raw.mjs --pull   从 R2 knowledge/raw/ 下载全部到本地 data/raw/
//   node scripts/knowledge/kb-sync-raw.mjs --push   把本地 data/raw/*.json 上传到 R2 knowledge/raw/
import { readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getR2, uploadFile, listObjects, downloadFile } from './r2-kb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const RAW_DIR = join(ROOT, 'src/apps/stock/knowledge/data/raw')

const mode = process.argv[2]
if (mode !== '--pull' && mode !== '--push') {
  console.error('用法: node scripts/knowledge/kb-sync-raw.mjs [--pull|--push]')
  process.exit(1)
}

const r2 = getR2()
if (!r2) {
  console.error(
    '未配置 R2 环境变量（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY），无法同步。',
  )
  process.exit(1)
}

async function main() {
  if (mode === '--pull') {
    const keys = await listObjects(r2, `${r2.prefix}/raw/`)
    if (!keys.length) {
      console.log('R2 上没有 raw 原子。')
      return
    }
    for (const key of keys) {
      const name = key.split('/').pop()
      const local = join(RAW_DIR, name)
      await downloadFile(r2, key, local)
      console.log('  ↓', key)
    }
    console.log(`✓ 已从 R2 拉取 ${keys.length} 个 raw 文件到 ${RAW_DIR}`)
  } else {
    if (!existsSync(RAW_DIR)) {
      console.error('本地 raw 目录不存在：', RAW_DIR)
      process.exit(1)
    }
    const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))
    for (const f of files) {
      const url = await uploadFile(r2, join(RAW_DIR, f), `${r2.prefix}/raw/${f}`)
      console.log('  ↑', url)
    }
    console.log(`✓ 已上传 ${files.length} 个 raw 文件到 R2 ${r2.prefix}/raw/`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
