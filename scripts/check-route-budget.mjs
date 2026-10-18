import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = resolve(ROOT, 'dist')
const manifest = JSON.parse(readFileSync(resolve(DIST, '.vite/manifest.json'), 'utf8'))
const stockEntry = () =>
  Object.keys(manifest).find((key) =>
    manifest[key].dynamicImports?.includes('src/apps/stock/components/PortfolioPanel.vue'),
  )
const stockResearchEntries = [
  { source: 'src/apps/stock/components/OverviewPanel.vue' },
  { source: 'src/apps/stock/components/StockChart.vue' },
]

const routeBudgets = [
  {
    name: '应用中心',
    // 保留 vuedraggable；runtime-only 别名避免引入 Vue 模板编译器。
    budget: 65 * 1024,
    resolveKey: () => 'src/views/WorkspaceHome.vue',
  },
  {
    name: '文档中心',
    // 帮助中心原本用 13 条 `import x from './x.md?raw'` 把全部正文内联进路由 chunk，
    // 打包后 `tree-*.js` 一个 chunk 就是 29.9KB gzip / 53.5KB raw；用户进帮助中心只想看一篇，
    // 却要先下完全部正文。改成 `import.meta.glob` 动态导入后 tree chunk 降到 1.25KB，
    // 13 篇正文各自成为 0.6~4KB 的按需 chunk，路由 93.3KB → 64.6KB gzip（raw 271.3 → 191.2）。
    // 剩下的大头是 markdown 渲染栈本身（36.4KB），与文档数量无关。
    // 预算收到 72KB：留约 11% 增长空间，同时守住「正文不许再被内联」——
    // src/docs/help/__tests__/index.spec.ts 从注册表侧守同一件事。
    budget: 72 * 1024,
    resolveKey: () => 'src/views/Docs.vue',
  },
  {
    name: '股票研究工作台（空入口）',
    budget: 30 * 1024,
    resolveKey: stockEntry,
  },
  {
    name: '股票研究工作台（打开个股）',
    budget: 100 * 1024,
    resolveKey: stockEntry,
    eagerDynamic: stockResearchEntries,
  },
  {
    name: '股票研究工作台（个股与自选）',
    budget: 100 * 1024,
    resolveKey: stockEntry,
    // 自选使用原生拖拽，不再加载独立拖拽库。
    eagerDynamic: stockResearchEntries,
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
    // 参考答案要点了「查看参考答案」才出现，首帧一个字都没有。原先 MarkdownView 是静态
    // 引入，把 marked + DOMPurify + highlight.js（含 plaintext 语言包）47.7KB gzip 挂在
    // 首屏关键路径上；改成 MarkdownViewLazy（defineAsyncComponent）后 69.5KB → 21.4KB。
    // 挪走的那块记在下面的 deferredDynamic 里，避免「首屏变小」把换顺序说成减总量。
    budget: 26 * 1024,
    resolveKey: () => 'src/apps/interview/App.vue',
    deferredDynamic: [{ name: 'MarkdownView' }],
    deferredBudget: 60 * 1024,
  },
  {
    name: 'AI 聊天',
    // 与上面相反：进入会话后马上要渲染历史消息里的 markdown，markdown 栈属于首帧真实成本，
    // 静态引入（挂在 vue-vendor 之外的 _markdown chunk 上）是刻意的，不要再改成懒加载。
    budget: 80 * 1024,
    resolveKey: () => 'src/apps/ai-chat/App.vue',
  },
  {
    name: 'B站字幕分析',
    // 同面试题库：分析结果只在用户点了「开始分析」之后才出现，47.7KB 的 markdown 栈
    // 不该由首帧买单。改成 MarkdownViewLazy 后 78.2KB → 30.1KB。
    budget: 36 * 1024,
    resolveKey: () => 'src/apps/bilibili-subtitle/App.vue',
    deferredDynamic: [{ name: 'MarkdownView' }],
    deferredBudget: 60 * 1024,
  },
  {
    name: '股票知识中心',
    // /stock/knowledge 是独立路由，详情正文同样要点了列表项才有；原先 markdown 栈在首屏。
    budget: 12 * 1024,
    resolveKey: () => 'src/apps/stock/knowledge/App.vue',
    deferredDynamic: [{ name: 'MarkdownView' }],
    deferredBudget: 60 * 1024,
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
  const dynamicKeys = new Set()
  const visited = new Set()
  const visit = (key) => {
    if (!manifest[key] || visited.has(key)) return
    visited.add(key)
    for (const child of manifest[key].dynamicImports || []) {
      dynamicKeys.add(child)
      visit(child)
    }
    for (const child of manifest[key].imports || []) visit(child)
  }
  visit(entryKey)
  return selectors.map((selector) => {
    const key = [...dynamicKeys].find((candidate) => {
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
  return sizeOfKeys(graph, entryKey)
}

/**
 * 挂载之后才取、因此不进首屏关键路径的 chunk。
 * 单独量一遍并打印，避免「首屏变小」把只是挪走的东西报成删掉的东西。
 */
function deferredSize(entryKey, selectors = []) {
  const keys = resolveEagerDynamicEntries(entryKey, selectors)
  const graph = new Set()
  for (const key of keys) for (const child of collectStaticGraph(key)) graph.add(child)
  return sizeOfKeys(graph)
}

function sizeOfKeys(graph, entryKey) {
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

  if (!route.deferredDynamic?.length) continue
  let deferred
  try {
    deferred = deferredSize(key, route.deferredDynamic)
  } catch (error) {
    errors.push(`${route.name} ${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  console.log(
    `  └ 其中 ${(deferred.gzip / 1024).toFixed(1)} KB gzip / ${(deferred.raw / 1024).toFixed(1)} KB raw (${deferred.files} files) 改为挂载后按需加载，不计入上面的首屏数字`,
  )
  if (route.deferredBudget && deferred.gzip > route.deferredBudget) {
    errors.push(
      `${route.name} 按需加载部分 gzip ${(deferred.gzip / 1024).toFixed(1)} KB > ${(route.deferredBudget / 1024).toFixed(0)} KB`,
    )
  }
}

if (errors.length) {
  errors.forEach((error) => console.error(`路由预算失败：${error}`))
  process.exit(1)
}
console.log('路由体积预算通过')
