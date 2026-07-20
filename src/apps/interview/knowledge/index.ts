import frontendMd from './frontend.md?raw'
import agentMd from './agent.md?raw'
import algorithmMd from './algorithm.md?raw'
import scenarioMd from './scenario.md?raw'

export interface KnowledgeDoc {
  id: string
  name: string
  icon: string
  description: string
  content: string
}

/**
 * 知识文档注册表
 * 新增一篇知识文档 = 写 .md 文件 + 在此数组加一项，侧边栏/内容自动同步。
 */
export const knowledgeDocs: KnowledgeDoc[] = [
  {
    id: 'frontend',
    name: '前端面试',
    icon: '💻',
    description: '2025-2026 前端高频知识点',
    content: frontendMd,
  },
  {
    id: 'agent',
    name: 'AI Agent 面试',
    icon: '🤖',
    description: '大模型 / Agent 应用开发',
    content: agentMd,
  },
  {
    id: 'algorithm',
    name: '算法章节',
    icon: '🧮',
    description: '手撕代码高频算法与数据结构',
    content: algorithmMd,
  },
  {
    id: 'scenario',
    name: '场景题章节',
    icon: '🛠️',
    description: '前端手写场景题 / 代码实现题',
    content: scenarioMd,
  },
]
