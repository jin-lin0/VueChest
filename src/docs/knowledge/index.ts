import type { DocSection, DocItem } from '../types'

import cssEffects from './css-effects.md?raw'
import layout from './layout.md?raw'
import jsModern from './js-modern.md?raw'
import perfFrontend from './perf-frontend.md?raw'
import vue3Composition from './vue3-composition.md?raw'
import tsAdvanced from './ts-advanced.md?raw'
import pinia from './pinia.md?raw'
import vueRouter from './vue-router.md?raw'
import vite from './vite.md?raw'
import componentLibrary from './component-library.md?raw'
import browserRendering from './browser-rendering.md?raw'
import eventLoop from './event-loop.md?raw'
import webSecurity from './web-security.md?raw'
import designPatterns from './design-patterns.md?raw'
import buildTools from './build-tools.md?raw'
import frontendEngineering from './frontend-engineering.md?raw'
import canvasWebgl from './canvas-webgl.md?raw'
import httpNetwork from './http-network.md?raw'
import browserStorage from './browser-storage.md?raw'
import frontendMonitoring from './frontend-monitoring.md?raw'
import vueReactivity from './vue-reactivity.md?raw'
import frontendTesting from './frontend-testing.md?raw'
import aiAppFrontend from './ai-app-frontend.md?raw'
import microFrontend from './micro-frontend.md?raw'
import ssrNuxt from './ssr-nuxt.md?raw'
import accessibility from './accessibility.md?raw'
import designToken from './design-token.md?raw'
import browserCache from './browser-cache.md?raw'
import frontendRouter from './frontend-router.md?raw'
import webassembly from './webassembly.md?raw'
import crossPlatform from './cross-platform.md?raw'
import graphql from './graphql.md?raw'
import chartViz from './chart-viz.md?raw'
import stateManagement from './state-management.md?raw'
import i18n from './i18n.md?raw'
import langgraph from './langgraph.md?raw'
import agentPatterns from './agent-patterns.md?raw'
import rag from './rag.md?raw'
import promptEng from './prompt-eng.md?raw'
import mcp from './mcp.md?raw'
import ragEvaluation from './rag-evaluation.md?raw'
import functionCalling from './function-calling.md?raw'
import agentSecurity from './agent-security.md?raw'
import vectorDb from './vector-db.md?raw'
import agentFrameworks from './agent-frameworks.md?raw'
import multimodalRag from './multimodal-rag.md?raw'
import redisCache from './redis-cache.md?raw'
import dockerDeploy from './docker-deploy.md?raw'
import messageQueue from './message-queue.md?raw'
import kubernetes from './kubernetes.md?raw'
import elasticsearch from './elasticsearch.md?raw'
import serverless from './serverless.md?raw'
import apiGateway from './api-gateway.md?raw'
import releaseStrategy from './release-strategy.md?raw'
import observability from './observability.md?raw'
import nosqlMongodb from './nosql-mongodb.md?raw'
import lowCode from './low-code.md?raw'
import cdn from './cdn.md?raw'
import nodeBackend from './node-backend.md?raw'
import mysqlOptimization from './mysql-optimization.md?raw'
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
      { id: 'vue3-composition', title: 'Vue 3 组合式 API 实战', content: vue3Composition },
      { id: 'ts-advanced', title: 'TypeScript 进阶类型与工程实践', content: tsAdvanced },
      { id: 'pinia', title: 'Pinia 状态管理深入', content: pinia },
      { id: 'vue-router', title: 'Vue Router 实战', content: vueRouter },
      { id: 'vite', title: 'Vite 构建与优化', content: vite },
      { id: 'component-library', title: 'Vue 组件库开发', content: componentLibrary },
      { id: 'browser-rendering', title: '浏览器渲染原理', content: browserRendering },
      { id: 'event-loop', title: '事件循环与宏微任务', content: eventLoop },
      { id: 'web-security', title: 'Web 安全', content: webSecurity },
      { id: 'design-patterns', title: '设计模式在前端的应用', content: designPatterns },
      { id: 'build-tools', title: '现代构建工具对比', content: buildTools },
      { id: 'frontend-engineering', title: '前端工程化全链路', content: frontendEngineering },
      { id: 'canvas-webgl', title: '可视化与 Canvas / WebGL 入门', content: canvasWebgl },
      { id: 'http-network', title: 'HTTP 与浏览器网络', content: httpNetwork },
      { id: 'browser-storage', title: '浏览器存储', content: browserStorage },
      { id: 'frontend-monitoring', title: '前端监控与埋点', content: frontendMonitoring },
      { id: 'vue-reactivity', title: 'Vue 3 响应式原理', content: vueReactivity },
      { id: 'frontend-testing', title: '前端单元测试实战', content: frontendTesting },
      { id: 'ai-app-frontend', title: 'AI 应用前端实战', content: aiAppFrontend },
      { id: 'micro-frontend', title: '微前端与模块联邦', content: microFrontend },
      { id: 'ssr-nuxt', title: 'SSR / SSG / Nuxt 入门', content: ssrNuxt },
      { id: 'accessibility', title: '无障碍（a11y）基础', content: accessibility },
      { id: 'design-token', title: 'Design Token 与 CSS 架构', content: designToken },
      { id: 'browser-cache', title: '浏览器缓存机制', content: browserCache },
      { id: 'frontend-router', title: '前端路由原理', content: frontendRouter },
      { id: 'webassembly', title: 'WebAssembly 入门', content: webassembly },
      { id: 'cross-platform', title: '跨端开发选型', content: crossPlatform },
      { id: 'graphql', title: 'GraphQL 入门', content: graphql },
      { id: 'chart-viz', title: '前端图表与可视化', content: chartViz },
      { id: 'state-management', title: '前端状态管理对比', content: stateManagement },
      { id: 'i18n', title: '前端国际化（i18n）', content: i18n },
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
      { id: 'mcp', title: 'MCP 入门（Model Context Protocol）', content: mcp },
      { id: 'rag-evaluation', title: 'AI 评估与 RAGAS', content: ragEvaluation },
      { id: 'function-calling', title: 'Function Calling 与 Tool Use 实战', content: functionCalling },
      { id: 'agent-security', title: 'Agent 安全与提示词注入', content: agentSecurity },
      { id: 'vector-db', title: '向量数据库对比实测', content: vectorDb },
      { id: 'agent-frameworks', title: 'Agent 框架对比', content: agentFrameworks },
      { id: 'multimodal-rag', title: '多模态 RAG 实战', content: multimodalRag },
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
      { id: 'node-backend', title: 'Node / Express 后端面试', content: nodeBackend },
      { id: 'mysql-optimization', title: '数据库与 MySQL 优化', content: mysqlOptimization },
      { id: 'redis-cache', title: 'Redis 缓存实战', content: redisCache },
      { id: 'docker-deploy', title: 'Docker 容器化部署', content: dockerDeploy },
      { id: 'message-queue', title: '消息队列实战', content: messageQueue },
      { id: 'kubernetes', title: 'Kubernetes 入门', content: kubernetes },
      { id: 'elasticsearch', title: 'Elasticsearch 与搜索实战', content: elasticsearch },
      { id: 'serverless', title: 'Serverless 与边缘计算', content: serverless },
      { id: 'api-gateway', title: 'API 网关与 Nginx', content: apiGateway },
      { id: 'release-strategy', title: '灰度发布与 A/B 测试', content: releaseStrategy },
      { id: 'observability', title: '可观测性与链路追踪', content: observability },
      { id: 'nosql-mongodb', title: 'NoSQL 与 MongoDB 实战', content: nosqlMongodb },
      { id: 'low-code', title: '低代码与可视化搭建', content: lowCode },
      { id: 'cdn', title: 'CDN 原理与静态加速', content: cdn },
    ],
  },
]

export const allKnowledgeDocs: DocItem[] = knowledgeSections.flatMap((s) => s.items)
