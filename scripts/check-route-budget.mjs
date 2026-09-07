import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = resolve(ROOT, 'dist')
const manifest = JSON.parse(readFileSync(resolve(DIST, '.vite/manifest.json'), 'utf8'))

const routeBudgets = [
  {
    name: '应用中心',
    budget: 90 * 1024,
    resolveKey: () => 'src/views/WorkspaceHome.vue',
  },
  {
    name: '股票研究工作台',
    budget: 30 * 1024,
    resolveKey: () =>
      Object.keys(manifest).find((key) =>
        manifest[key].dynamicImports?.includes('src/apps/stock/components/PortfolioPanel.vue'),
      ),
  },
  {
    name: 'API 工作台',
    budget: 95 * 1024,
    resolveKey: () =>
      manifest['src/apps/api-manager/App.vue']
        ? 'src/apps/api-manager/App.vue'
        : Object.keys(manifest).find((key) =>
            manifest[key].dynamicImports?.includes('src/apps/api-manager/importers.ts'),
          ),
    eagerDynamic: [{ source: 'src/apps/api-manager/defaults.ts' }],
  },
  {
    name: '面试题库',
    budget: 85 * 1024,
    resolveKey: () => 'src/apps/interview/App.vue',
  },
  {
    name: 'AI 聊天',
    budget: 80 * 1024,
    resolveKey: () => 'src/apps/ai-chat/App.vue',
  },
  {
    name: 'B站字幕分析',
    budget: 90 * 1024,
    resolveKey: () => 'src/apps/bilibili-subtitle/App.vue',
  },
  {
    name: '节奏音游',
    budget: 35 * 1024,
    resolveKey: () =>
      manifest['src/apps/rhythm/App.vue']
        ? 'src/apps/rhythm/App.vue'
        : Object.keys(manifest).find((key) =>
            manifest[key].dynamicImports?.includes('src/apps/rhythm/components/PlayView.vue'),
          ),
  },
  {
    name: '3D 赛车',
    budget: 290 * 1024,
    resolveKey: () => 'src/apps/racing/App.vue',
  },
  {
    name: '题目编辑器',
    // Markdown 编辑器在页面首帧就渲染，虽然通过 defineAsyncComponent 拆包，
    // 仍属于首次进入成本。该后台页面允许更高预算，但必须如实计入编辑器 chunk。
    budget: 400 * 1024,
    resolveKey: () =>
      manifest['src/views/admin/QuestionEditor.vue']
        ? 'src/views/admin/QuestionEditor.vue'
        : Object.keys(manifest).find((key) => key.startsWith('_QuestionEditor-')),
    eagerDynamic: [{ name: 'QuestionMarkdownEditor' }],
  },
]

function collectStaticGraph(entryKey, additionalEntries = []) {
  const keys = new Set()
  const visit = (key) => {
    if (!key || keys.has(key) || !manifest[key]) return
    keys.add(key)
    for (const imported of manifest[key].imports || []) visit(imported)
  }
  visit(entryKey)
  additionalEntries.forEach(visit)
  return keys
}

const initialGraph = collectStaticGraph('index.html')

function resolveEagerDynamicEntries(entryKey, selectors = []) {
  const dynamicKeys = manifest[entryKey]?.dynamicImports || []
  return selectors.map((selector) => {
    const key = dynamicKeys.find((candidate) => {
      const chunk = manifest[candidate]
      if (!chunk) return false
      if (selector.source && (candidate === selector.source || chunk.src === selector.source))
        return true
      return selector.name && chunk.name === selector.name
    })
    if (!key) {
      const label = selector.source || selector.name
      throw new Error(`${entryKey} 未找到首帧动态入口 ${label}`)
    }
    return key
  })
}

function routeSize(entryKey, eagerDynamic = []) {
  const eagerEntries = resolveEagerDynamicEntries(entryKey, eagerDynamic)
  const graph = collectStaticGraph(entryKey, eagerEntries)
  const files = new Set()
  for (const key of graph) {
    // 路由切换前入口公共依赖已加载，不重复计入路由增量成本。
    if (initialGraph.has(key) && key !== entryKey) continue
    const chunk = manifest[key]
    if (chunk.file) files.add(chunk.file)
    for (const css of chunk.css || []) files.add(css)
  }

  let raw = 0
  let gzip = 0
  for (const file of files) {
    const content = readFileSync(resolve(DIST, file))
    raw += content.length
    gzip += gzipSync(content).length
  }
  return { raw, gzip, files: files.size }
}

const errors = []
console.log('路由首次进入体积：')
for (const route of routeBudgets) {
  const key = route.resolveKey()
  if (!key || !manifest[key]) {
    errors.push(`${route.name} 未在构建清单中找到入口`)
    continue
  }
  let size
  try {
    size = routeSize(key, route.eagerDynamic)
  } catch (error) {
    errors.push(`${route.name} ${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  console.log(
    `- ${route.name}: ${(size.gzip / 1024).toFixed(1)} KB gzip / ${(size.raw / 1024).toFixed(1)} KB raw (${size.files} files)`,
  )
  if (size.gzip > route.budget) {
    errors.push(
      `${route.name} gzip ${(size.gzip / 1024).toFixed(1)} KB > ${(route.budget / 1024).toFixed(0)} KB`,
    )
  }
}

if (errors.length) {
  errors.forEach((error) => console.error(`路由预算失败：${error}`))
  process.exit(1)
}
console.log('路由体积预算通过')
