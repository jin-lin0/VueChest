---
group: 开始这里
order: 1
---

# 后端与基础设施知识地图

这里收纳原先混在“面试题库”中的通用后端资料，覆盖 Node/API、数据、异步系统、部署和可观测。内容可用于 VueChestServer，也能独立用于全栈与 Agent 服务开发。

## 学习路线

| 阶段          | 核心能力                          | 推荐入口                                                                                                    |
| ------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. 服务入口   | Node 服务、REST、鉴权、网关与限流 | [Node / Express](./node-backend.md)、[API 网关](./api-gateway.md)                                           |
| 2. 数据系统   | 关系数据库、缓存与文档数据库      | [MySQL](./mysql-optimization.md)、[Redis](./redis-cache.md)、[MongoDB](./nosql-mongodb.md)                  |
| 3. 异步与搜索 | 消息投递、消费幂等和检索          | [消息队列](./message-queue.md)、[Elasticsearch](./elasticsearch.md)                                         |
| 4. 部署交付   | 容器、编排、边缘计算和内容分发    | [Docker](./docker-deploy.md)、[Kubernetes](./kubernetes.md)、[Serverless](./serverless.md)、[CDN](./cdn.md) |
| 5. 可靠运行   | 灰度、回滚、日志、指标和链路      | [发布策略](./release-strategy.md)、[可观测性](./observability.md)                                           |

## 排障顺序

1. 先确认影响范围、版本和可复现条件。
2. 从入口流量、应用实例、下游依赖到数据库逐段看指标与 trace。
3. 先止损和隔离，再根据证据修改；所有写操作准备回滚。
4. 修复后补监控、回归测试和故障复盘。

## 内容边界

这里不保存逐题面试话术；相关标准回答仍在“面试准备”。浏览器网络和前端性能放在前端目录，模型调用、RAG 与 Agent Harness 放在 AI 目录。
