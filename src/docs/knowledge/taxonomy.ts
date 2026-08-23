export interface KnowledgeCategoryConfig {
  id: string
  title: string
  groups: string[]
}

/**
 * 知识库唯一的信息架构定义。
 *
 * - category 顺序决定左侧顶层目录顺序；
 * - groups 顺序决定分类内的二级目录顺序；
 * - 文档 frontmatter 的 order 只负责同组内排序。
 */
export const KNOWLEDGE_TAXONOMY: KnowledgeCategoryConfig[] = [
  {
    id: 'frontend',
    title: '前端开发',
    groups: [
      '开始这里',
      'CSS 与样式',
      'JavaScript 基础',
      'TypeScript',
      'Vue 生态',
      '浏览器原理与网络',
      '工程化与构建',
      '性能与监控',
      '架构与设计',
      '可视化与图形',
      '综合与扩展',
    ],
  },
  {
    id: 'ai',
    title: 'AI / Agent',
    groups: ['开始这里', 'Agent 基础', 'RAG 与检索', '工具与协议', '提示词与安全'],
  },
  {
    id: 'backend',
    title: '后端与基础设施',
    groups: [
      '开始这里',
      'Node 与 API',
      '数据与缓存',
      '消息与搜索',
      '部署与云原生',
      '可靠性与可观测',
    ],
  },
  {
    id: 'interview',
    title: '面试准备',
    groups: ['开始这里', '高频标准问答', '项目与模拟', '牛客全量答案', '专题速查', '题源与刷题'],
  },
]
