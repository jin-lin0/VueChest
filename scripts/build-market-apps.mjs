import { execSync } from 'child_process'
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const marketAppsDir = join(rootDir, 'market-apps')
const outputDir = join(rootDir, 'dist', 'market-apps')

if (!existsSync(marketAppsDir)) {
  console.error('market-apps 目录不存在')
  process.exit(1)
}

const apps = readdirSync(marketAppsDir, { withFileTypes: true }).filter(
  (d) =>
    d.isDirectory() &&
    !d.name.startsWith('.') &&
    d.name !== 'shared' &&
    existsSync(join(marketAppsDir, d.name, 'vite.config.ts')),
)

if (apps.length === 0) {
  console.log('没有找到市场 App')
  process.exit(0)
}

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

const failures = []

for (const app of apps) {
  const appDir = join(marketAppsDir, app.name)
  console.log(`Building: ${app.name}`)

  try {
    execSync('npx --no-install vite build', {
      cwd: appDir,
      stdio: 'pipe',
    })

    const distDir = join(appDir, 'dist')
    if (!existsSync(distDir)) throw new Error('构建完成后未生成 dist 目录')

    const jsFiles = []
    let cssContent = null

    for (const file of readdirSync(distDir)) {
      if (file.endsWith('.css')) {
        cssContent = readFileSync(join(distDir, file), 'utf-8')
      } else if (file.endsWith('.js')) {
        jsFiles.push(file)
      }
    }
    if (jsFiles.length === 0) throw new Error('构建完成后未生成 JavaScript 入口')

    for (const file of jsFiles) {
      let code = readFileSync(join(distDir, file), 'utf-8')
      if (cssContent) {
        code = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(cssContent)};document.head.appendChild(s)})();` + code
      }
      const dest = join(outputDir, `${app.name}-${file}`)
      writeFileSync(dest, code, 'utf-8')
      // 尺寸直接取自落盘文件，而不是 code.length：后者是 UTF-16 码元数，而产物里满是
      // 中文标签与 emoji，一个码元在 UTF-8 下要占 3~4 字节。按 code.length 报会把 CJK 密集的
      // App 少报 1%~6%（ai-notes 就少报了 6.5%），让「产物到底多大」这个判断失去意义。
      const bytes = statSync(dest).size
      console.log(`  → ${dest} (${bytes} bytes${cssContent ? '，含内联 CSS' : ''})`)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    failures.push({ app: app.name, message })
    console.error(`  Failed: ${message}`)
    const output = [e?.stdout, e?.stderr]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join('\n')
    if (output) console.error(output)
  }
}

if (failures.length > 0) {
  console.error(`\n市场 App 构建失败：${failures.map((item) => item.app).join('、')}`)
  process.exitCode = 1
} else {
  console.log(`\n所有 App 已构建完成，输出目录: ${outputDir}`)
}
