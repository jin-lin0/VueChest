---
group: 后端与基础设施
order: 58
---

# Serverless 与边缘计算

> 不想管服务器时，Serverless（函数即服务）让后端变成"按需运行的函数"。本文讲清 FaaS / 边缘函数 / BFF 的取舍、冷启动问题，以及 VueChest 这类前后端如何借 Serverless 轻量上线（配合 `docker-deploy.md` / `kubernetes.md`）。

## 一、Serverless 是什么

Serverless ≠ 没有服务器，而是**你不再运维服务器**：云厂商按请求弹性扩缩、按执行计费，闲置不花钱。核心是 **FaaS（Function as a Service）**——上传函数，事件触发执行。

## 二、三种形态

| 形态 | 说明 | 例子 |
| --- | --- | --- |
| **FaaS** | 事件触发函数，用完即弃 | 云函数、Lambda |
| **边缘函数（Edge）** | 跑在全球边缘节点，离用户近、低延迟 | Cloudflare Workers、Vercel Edge |
| **BaaS** | 后端即服务（数据库/鉴权/存储托管） | Supabase、Firebase |

## 三、典型场景

- **API 网关 + 函数**：前端请求 → API 网关 → 函数处理 → 返回 JSON。
- **BFF（Backend For Frontend）**：函数层聚合多个后端/微服务，给前端定制裁剪的数据，减少前端请求次数。
- **Webhook / 定时任务**：事件或 cron 触发的小逻辑。
- **静态站 + 边缘函数**：前端扔 CDN（R2/对象存储），动态接口走边缘函数（见 `http-network.md`）。

## 四、冷启动与优化

- **冷启动**：函数长时间闲置后首次调用需初始化运行时（拉镜像/建连接），延迟高。
- 缓解：常驻（ provisioned concurrency）、轻运行时（Node 比 Java 冷启快）、连接池复用（`global` 缓存 DB 连接）、边缘函数（启动极快）。

```js
// 连接复用：模块级缓存，避免每次冷启都新建
let pool
export async function handler() {
  pool ??= await createPool()
  return pool.query(...)
}
```

## 五、与 Docker / K8s 取舍

| 维度 | Serverless | Docker/K8s |
| --- | --- | --- |
| 运维 | 几乎零 | 需管集群 |
| 计费 | 按量，闲置 0 | 按实例时长 |
| 长任务 | 不适合（超时限制） | 适合 |
| 厂商锁定 | 较高 | 较低（标准镜像） |
| 延迟敏感 | 边缘函数优 | 需自己优化 |

> 取舍：流量波动大、轻量 API、想省运维 → Serverless；长任务/强定制/避免锁定 → 容器。

## 六、与 VueChest 的衔接

- **前端**：纯静态产物放对象存储（R2）+ CDN，全球加速（见 `docker-deploy.md` 的静态托管思路）。
- **后端 API**：VueChestServer 的轻接口可拆成云函数/边缘函数，按需扩缩。
- **AI 中转**：对话接口的流式输出（见 `ai-app-frontend.md`）可由边缘函数代理，降低首字节延迟。
- 注意超时：大模型流式响应较长，需选支持长连接/流式的函数平台。

## 七、常见坑

- **冷启动延迟**：首请求慢，关键路径用常驻或边缘。
- **厂商锁定**：函数 API/事件格式各异，抽象一层适配降低迁移成本。
- **本地调试难**：用厂商提供的本地模拟器（如 `wrangler dev` / `sam local`）。
- **状态外置**：函数无状态，会话/缓存走 Redis/对象存储（见 `redis-cache.md` / `browser-storage.md`）。

## 八、小结

- Serverless = 函数按需跑、按量计费、免运维；分 FaaS/边缘/BaaS。
- 冷启动靠常驻/轻运行时/连接复用缓解；与 Docker/K8s 按任务长短与运维意愿取舍。
- VueChest 静态走 CDN、轻接口走边缘函数最省力。

## 参考来源

- Cloudflare Workers：<https://developers.cloudflare.com/workers/>
- Vercel Functions/Edge：<https://vercel.com/docs/functions>
- AWS Lambda：<https://docs.aws.amazon.com/lambda/>
