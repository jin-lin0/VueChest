import type { DocSection, DocItem } from '../types'

import cssEffects from './css-effects.md?raw'
import layout from './layout.md?raw'
import jsModern from './js-modern.md?raw'
import perfFrontend from './perf-frontend.md?raw'
import langgraph from './langgraph.md?raw'
import agentPatterns from './agent-patterns.md?raw'
import rag from './rag.md?raw'
import promptEng from './prompt-eng.md?raw'
import frontendMd from './frontend.md?raw'
import agentMd from './agent.md?raw'
import algorithmMd from './algorithm.md?raw'
import scenarioMd from './scenario.md?raw'
import niukeMd from './niuke.md?raw'

/**
 * 知识库文档注册表：按分类组织（前端开发 / AI·Agent / 面试题库）。
 * 新增知识文档时，在此追加一项并在上方 import 对应 .md?raw 即可，
 * 侧边栏与路由会自动同步（Docs.vue 通过 activeTab 切换展示）。
 *
 * 注意：文档 id 不再带 `kb-` 前缀——Tab 由「该 id 属于哪个注册表」推导，
 * 而非靠 id 命名约定。
 */
export const knowledgeSections: DocSection[] = [
  {
    id: 'kb-frontend',
    title: '前端开发',
    items: [
      { id: 'css-effects', title: 'CSS 特效与动画实战', content: cssEffects },
      { id: 'layout', title: '现代 CSS 布局：Flexbox 与 Grid', content: layout },
      { id: 'js-modern', title: 'JavaScript 现代特性与技巧', content: jsModern },
      { id: 'perf-frontend', title: '前端性能优化指南', content: perfFrontend },
    ],
  },
  {
    id: 'kb-ai',
    title: 'AI / Agent',
    items: [
      { id: 'langgraph', title: 'LangGraph 入门与核心概念', content: langgraph },
      { id: 'agent-patterns', title: 'Agent 设计模式与架构', content: agentPatterns },
      { id: 'rag', title: 'RAG 检索增强生成实战', content: rag },
      { id: 'prompt-eng', title: '提示词工程实践', content: promptEng },
    ],
  },
  {
    id: 'kb-interview',
    title: '面试题库',
    items: [
      {
        id: 'interview-bag',
        title: '八股',
        children: [
          { id: 'frontend', title: '前端面试', content: frontendMd },
          { id: 'agent', title: 'AI Agent 面试', content: agentMd },
        ],
      },
      {
        id: 'interview-practice',
        title: '刷题',
        children: [
          { id: 'algorithm', title: '算法章节', content: algorithmMd },
          { id: 'scenario', title: '场景题章节', content: scenarioMd },
          { id: 'niuke', title: '牛客面试题库', content: niukeMd },
        ],
      },
    ],
  },
]

export const allKnowledgeDocs: DocItem[] = knowledgeSections.flatMap((s) => s.items)
