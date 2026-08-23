---
group: 部署与云原生
order: 3
---

# Serverless 与边缘计算

> 不想管服务器时，Serverless（函数即服务）让后端变成"按需运行的函数"。本文讲清 FaaS / 边缘函数 / BFF 的取舍、冷启动问题，以及 VueChest 这类前后端如何借 Serverless 轻量上线（配合 `docker-deploy.md` / `kubernetes.md`）。

## 一、Serverless 是什么

Serverless ≠ 没有服务器，而是把容量管理、运行时与部分运维责任交给平台。常见计费包含请求、执行时间、内存、网络、存储以及可选常驻容量，“空闲一定零成本”并非所有产品都成立。FaaS 是其中一种形态，事件、托管数据库和边缘运行时也常被纳入 serverless 架构。

## 二、三种形态

| 形态                 | 说明                               | 例子                            |
| -------------------- | ---------------------------------- | ------------------------------- |
| **FaaS**             | 事件触发函数，实例可销毁也可被复用 | 云函数、Lambda                  |
| **边缘函数（Edge）** | 跑在全球边缘节点，离用户近、低延迟 | Cloudflare Workers、Vercel Edge |
| **BaaS**             | 后端即服务（数据库/鉴权/存储托管） | Supabase、Firebase              |

## 三、典型场景

- **API 网关 + 函数**：前端请求 → API 网关 → 函数处理 → 返回 JSON。
- **BFF（Backend For Frontend）**：函数层聚合多个后端/微服务，给前端定制裁剪的数据，减少前端请求次数。
- **Webhook / 定时任务**：事件或 cron 触发的小逻辑。
- **静态站 + 边缘函数**：前端扔 CDN（R2/对象存储），动态接口走边缘函数（见 `http-network.md`）。

## 四、冷启动与优化

- **冷启动**：没有可复用实例时，平台需要分配沙箱、加载代码并执行初始化；语言、包体、网络、扩容速度和平台都会影响延迟。
- 缓解：缩小依赖和初始化工作、懒加载非关键能力、使用 provisioned/min instances、把连接对象放模块级复用，并用真实区域的 P95/P99 验证。不能简单概括成“Node 一定比 Java 快”或“边缘一定无冷启动”。

```js
// 缓存 Promise，避免同一新实例的并发首请求重复建池
let poolPromise

export async function handler(request) {
  poolPromise ??= createPool({ max: 4 })
  const pool = await poolPromise
  return queryWithDeadline(pool, request, { timeoutMs: 1500 })
}
```

数据库连接要同时考虑“每实例池大小 × 最大并发实例数”。函数快速扩容可能先把数据库连接打满；可用托管 proxy/连接器、限制并发或把写入异步化。

## 五、与 Docker / K8s 取舍

| 维度     | Serverless                              | Docker/K8s                  |
| -------- | --------------------------------------- | --------------------------- |
| 运维     | 平台承担容量/主机，应用仍需可观测与治理 | 团队负责更多运行时/集群能力 |
| 计费     | 按请求、时间、资源和附加服务            | 按实例/节点与配套服务       |
| 长任务   | 受平台时限，常改用队列/工作流           | 可自定义资源和生命周期      |
| 可移植性 | 事件、运行时与托管服务可能绑定平台      | 镜像可移植但编排仍有差异    |
| 延迟     | 区域、冷启动与平台限制共同决定          | 可预热和定制，运维成本更高  |

> 取舍要基于真实流量曲线、SLO、合规、依赖和团队能力。Serverless 与容器也可混用：同步入口用函数，长任务进入队列，由容器 worker 处理。

## 六、与 VueChest 的衔接

- **前端**：纯静态产物放对象存储（R2）+ CDN，全球加速（见 `docker-deploy.md` 的静态托管思路）。
- **后端 API**：VueChestServer 的轻接口可拆成云函数/边缘函数，按需扩缩。
- **AI 中转**：对话流可以评估边缘函数，但首字节还受模型区域、跨区回源和 provider 影响；边缘位置不保证端到端更快。
- 注意超时：大模型流式响应较长，需选支持长连接/流式的函数平台。

