#!/usr/bin/env node

/**
 * 打包并上传所有 Market App 到服务端
 *
 * 用法:
 *   npm run publish:market           # 自动读取 .env 中的凭证
 *   npm run publish:market --prod    # 生产模式 (优先读 .env.production 的 API_BASE)
 *
 * MARKET_USER / MARKET_PASS 放在 .env 里，所有模式共享
 *
 * 自动读取 .env 文件中的 MARKET_USER / MARKET_PASS，
 * 设置一次即可，不用每次手动传。
 * 示例 .env.development 中加两行:
 *   MARKET_USER=admin
 *   MARKET_PASS=yourpass
 *
 * 处理重复: 如果同名 App 已存在，自动更新而非新建
 */

import { execSync } from 'child_process'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const marketAppsDir = join(rootDir, 'market-apps')

// 加载 .env 文件中的变量 (不覆盖已设置的环境变量)
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const lines = readFileSync(filePath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

// 先加载公共 .env，再按模式覆盖
loadEnvFile(join(rootDir, '.env'))
const isProd = process.argv.includes('--prod')
const modeEnvFile = isProd ? join(rootDir, '.env.production') : join(rootDir, '.env.development')
loadEnvFile(modeEnvFile)

const API_BASE = process.env.API_BASE || process.env.VITE_API_BASE_URL || 'http://localhost:3000'
const USERNAME = process.env.MARKET_USER || 'admin'
const PASSWORD = process.env.MARKET_PASS || ''

if (!PASSWORD) {
  console.error('❌ 请设置环境变量 MARKET_PASS，例如:')
  console.error('   MARKET_PASS=yourpass node scripts/publish-market-apps.mjs')
  process.exit(1)
}

// ========== 工具函数 ==========

async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function apiPut(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function apiGet(path, token) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { headers })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

// ========== 主流程 ==========

async function main() {
  console.log(`🚀 Market App 打包上传工具`)
  console.log(`   API: ${API_BASE}`)
  console.log(`   用户: ${USERNAME}`)
  console.log()

  // 1. 登录
  console.log('1️⃣  登录获取 Token...')
  let token
  try {
    const loginRes = await apiPost('/api/auth/login', { username: USERNAME, password: PASSWORD })
    token = loginRes.data.token
    console.log(`   ✅ 登录成功 (${loginRes.data.user.role})`)
  } catch (e) {
    console.error(`   ❌ 登录失败: ${e.message}`)
    process.exit(1)
  }

  // 2. 扫描 market-apps
  const apps = readdirSync(marketAppsDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && !d.name.startsWith('.'),
  )

  if (apps.length === 0) {
    console.log('没有找到 Market App')
    process.exit(0)
  }

  console.log(`\n2️⃣  处理 ${apps.length} 个 App...\n`)

  let built = 0,
    uploaded = 0,
    updated = 0,
    skipped = 0

  for (const app of apps) {
    const appName = app.name
    console.log(`📦 ${appName}`)

    // 2a. 读取 meta.json
    const metaPath = join(marketAppsDir, appName, 'meta.json')
    if (!existsSync(metaPath)) {
      console.log(`   ⚠️  缺少 meta.json，跳过`)
      skipped++
      continue
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))

    // 2b. 检查是否存在同名 App
    let existingApp = null
    try {
      const res = await apiGet(`/api/market/apps?keyword=${encodeURIComponent(meta.name)}`, token)
      const items = res.data.items || []
      // 精确匹配名称（忽略 pending/rejected 状态）
      existingApp = items.find((a) => a.name === meta.name)
    } catch (e) {
      console.log(`   ⚠️  查询失败: ${e.message}`)
    }

    // 2c. 构建
    const appDir = join(marketAppsDir, appName)
    try {
      execSync('npx vite build', { cwd: appDir, stdio: 'pipe' })
    } catch (e) {
      console.log(`   ❌ 构建失败: ${e.stderr?.toString() || e.message}`)
      skipped++
      continue
    }
    built++

    // 2d. 读取构建产物并内联 CSS
    const distDir = join(appDir, 'dist')
    const distFiles = readdirSync(distDir)
    const jsFile = distFiles.find((f) => f.endsWith('.js') && f !== 'index.html')
    const cssFile = distFiles.find((f) => f.endsWith('.css'))

    if (!jsFile) {
      console.log(`   ⚠️  未找到构建产物`)
      skipped++
      continue
    }

    let fileContent = readFileSync(join(distDir, jsFile), 'utf-8')
    if (cssFile) {
      const cssContent = readFileSync(join(distDir, cssFile), 'utf-8')
      fileContent =
        `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(cssContent)};document.head.appendChild(s)})();` +
        fileContent
    }

    const sizeKB = (Buffer.byteLength(fileContent) / 1024).toFixed(1)

    // 2e. 上传
    const payload = {
      name: meta.name,
      icon: meta.icon,
      description: meta.description,
      version: meta.version || '1.0.0',
      category: meta.category || '工具',
      fileContent,
      readme: meta.readme || '',
    }

    try {
      if (existingApp) {
        // 更新现有 App
        await apiPut(`/api/market/apps/${existingApp.id}`, payload, token)
        console.log(`   ✅ 已更新 (${sizeKB} KB, v${meta.version}, id=${existingApp.id})`)

        // 如果之前被拒绝了，自动提交审批
        if (existingApp.status === 'rejected') {
          try {
            await apiPost(`/api/market/apps/${existingApp.id}/approve`, {}, token)
            console.log(`   ✅ 已重新提交审核`)
          } catch {}
        }
        updated++
      } else {
        // 新建
        const createRes = await apiPost('/api/market/apps', payload, token)
        const newId = createRes.data.id
        console.log(`   ✅ 已上传 (${sizeKB} KB, v${meta.version}, id=${newId})`)

        // 尝试自动审核通过（需要 admin 权限）
        try {
          await apiPost(`/api/market/apps/${newId}/approve`, {}, token)
          console.log(`   ✅ 已审核通过`)
        } catch {
          console.log(`   ℹ️  等待管理员审核`)
        }
        uploaded++
      }
    } catch (e) {
      console.log(`   ❌ 上传失败: ${e.message}`)
      skipped++
    }
  }

  console.log()
  console.log('━'.repeat(40))
  console.log(`📊 结果: 构建 ${built} | 新建 ${uploaded} | 更新 ${updated} | 跳过 ${skipped}`)
  console.log('━'.repeat(40))
}

main().catch((e) => {
  console.error('脚本异常:', e.message)
  process.exit(1)
})
