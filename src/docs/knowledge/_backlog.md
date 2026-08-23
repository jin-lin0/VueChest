# 知识库待写主题清单（Topic Backlog）

> 持续收集用。每完成一项，放入正确分类目录、补齐 frontmatter，并在这里划掉；文档由 `knowledge/index.ts` 自动注册。
> 优先级：P0 高（项目强相关 / 高频痛点）、P1 中、P2 低（锦上添花）。

## P0 — 项目强相关，建议优先写

- [x] **Vue 3 组合式 API 实战**（`vue3-composition.md`，已发布）
- [x] **TypeScript 进阶类型与工程实践**（`ts-advanced.md`，已发布）
- [x] **Pinia 状态管理深入**（store 设计、持久化、与组合式函数协作）— `pinia.md`，已发布
- [x] **Vue Router 实战**（懒加载、路由守卫、动态路由、过渡动画坑）— `vue-router.md`，已发布
- [x] **Vite 构建与优化**（分包、预构建、插件生态、`?raw` / `?url` 等资源导入）— `vite.md`，已发布
- [x] **Vue 组件库开发**（基于现有 `src/components`，Props/插槽/Teleport/provide-inject）— `component-library.md`，已发布

## P1 — AI / Agent 扩展

- [x] **AI 评估与 RAGAS**（RAG 质量量化：faithfulness / answer relevancy / context recall）— `rag-evaluation.md`，已发布
- [x] **Function Calling 与 Tool Use 实战**（多模型兼容、并行调用、错误兜底）— `function-calling.md`，已发布
- [x] **MCP（Model Context Protocol）入门**（协议结构、与 Agent 的关系、生态）— `mcp.md`，已发布
- [x] **提示词注入与 Agent 安全**（OWASP LLM Top 10 2025 落地清单）— `agent-security.md`，已发布
- [x] **向量数据库对比实测**（Chroma / Qdrant / pgvector 插入/检索基准）— `vector-db.md`，已发布

## P1 — 前端进阶

- [x] **浏览器渲染原理**（DOM/CSSOM/渲染树/合成层，结合 perf-frontend）— `browser-rendering.md`，已发布
- [x] **事件循环与宏微任务深入**（配合 js-modern 的并发章节）— `event-loop.md`，已发布
- [x] **Web 安全**（XSS / CSRF / CSP / 同源，前端面试高频）— `web-security.md`，已发布
- [x] **设计模式在前端的应用**（观察者/发布订阅/策略/单例，对应场景题章节）— `design-patterns.md`，已发布
- [x] **现代构建工具对比**（Vite / Webpack / esbuild / Rollup 取舍）— `build-tools.md`，已发布

## P2 — 题库 / 工程化

- [x] **前端工程化全链路**（Monorepo / pnpm / CI-CD / 规范化提交）— `frontend-engineering.md`，已发布
- [x] **可视化与 Canvas / WebGL 入门**（配合 VueChest 游戏类 App）— `canvas-webgl.md`，已发布
- [x] **Node / Express 后端面试**（本项目后端栈，补全全栈视角）— `backend/node-backend.md`，已发布
- [x] **数据库与 MySQL 优化**（索引 / 事务 / 慢查询，对应 VueChestServer）— `backend/mysql-optimization.md`，已发布

## 收集渠道（持续喂料）

- 项目 PR / 复盘里反复出现的坑 → 沉淀成文章小节。
- 面试八股新题（牛客 / 力扣讨论区）→ 补充到对应题库章节。
- 官方文档更新 / 版本发布（Vue、TS、LangGraph、OpenAI）→ 回看对应文档是否漂移。
- 用户实际提问的高频技术点 → 优先立项。

## 写作节奏建议

- 每周 1–2 篇新文章或 1 个题库章节扩充，先 P0 后 P1。
- 每次改动现有文章：优先「补参考来源链接 + 修版本漂移」，结构尽量不动。
- 新文章一律套用 `_template.md`，结尾带「参考来源」。

## 常青扩展（持续收集，无终点）

> backlog 原 P0/P1/P2 已全部发布。以下为「持续收集」阶段新增与候选，随项目演进、技术更新不断补充。

### 已发布（本轮常青扩充）

- [x] **HTTP 与浏览器网络** — `http-network.md`
- [x] **浏览器存储**（Cookie/LS/Session/IDB/Cache）— `browser-storage.md`
- [x] **前端监控与埋点**（错误/Web Vitals/Source Map/告警）— `frontend-monitoring.md`

