import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = resolve(ROOT, 'dist')
const html = readFileSync(resolve(DIST, 'index.html'), 'utf8')
const entry = html.match(/<script type="module"[^>]+src="([^"]+)"/)?.[1]
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
  (match) => match[1],
)
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith('/assets/'))

if (!entry) throw new Error('dist/index.html 未找到入口脚本')

function size(path) {
  const file = resolve(DIST, path.replace(/^\//, ''))
  const buffer = readFileSync(file)
  return { raw: statSync(file).size, gzip: gzipSync(buffer).length }
}

const initialJs = [entry, ...preloads].map((path) => ({ path, ...size(path) }))
const initialCss = styles.map((path) => ({ path, ...size(path) }))
const jsGzip = initialJs.reduce((sum, item) => sum + item.gzip, 0)
const cssGzip = initialCss.reduce((sum, item) => sum + item.gzip, 0)
const budgets = {
  entryGzip: 30 * 1024,
  initialJsGzip: 100 * 1024,
  initialCssGzip: 12 * 1024,
  modulePreloads: 1,
}
const errors = []
if (initialJs[0].gzip > budgets.entryGzip)
  errors.push(`入口 JS gzip ${initialJs[0].gzip} > ${budgets.entryGzip}`)
if (jsGzip > budgets.initialJsGzip)
  errors.push(`首屏 JS gzip ${jsGzip} > ${budgets.initialJsGzip}`)
if (cssGzip > budgets.initialCssGzip)
  errors.push(`首屏 CSS gzip ${cssGzip} > ${budgets.initialCssGzip}`)
if (preloads.length > budgets.modulePreloads)
  errors.push(`modulepreload ${preloads.length} > ${budgets.modulePreloads}`)
if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html))
  errors.push('首页不应预连接或加载音游专用字体')

console.log('首屏体积：')
initialJs.forEach((item) =>
  console.log(`- JS ${item.path}: ${(item.gzip / 1024).toFixed(1)} KB gzip`),
)
initialCss.forEach((item) =>
  console.log(`- CSS ${item.path}: ${(item.gzip / 1024).toFixed(1)} KB gzip`),
)
console.log(`- 合计 JS: ${(jsGzip / 1024).toFixed(1)} KB gzip`)
console.log(`- 合计 CSS: ${(cssGzip / 1024).toFixed(1)} KB gzip`)
if (errors.length) {
  errors.forEach((error) => console.error(`预算失败：${error}`))
  process.exit(1)
}
console.log('构建体积预算通过')
