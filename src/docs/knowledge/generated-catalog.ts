// 此文件由 scripts/knowledge/generate-doc-catalog.mjs 生成，请勿手改。
export interface KnowledgeCatalogEntry {
  id: string
  path: string
  category: string
  group: string
  order: number
  title: string
}

export const KNOWLEDGE_CATALOG: KnowledgeCatalogEntry[] = [
  {
    "id": "agent-frameworks",
    "path": "./ai/agent-frameworks.md",
    "category": "ai",
    "group": "Agent 基础",
    "order": 37,
    "title": "Agent 框架对比（LangGraph vs AutoGen vs CrewAI vs 自研）"
  },
  {
    "id": "agent-patterns",
    "path": "./ai/agent-patterns.md",
    "category": "ai",
    "group": "Agent 基础",
    "order": 35,
    "title": "Agent 设计模式与架构"
  },
  {
    "id": "agent-security",
    "path": "./ai/agent-security.md",
    "category": "ai",
    "group": "提示词与安全",
    "order": 45,
    "title": "Agent 安全与提示词注入"
  },
  {
    "id": "ai-overview",
    "path": "./ai/ai-overview.md",
    "category": "ai",
    "group": "开始这里",
    "order": 1,
    "title": "AI / Agent 知识地图"
  },
  {
    "id": "function-calling",
    "path": "./ai/function-calling.md",
    "category": "ai",
    "group": "工具与协议",
    "order": 42,
    "title": "Function Calling 与 Tool Use 实战"
  },
  {
    "id": "langgraph",
    "path": "./ai/langgraph.md",
    "category": "ai",
    "group": "Agent 基础",
    "order": 36,
    "title": "LangGraph 入门与核心概念"
  },
  {
    "id": "mcp",
    "path": "./ai/mcp.md",
    "category": "ai",
    "group": "工具与协议",
    "order": 43,
    "title": "MCP 入门（Model Context Protocol）"
  },
  {
    "id": "multimodal-rag",
    "path": "./ai/multimodal-rag.md",
    "category": "ai",
    "group": "RAG 与检索",
    "order": 41,
    "title": "多模态 RAG 实战"
  },
  {
    "id": "prompt-eng",
    "path": "./ai/prompt-eng.md",
    "category": "ai",
    "group": "提示词与安全",
    "order": 44,
    "title": "提示词工程实践 (Prompt Engineering in Practice)"
  },
  {
    "id": "rag-evaluation",
    "path": "./ai/rag-evaluation.md",
    "category": "ai",
    "group": "RAG 与检索",
    "order": 39,
    "title": "AI 评估与 RAGAS"
  },
  {
    "id": "rag",
    "path": "./ai/rag.md",
    "category": "ai",
    "group": "RAG 与检索",
    "order": 38,
    "title": "RAG 检索增强生成实战"
  },
  {
    "id": "vector-db",
    "path": "./ai/vector-db.md",
    "category": "ai",
    "group": "RAG 与检索",
    "order": 40,
    "title": "向量数据库选型与基准"
  },
  {
    "id": "api-gateway",
    "path": "./backend/api-gateway.md",
    "category": "backend",
    "group": "Node 与 API",
    "order": 2,
    "title": "API 网关与 Nginx"
  },
  {
    "id": "backend-overview",
    "path": "./backend/backend-overview.md",
    "category": "backend",
    "group": "开始这里",
    "order": 1,
    "title": "后端与基础设施知识地图"
  },
  {
    "id": "cdn",
    "path": "./backend/cdn.md",
    "category": "backend",
    "group": "部署与云原生",
    "order": 4,
    "title": "CDN 原理与静态加速"
  },
  {
    "id": "docker-deploy",
    "path": "./backend/docker-deploy.md",
    "category": "backend",
    "group": "部署与云原生",
    "order": 1,
    "title": "Docker 容器化部署"
  },
  {
    "id": "elasticsearch",
    "path": "./backend/elasticsearch.md",
    "category": "backend",
    "group": "消息与搜索",
    "order": 2,
    "title": "Elasticsearch 与搜索实战"
  },
  {
    "id": "kubernetes",
    "path": "./backend/kubernetes.md",
    "category": "backend",
    "group": "部署与云原生",
    "order": 2,
    "title": "Kubernetes 入门"
  },
  {
    "id": "message-queue",
    "path": "./backend/message-queue.md",
    "category": "backend",
    "group": "消息与搜索",
    "order": 1,
    "title": "消息队列实战"
  },
  {
    "id": "mysql-optimization",
    "path": "./backend/mysql-optimization.md",
    "category": "backend",
    "group": "数据与缓存",
    "order": 1,
    "title": "数据库与 MySQL 优化"
  },
  {
    "id": "node-backend",
    "path": "./backend/node-backend.md",
    "category": "backend",
    "group": "Node 与 API",
    "order": 1,
    "title": "Node / Express 后端手册"
  },
  {
    "id": "nosql-mongodb",
    "path": "./backend/nosql-mongodb.md",
    "category": "backend",
    "group": "数据与缓存",
    "order": 3,
    "title": "NoSQL 与 MongoDB 实战"
  },
  {
    "id": "observability",
    "path": "./backend/observability.md",
    "category": "backend",
    "group": "可靠性与可观测",
    "order": 2,
    "title": "可观测性与链路追踪"
  },
  {
    "id": "redis-cache",
    "path": "./backend/redis-cache.md",
    "category": "backend",
    "group": "数据与缓存",
    "order": 2,
    "title": "Redis 缓存实战"
  },
  {
    "id": "release-strategy",
    "path": "./backend/release-strategy.md",
    "category": "backend",
    "group": "可靠性与可观测",
    "order": 1,
    "title": "灰度发布与 A/B 测试"
  },
  {
    "id": "serverless",
    "path": "./backend/serverless.md",
    "category": "backend",
    "group": "部署与云原生",
    "order": 3,
    "title": "Serverless 与边缘计算"
  },
  {
    "id": "accessibility",
    "path": "./frontend/accessibility.md",
    "category": "frontend",
    "group": "综合与扩展",
    "order": 33,
    "title": "无障碍（Accessibility / a11y）基础"
  },
  {
    "id": "ai-app-frontend",
    "path": "./frontend/ai-app-frontend.md",
    "category": "frontend",
    "group": "综合与扩展",
    "order": 34,
    "title": "AI 应用前端实战（流式渲染 / SSE / 打字机）"
  },
  {
    "id": "browser-cache",
    "path": "./frontend/browser-cache.md",
    "category": "frontend",
    "group": "浏览器原理与网络",
    "order": 18,
    "title": "浏览器缓存机制"
  },
  {
    "id": "browser-rendering",
    "path": "./frontend/browser-rendering.md",
    "category": "frontend",
    "group": "浏览器原理与网络",
    "order": 15,
    "title": "浏览器渲染原理"
  },
  {
    "id": "browser-storage",
    "path": "./frontend/browser-storage.md",
    "category": "frontend",
    "group": "浏览器原理与网络",
    "order": 17,
    "title": "浏览器存储"
  },
  {
    "id": "build-tools",
    "path": "./frontend/build-tools.md",
    "category": "frontend",
    "group": "工程化与构建",
    "order": 12,
    "title": "现代构建工具对比"
  },
  {
    "id": "canvas-webgl",
    "path": "./frontend/canvas-webgl.md",
    "category": "frontend",
    "group": "可视化与图形",
    "order": 23,
    "title": "可视化与 Canvas / WebGL 入门"
  },
  {
    "id": "chart-viz",
    "path": "./frontend/chart-viz.md",
    "category": "frontend",
    "group": "可视化与图形",
    "order": 24,
    "title": "前端图表与可视化"
  },
  {
    "id": "component-library",
    "path": "./frontend/component-library.md",
    "category": "frontend",
    "group": "Vue 生态",
    "order": 10,
    "title": "Vue 组件库开发"
  },
  {
    "id": "cross-platform",
    "path": "./frontend/cross-platform.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 29,
    "title": "跨端开发选型"
  },
  {
    "id": "css-effects",
    "path": "./frontend/css-effects.md",
    "category": "frontend",
    "group": "CSS 与样式",
    "order": 9999,
    "title": "CSS 特效与动画实战"
  },
  {
    "id": "design-patterns",
    "path": "./frontend/design-patterns.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 25,
    "title": "设计模式在前端的应用"
  },
  {
    "id": "design-token",
    "path": "./frontend/design-token.md",
    "category": "frontend",
    "group": "CSS 与样式",
    "order": 2,
    "title": "Design Token 与 CSS 架构"
  },
  {
    "id": "event-loop",
    "path": "./frontend/event-loop.md",
    "category": "frontend",
    "group": "JavaScript 基础",
    "order": 4,
    "title": "事件循环与宏微任务"
  },
  {
    "id": "frontend-engineering",
    "path": "./frontend/frontend-engineering.md",
    "category": "frontend",
    "group": "工程化与构建",
    "order": 13,
    "title": "前端工程化全链路"
  },
  {
    "id": "frontend-monitoring",
    "path": "./frontend/frontend-monitoring.md",
    "category": "frontend",
    "group": "性能与监控",
    "order": 22,
    "title": "前端监控与埋点"
  },
  {
    "id": "frontend-overview",
    "path": "./frontend/frontend-overview.md",
    "category": "frontend",
    "group": "开始这里",
    "order": 1,
    "title": "前端知识地图"
  },
  {
    "id": "frontend-router",
    "path": "./frontend/frontend-router.md",
    "category": "frontend",
    "group": "浏览器原理与网络",
    "order": 19,
    "title": "前端路由原理"
  },
  {
    "id": "frontend-testing",
    "path": "./frontend/frontend-testing.md",
    "category": "frontend",
    "group": "工程化与构建",
    "order": 14,
    "title": "前端单元测试实战（Vitest + Testing Library）"
  },
  {
    "id": "graphql",
    "path": "./frontend/graphql.md",
    "category": "frontend",
    "group": "综合与扩展",
    "order": 31,
    "title": "GraphQL 入门"
  },
  {
    "id": "http-network",
    "path": "./frontend/http-network.md",
    "category": "frontend",
    "group": "浏览器原理与网络",
    "order": 16,
    "title": "HTTP 与浏览器网络"
  },
  {
    "id": "i18n",
    "path": "./frontend/i18n.md",
    "category": "frontend",
    "group": "综合与扩展",
    "order": 32,
    "title": "前端国际化（i18n）"
  },
  {
    "id": "js-modern",
    "path": "./frontend/js-modern.md",
    "category": "frontend",
    "group": "JavaScript 基础",
    "order": 3,
    "title": "JavaScript 现代特性与实战技巧"
  },
  {
    "id": "layout",
    "path": "./frontend/layout.md",
    "category": "frontend",
    "group": "CSS 与样式",
    "order": 1,
    "title": "现代 CSS 布局：Flexbox 与 Grid 实战"
  },
  {
    "id": "low-code",
    "path": "./frontend/low-code.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 31,
    "title": "低代码与可视化搭建"
  },
  {
    "id": "micro-frontend",
    "path": "./frontend/micro-frontend.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 27,
    "title": "微前端与模块联邦"
  },
  {
    "id": "perf-frontend",
    "path": "./frontend/perf-frontend.md",
    "category": "frontend",
    "group": "性能与监控",
    "order": 21,
    "title": "前端性能优化指南"
  },
  {
    "id": "pinia",
    "path": "./frontend/pinia.md",
    "category": "frontend",
    "group": "Vue 生态",
    "order": 8,
    "title": "Pinia 状态管理深入"
  },
  {
    "id": "ssr-nuxt",
    "path": "./frontend/ssr-nuxt.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 28,
    "title": "SSR / SSG / Nuxt 入门"
  },
  {
    "id": "state-management",
    "path": "./frontend/state-management.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 26,
    "title": "前端状态管理对比"
  },
  {
    "id": "ts-advanced",
    "path": "./frontend/ts-advanced.md",
    "category": "frontend",
    "group": "TypeScript",
    "order": 5,
    "title": "TypeScript 进阶类型与工程实践"
  },
  {
    "id": "vite",
    "path": "./frontend/vite.md",
    "category": "frontend",
    "group": "工程化与构建",
    "order": 11,
    "title": "Vite 构建与优化"
  },
  {
    "id": "vue-reactivity",
    "path": "./frontend/vue-reactivity.md",
    "category": "frontend",
    "group": "Vue 生态",
    "order": 7,
    "title": "Vue 3 响应式原理"
  },
  {
    "id": "vue-router",
    "path": "./frontend/vue-router.md",
    "category": "frontend",
    "group": "Vue 生态",
    "order": 9,
    "title": "Vue Router 实战"
  },
  {
    "id": "vue3-composition",
    "path": "./frontend/vue3-composition.md",
    "category": "frontend",
    "group": "Vue 生态",
    "order": 6,
    "title": "Vue 3 组合式 API 实战"
  },
  {
    "id": "web-security",
    "path": "./frontend/web-security.md",
    "category": "frontend",
    "group": "浏览器原理与网络",
    "order": 20,
    "title": "Web 安全"
  },
  {
    "id": "webassembly",
    "path": "./frontend/webassembly.md",
    "category": "frontend",
    "group": "架构与设计",
    "order": 30,
    "title": "WebAssembly 入门"
  },
  {
    "id": "agent-core-qa",
    "path": "./interview/agent-core-qa.md",
    "category": "interview",
    "group": "高频标准问答",
    "order": 2,
    "title": "Agent 核心标准问答"
  },
  {
    "id": "agent-engineering-qa",
    "path": "./interview/agent-engineering-qa.md",
    "category": "interview",
    "group": "项目与模拟",
    "order": 2,
    "title": "Agent 工程与场景标准问答"
  },
  {
    "id": "agent",
    "path": "./interview/agent.md",
    "category": "interview",
    "group": "专题速查",
    "order": 2,
    "title": "AI Agent 面试知识文档"
  },
  {
    "id": "algorithm",
    "path": "./interview/algorithm.md",
    "category": "interview",
    "group": "题源与刷题",
    "order": 3,
    "title": "算法面试章节"
  },
  {
    "id": "frontend-core-qa",
    "path": "./interview/frontend-core-qa.md",
    "category": "interview",
    "group": "高频标准问答",
    "order": 1,
    "title": "前端核心标准问答"
  },
  {
    "id": "frontend",
    "path": "./interview/frontend.md",
    "category": "interview",
    "group": "专题速查",
    "order": 1,
    "title": "前端面试知识文档"
  },
  {
    "id": "interview-roadmap",
    "path": "./interview/interview-roadmap.md",
    "category": "interview",
    "group": "开始这里",
    "order": 1,
    "title": "前端 & Agent 面试作战手册"
  },
  {
    "id": "mock-interviews",
    "path": "./interview/mock-interviews.md",
    "category": "interview",
    "group": "项目与模拟",
    "order": 3,
    "title": "前端 & Agent 模拟面试"
  },
  {
    "id": "niuke-agent-engineering-full-qa",
    "path": "./interview/niuke-agent-engineering-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 59,
    "title": "牛客全量标准答案 · 九、Agent 应用开发（不限技术栈：后端 / TS / 全栈）"
  },
  {
    "id": "niuke-agent-full-qa",
    "path": "./interview/niuke-agent-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 56,
    "title": "牛客全量标准答案 · 六、AI / Agent（前端 Agent / AI 研发）"
  },
  {
    "id": "niuke-algorithms-js",
    "path": "./interview/niuke-algorithms-js.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 10,
    "title": "牛客算法题 JavaScript 代码附录"
  },
  {
    "id": "niuke-browser-network-full-qa",
    "path": "./interview/niuke-browser-network-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 54,
    "title": "牛客全量标准答案 · 四、网络 / 浏览器"
  },
  {
    "id": "niuke-coding-scenario-full-qa",
    "path": "./interview/niuke-coding-scenario-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 57,
    "title": "牛客全量标准答案 · 七、场景 / 手写编程题"
  },
  {
    "id": "niuke-css-full-qa",
    "path": "./interview/niuke-css-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 53,
    "title": "牛客全量标准答案 · 三、CSS / 渲染与布局"
  },
  {
    "id": "niuke-engineering-full-qa",
    "path": "./interview/niuke-engineering-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 55,
    "title": "牛客全量标准答案 · 五、工程化 / 性能 / 部署"
  },
  {
    "id": "niuke-framework-full-qa",
    "path": "./interview/niuke-framework-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 52,
    "title": "牛客全量标准答案 · 二、框架原理（React / Vue）"
  },
  {
    "id": "niuke-hr-full-qa",
    "path": "./interview/niuke-hr-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 58,
    "title": "牛客全量标准答案 · 八、HR / 软技能 / 开放题"
  },
  {
    "id": "niuke-js-ts-full-qa",
    "path": "./interview/niuke-js-ts-full-qa.md",
    "category": "interview",
    "group": "牛客全量答案",
    "order": 51,
    "title": "牛客全量标准答案 · 一、JavaScript / TypeScript 基础"
  },
  {
    "id": "niuke",
    "path": "./interview/niuke.md",
    "category": "interview",
    "group": "题源与刷题",
    "order": 1,
    "title": "牛客面试题库"
  },
  {
    "id": "scenario",
    "path": "./interview/scenario.md",
    "category": "interview",
    "group": "题源与刷题",
    "order": 2,
    "title": "前端场景题章节"
  },
  {
    "id": "vuechest-project-qa",
    "path": "./interview/vuechest-project-qa.md",
    "category": "interview",
    "group": "项目与模拟",
    "order": 1,
    "title": "VueChest 项目深挖标准问答"
  }
]