### 候选（按需立项，priority 由用户提问/技术热度驱动）

- [x] **Vue 3 响应式原理**（Proxy/reactive/依赖收集/ref vs reactive 取舍）— `vue-reactivity.md`，已发布
- [x] **前端单元测试**（Vitest + Testing Library，本项目已用 vitest）— `frontend-testing.md`，已发布
- [x] **微前端 / 模块联邦**（大型应用拆分）— `micro-frontend.md`，已发布
- [x] **SSR / SSG / Nuxt**（Vue 服务端渲染与静态生成）— `ssr-nuxt.md`，已发布
- [x] **无障碍（a11y）** 基础 — `accessibility.md`，已发布
- [x] **AI 应用前端**（流式渲染、SSE 消费、打字机效果，对应 VueChest AI 对话）— `ai-app-frontend.md`，已发布
- [x] **Agent 框架对比**（LangGraph vs AutoGen vs CrewAI vs 自研）— `agent-frameworks.md`，已发布
- [x] **多模态 RAG**（图/表/视频检索）— `multimodal-rag.md`，已发布
- [x] **Design Token 与 CSS 架构**（与 VueChest tokens.css 暗色模式联动）— `design-token.md`，已发布
- [x] **浏览器缓存机制**（强缓存/协商缓存/Service Worker）— `browser-cache.md`，已发布
- [x] **前端路由原理**（hash/history/SPA fallback）— `frontend-router.md`，已发布
- [x] **Redis 缓存实战**（穿透/击穿/雪崩，对应 VueChestServer）— `redis-cache.md`，已发布
- [x] **WebAssembly 入门** — `webassembly.md`，已发布
- [x] **Docker 容器化部署**（多阶段构建/Compose，对应 VueChest 全栈）— `docker-deploy.md`，已发布
- [x] **跨端开发选型**（RN/Flutter/小程序/Taro/Electron）— `cross-platform.md`，已发布
- [x] **GraphQL 入门**（Schema/Resolver/与 REST 对比/DataLoader）— `graphql.md`，已发布
- [x] **消息队列实战**（Kafka/RabbitMQ/Redis Stream/消费幂等）— `message-queue.md`，已发布
- [x] **前端图表与可视化**（ECharts/D3/Canvas/WebGL 选型）— `chart-viz.md`，已发布
- [x] **Kubernetes 入门**（Pod/Deployment/Service/Ingress/滚动发布）— `kubernetes.md`，已发布
- [x] **前端状态管理对比**（Redux/Zustand/Pinia/Jotai/Signals）— `state-management.md`，已发布
- [x] **Elasticsearch 与搜索实战**（倒排索引/分词/DSL/聚合）— `elasticsearch.md`，已发布
- [x] **前端国际化（i18n）**（vue-i18n/react-i18next/占位符/RTL）— `i18n.md`，已发布
- [x] **Serverless 与边缘计算**（FaaS/边缘/BFF/冷启动，对应 VueChest 部署）— `serverless.md`，已发布
- [x] **API 网关与 Nginx**（反向代理/负载均衡/限流/SSL 终止）— `api-gateway.md`，已发布
- [x] **灰度发布与 A/B 测试**（蓝绿/金丝雀/特性开关/回滚）— `release-strategy.md`，已发布
- [x] **可观测性与链路追踪**（日志/指标/链路/OpenTelemetry）— `observability.md`，已发布
- [x] **NoSQL 与 MongoDB 实战**（文档型/KV/图、聚合管道、与 MySQL 取舍）— `nosql-mongodb.md`，已发布
- [x] **低代码与可视化搭建**（Schema 驱动渲染、与组件库衔接）— `low-code.md`，已发布
- [x] **CDN 原理与静态加速**（边缘缓存/回源/与浏览器缓存协作）— `cdn.md`，已发布
- [x] 面试题库扩充：`frontend.md` / `agent.md` 各加「2026 高频新题/前沿补充」小节
- [x] 存量文章版本漂移巡检：AI 类文章已显式钉版本 + 引官方文档；layout 过期句早修；全库无陈旧表述（见 drift 小结）
- [ ] 面试题库：随牛客/力扣新题持续往 `frontend`/`agent`/`algorithm`/`scenario`/`niuke` 章节追加（长期）
