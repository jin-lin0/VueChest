import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const appsDir = join(root, 'market-apps')
const envPath = join(root, '.env')
const prodPath = join(root, '.env.production')

function loadEnv(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

loadEnv(envPath)
loadEnv(prodPath)

const apiBase = process.env.VITE_API_BASE_URL || 'https://server.020201.xyz'
const username = process.env.MARKET_USER || 'admin'
const password = process.env.MARKET_PASS
if (!password) throw new Error('缺少 MARKET_PASS')

async function request(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

// 可选参数：只发布指定的应用（传目录名），例如
//   pnpm publish:market ai-notes
// 不传则发布 market-apps/ 下的全部应用。
// 放在登录之前，参数写错时直接失败，不必先打一次网络请求。
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
if (only.length) {
  const missing = only.filter((name) => !existsSync(join(appsDir, name, 'meta.json')))
  if (missing.length) throw new Error(`找不到这些应用（需要 market-apps/<名字>/meta.json）：${missing.join(', ')}`)
}

const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password }),
})
const token = login.data.token
const auth = { Authorization: `Bearer ${token}` }

// 直接调构建脚本，不经过 npm/pnpm，避免依赖包管理器是否在 PATH 上
execSync(`"${process.execPath}" scripts/build-market-apps.mjs`, { cwd: root, stdio: 'inherit' })

const apps = readdirSync(appsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => (only.length ? only.includes(entry.name) : true))

let published = 0
for (const entry of apps) {
  const appDir = join(appsDir, entry.name)
  const metaPath = join(appDir, 'meta.json')
  if (!existsSync(metaPath)) continue

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const dist = join(appDir, 'dist')
  if (!existsSync(dist)) throw new Error(`${meta.name}: 缺少构建产物 ${dist}`)
  const jsFile = readdirSync(dist).find((file) => file.endsWith('.js'))
  if (!jsFile) throw new Error(`${meta.name}: dist 里没有 .js 入口`)

  let code = readFileSync(join(dist, jsFile), 'utf8')
  const cssFile = readdirSync(dist).find((file) => file.endsWith('.css'))
  if (cssFile) {
    const css = readFileSync(join(dist, cssFile), 'utf8')
    code = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();${code}`
  }

  const file = new File([code], jsFile, {
    type: 'application/javascript',
  })
  const sha256 = createHash('sha256').update(code).digest('hex')
  const version = meta.version || '1.0.0'
  const presign = await request('/api/uploads/presign', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      kind: 'app',
      contentType: file.type,
      size: file.size,
      name: `${meta.name}-v${version}`,
      sha256,
    }),
  })

  const uploaded = await fetch(presign.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, ...(presign.data.headers || {}) },
    body: file,
  })
  if (!uploaded.ok) throw new Error(`${meta.name}: R2 上传失败 (${uploaded.status})`)

  await request('/api/uploads/complete', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ kind: 'app', key: presign.data.key, sha256 }),
  })
  const created = await request('/api/market/apps', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: meta.name,
      icon: meta.icon,
      description: meta.description || '',
      version,
      category: meta.category || '工具',
      readme: meta.readme || '',
      fileKey: presign.data.key,
      fileSize: file.size,
      sha256,
      // meta.json 里的能力权限必须一起提交：服务端 serializePermissions(undefined)
      // 会静默存成 "[]"，漏传就等于应用一个能力都没声明，权限模型会悄无声息地失效。
      // 注意 allowNetwork 不在这里 —— 按 market-spec.md，联网白名单不由应用自声明。
      permissions: Array.isArray(meta.permissions) ? meta.permissions : [],
    }),
  })
  await request(`/api/market/apps/${created.data.id}/approve`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  }).catch(() => {})
  console.log(`已上传 ${meta.name} (id=${created.data.id})`)
  published += 1
}

if (!published) throw new Error('没有发布任何应用（检查是否缺少 dist 产物）')
console.log(`\n完成：本次发布 ${published} 个应用（目标 ${apiBase}）`)
