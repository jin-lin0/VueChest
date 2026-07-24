// 中国 A 股短线交易知识库 —— 知识原子 schema
// 所有知识原子（Knowledge Atom）统一遵循此结构，供 UI、聚合脚本、知识图谱共用。

export type Category =
  | '基础知识'
  | '交易制度'
  | '市场规律'
  | '交易体系'
  | '情绪周期'
  | '盘口'
  | '竞价'
  | '龙头战法'
  | '资金流'
  | '游资'
  | '机构'
  | '板块'
  | '案例'
  | '统计'
  | '风险'
  | '心理'
  | '术语'
  | 'FAQ'
  | '经验'
  | '观点'
  | '待验证'

export type AtomStatus = 'verified' | 'disputed' | 'unverified' | 'experience'

export type CaseType = 'success' | 'failure'

export interface Citation {
  /** 来源类型：官方规则 / 交易所 / 证监会 / 上市公司公告 / 论文 / 经典书籍 / 公开访谈 / 公开复盘 / 可靠媒体 / 知名交易员公开观点 */
  source: string
  /** 具体出处描述，例如《炒股养家语录》、上交所交易规则第 N 条 */
  detail?: string
  /** 可选链接 */
  url?: string
}

export interface KnowledgeAtom {
  /** 全局唯一 ID，建议命名空间前缀，如 sys-t1 / emo-ice / lead-dragon */
  id: string
  title: string
  /** 一句话摘要 */
  summary: string
  category: Category
  tags: string[]
  keywords: string[]
  /** 可信度 0-100：95 官方规则 / 90 大量统计 / 80 经典体系 / 70 业内普遍认可 / 60 部分案例 / 50 存在争议 / 40 经验 / 30 未验证 */
  confidence: number
  /** Markdown 正文，建议包含：是什么 / 为什么 / 成立条件 / 失效条件 / 案例 / 反例 / 争议与流派 / 可信度依据 / 未来研究 */
  body: string
  citations: Citation[]
  /** 关联知识原子 ID（跨域引用在聚合时按共享标签补齐） */
  related: string[]
  futureResearch: string[]
  /** ISO 日期 */
  updatedAt: string
  status: AtomStatus
  /** 仅案例类原子使用 */
  caseType?: CaseType
  /** 提出/整理该原子的 Agent 类型，便于审计 */
  author?: string
}

export const CATEGORIES: Category[] = [
  '基础知识',
  '交易制度',
  '市场规律',
  '交易体系',
  '情绪周期',
  '盘口',
  '竞价',
  '龙头战法',
  '资金流',
  '游资',
  '机构',
  '板块',
  '案例',
  '统计',
  '风险',
  '心理',
  '术语',
  'FAQ',
  '经验',
  '观点',
  '待验证',
]

/** 置信度分级说明，供 UI 展示 */
export const CONFIDENCE_LEVELS: { min: number; label: string; note: string }[] = [
  { min: 90, label: '官方/强统计', note: '官方规则或大量历史统计验证' },
  { min: 75, label: '经典体系', note: '经典交易体系 / 业内普遍认可' },
  { min: 55, label: '部分支撑', note: '部分案例或统计支撑，存在争议' },
  { min: 35, label: '经验观点', note: '经验总结，未严格验证' },
  { min: 0, label: '待验证', note: '假设或待验证观点' },
]

// ---------- 聚合产物（运行时从 R2 拉取）的视图模型 ----------
export interface IndexData {
  total: number
  generatedAt: string
  byCategory: { category: string; count: number }[]
  byTag: { tag: string; count: number }[]
  avgConfidence: number
}
export interface TagItem {
  tag: string
  count: number
  atomIds: string[]
}
export interface GraphNode {
  id: string
  title: string
  category: string
  tags: string[]
  confidence: number
}
export interface GraphEdge {
  source: string
  target: string
  kind: string
  weight: number
}
export interface KnowledgeBundle {
  atoms: KnowledgeAtom[]
  indexData: IndexData
  graphData: { nodes: GraphNode[]; edges: GraphEdge[] }
}
