---
group: 开始这里
order: 1
---

# 前端知识地图

这里存放可脱离具体面试题复用的前端知识。建议按“语言 → 框架 → 浏览器 → 工程质量 → 架构扩展”学习，不必从目录第一篇顺序读到最后一篇。

## 学习路线

| 阶段        | 重点                                | 推荐入口                                                                                               |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. 页面基础 | CSS 布局、响应式与设计约束          | [现代 CSS 布局](./layout.md)、[Design Token](./design-token.md)                                        |
| 2. 语言基础 | JavaScript、事件循环、TypeScript    | [现代 JavaScript](./js-modern.md)、[事件循环](./event-loop.md)、[TypeScript 进阶](./ts-advanced.md)    |
| 3. Vue 应用 | Composition API、响应式、状态和路由 | [Vue 3 组合式 API](./vue3-composition.md)、[响应式原理](./vue-reactivity.md)、[Pinia](./pinia.md)      |
| 4. 浏览器   | 渲染、网络、缓存、存储与安全        | [浏览器渲染](./browser-rendering.md)、[HTTP](./http-network.md)、[Web 安全](./web-security.md)         |
| 5. 工程质量 | 构建、测试、性能和监控              | [前端工程化](./frontend-engineering.md)、[测试](./frontend-testing.md)、[性能优化](./perf-frontend.md) |
| 6. 架构扩展 | 状态、微前端、SSR、跨端与可视化     | [状态管理对比](./state-management.md)、[微前端](./micro-frontend.md)、[可视化](./chart-viz.md)         |

## 怎么选择文档

- 查 API 或框架机制：优先看 Vue 生态、JavaScript 和 TypeScript 分组。
- 排查线上问题：优先看浏览器原理与网络、性能与监控。
- 做项目选型：优先看工程化与构建、架构与设计。
- 准备面试：这里补原理，标准话术和全量题目统一放在“面试准备”。

## 内容边界

前端目录只保存可复用技术知识，不重复收录题目清单、HR 话术和逐题答案。Node、数据库、容器和消息队列已归入“后端与基础设施”；模型、RAG、MCP 与 Agent 编排归入“AI / Agent”。
