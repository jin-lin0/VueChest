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

const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password }),
})
const token = login.data.token
const auth = { Authorization: `Bearer ${token}` }

execSync('npm run build:market', { cwd: root, stdio: 'inherit' })

const apps = readdirSync(appsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
for (const entry of apps) {
  const appDir = join(appsDir, entry.name)
  const metaPath = join(appDir, 'meta.json')
  if (!existsSync(metaPath)) continue

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const dist = join(appDir, 'dist')
  const jsFile = readdirSync(dist).find((file) => file.endsWith('.js'))
  if (!jsFile) continue

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
    }),
  })
  await request(`/api/market/apps/${created.data.id}/approve`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  }).catch(() => {})
  console.log(`已上传 ${meta.name} (id=${created.data.id})`)
}
