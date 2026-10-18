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
    // 正文按篇加载；路由预算包含首次进入所需的 Markdown 渲染依赖。
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
    // 参考答案展开后才加载 Markdown，延后加载体积单独统计。
    budget: 26 * 1024,
    resolveKey: () => 'src/apps/interview/App.vue',
    deferredDynamic: [{ name: 'MarkdownView' }],
    deferredBudget: 60 * 1024,
  },
  {
    name: 'AI 聊天',
    // 会话首帧需要 Markdown，静态渲染依赖计入路由预算。
    budget: 80 * 1024,
    resolveKey: () => 'src/apps/ai-chat/App.vue',
  },
  {
    name: 'B站字幕分析',
    // 分析完成后才展示 Markdown，延后加载体积单独统计。
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

/** 单独统计延后加载的依赖，区分首屏成本与总下载量。 */
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