## 七、常见坑

- **冷启动延迟**：首请求慢，关键路径用常驻或边缘。
- **厂商锁定**：函数 API/事件格式各异，抽象一层适配降低迁移成本。
- **本地调试难**：用厂商提供的本地模拟器（如 `wrangler dev` / `sam local`）。
- **状态外置**：函数无状态，会话/缓存走 Redis/对象存储（见 `redis-cache.md` / `browser-storage.md`）。

## 八、事件语义与幂等

队列、对象上传和 webhook 通常是 **at-least-once** 投递：同一事件可能重复，顺序也未必全局稳定。处理器以稳定 event ID 做幂等，并把“是否处理过”与业务写入放进同一事务或条件写：

```js
export async function consume(event) {
  return db.transaction(async (tx) => {
    const claimed = await tx.processedEvents.insertIfAbsent({
      eventId: event.id,
      receivedAt: new Date(),
    })
    if (!claimed) return { duplicate: true }

    await tx.orders.applyStatus({
      orderId: event.orderId,
      expectedVersion: event.previousVersion,
      nextStatus: event.status,
    })
    return { duplicate: false }
  })
}
```

外部 API 调用无法与本地事务原子提交时，使用 outbox、幂等 key 或补偿流程。失败事件进入有上限重试和 DLQ，保留原 event ID、错误分类与重放工具，不能无限重试毒消息。

## 九、边缘运行时与数据位置

边缘函数可能限制 Node API、原生扩展、文件系统、CPU 时间、包大小和长连接。选择前用实际依赖做兼容验证。边缘读取单一区域数据库可能增加延迟和连接压力；要在数据一致性、复制、合规驻留与网络成本之间取舍。

认证、会话和限流若依赖最终一致的全球 KV，需要明确写后读和并发更新语义。强一致交易不要因为“全球边缘”就随意复制；入口可在边缘校验与路由，核心写入仍落到权威区域。

## 十、可观测性与成本

每次调用记录 cold/warm 维度、初始化耗时、执行耗时、等待下游、内存、退出原因、重试和 trace ID。采样日志仍要保留错误与高延迟请求，敏感事件体需脱敏。

成本模型至少回放典型月流量：请求数、执行时长、内存、并发保留、网络出站、日志、队列和数据库。平均流量便宜不代表突发成本可控，应设置预算告警、用户配额、并发上限和 kill switch。

## 十一、选型决策清单

- [ ] 触发源、峰值并发、持续时间、P95/P99 SLO 与数据区域是否明确？
- [ ] 当前依赖是否兼容目标 runtime，CPU/内存/包体/流式时限是否足够？
- [ ] 数据库连接数在最大扩容时是否受 proxy、池或并发上限保护？
- [ ] 事件是否可能重复/乱序，幂等、DLQ、重放和补偿是否设计？
- [ ] 状态、密钥和临时文件是否放在正确的外部系统并按租户隔离？
- [ ] cold start、下游耗时、错误、重试与单请求成本是否可观测？
- [ ] 平台故障、配额耗尽和成本异常是否有降级与停止开关？
- [ ] 迁移时事件格式、托管数据与平台专有 API 的退出成本是否可接受？

## 十二、小结

- Serverless = 函数按需跑、按量计费、免运维；分 FaaS/边缘/BaaS。
- 冷启动靠常驻/轻运行时/连接复用缓解；与 Docker/K8s 按任务长短与运维意愿取舍。
- VueChest 静态走 CDN、轻接口走边缘函数最省力。

## 参考来源

- Cloudflare Workers：<https://developers.cloudflare.com/workers/>
- Vercel Functions/Edge：<https://vercel.com/docs/functions>
- AWS Lambda：<https://docs.aws.amazon.com/lambda/>
