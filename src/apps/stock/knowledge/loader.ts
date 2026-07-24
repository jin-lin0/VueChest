// 知识库运行时加载器
// 知识库的聚合产物（atoms / index / graph）发布在 R2 公开桶，前端运行时直连 R2 拉取，
// 不再随前端仓库提交/打包，也不经后端代理。R2 桶已配置 CORS 放行前端域名
// （app.020201.xyz / localhost:5173 / localhost:3000）。更新知识库无需重新构建前端。
import type { IndexData, GraphNode, GraphEdge, KnowledgeAtom, KnowledgeBundle } from './types'

// R2 公开基地址：可用 .env 的 VITE_KB_R2_BASE 覆盖（默认项目既有 CDN）。
const R2_BASE = (import.meta.env.VITE_KB_R2_BASE as string | undefined) || 'https://files.020201.xyz'
const PREFIX = 'stock/knowledge/generated'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`知识库加载失败 ${url}（HTTP ${res.status}）`)
  return (await res.json()) as T
}

/**
 * 拉取知识库三大核心产物：
 * - index.json：总量/分类/标签统计（含 generatedAt，用作缓存版本号）
 * - atoms.json：全部知识原子
 * - graph.json：知识图谱节点与边
 * 用 index.generatedAt 作为查询串，内容更新后自动绕过浏览器/CDN 缓存。
 */
export async function loadKnowledge(): Promise<KnowledgeBundle> {
  const indexUrl = `${R2_BASE}/${PREFIX}/index.json`
  const indexData = await getJson<IndexData>(indexUrl)
  const v = encodeURIComponent(indexData.generatedAt || String(Date.now()))
  const [atoms, graphData] = await Promise.all([
    getJson<KnowledgeAtom[]>(`${R2_BASE}/${PREFIX}/atoms.json?v=${v}`),
    getJson<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`${R2_BASE}/${PREFIX}/graph.json?v=${v}`),
  ])
  return { atoms, indexData, graphData }
}

export const KB_R2_BASE = R2_BASE
