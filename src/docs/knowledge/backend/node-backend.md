---
group: Node 与 API
order: 1
---

# Node / Express 后端手册

> 适用场景：补全全栈视角（VueChest 后端是 VueChestServer：Express + MySQL + Sequelize）。本文讲 Node 事件循环差异、Express 中间件、鉴权、REST、错误处理。
> 阅读前提：JS 基础、事件循环（见 `event-loop`）、Web 安全（见 `web-security`）。

前端同学懂 Node，能独立打通「请求从浏览器到数据库再回来」的全链路。下面按面试高频点梳理。

## 一、Node 事件循环与浏览器差异

- 浏览器：宏任务 / 微任务 / 渲染三层。
- Node：libuv 事件循环包含 timers、pending callbacks、poll、check、close callbacks 等阶段；`process.nextTick` 队列与 Promise microtask 还会在回调边界清空。
- 同一段 `setTimeout` vs `setImmediate` 顺序在不同阶段启动会有差异，面试常考，但实战多靠「别依赖微妙时序」规避。

```js
setTimeout(() => console.log('timeout'), 0)
setImmediate(() => console.log('immediate'))
// 在主模块里谁先不确定；在 I/O 回调里 setImmediate 先
```

## 二、Express 中间件

中间件是「请求处理管道」，按 `app.use` 注册顺序执行，靠 `next()` 往下传：

```js
app.use(express.json()) // 解析 body
app.use('/api', authMiddleware) // 鉴权（拦截未登录）
app.use((req, res, next) => {
  // 自定义日志
  console.log(req.method, req.path)
  next()
})
app.get('/api/user', (req, res) => res.json({ ok: true }))
```

> 注册顺序决定作用范围；404 处理和错误中间件通常放在路由之后。错误中间件保留 `(err, req, res, next)` 四参数签名。VueChestServer 当前使用 Express 5.2.1，其异步 Promise handler reject 会自动转给错误处理器。

## 三、鉴权：Session vs JWT

- **Session**：服务端存登录态（内存/Redis），客户端持 cookie（带 sessionId）。状态在服务端。
- **JWT**：服务端签名 claims，资源服务可在不查 session 的情况下验证，但注销、刷新令牌轮换、设备管理与权限即时撤销往往仍需状态。
- Bearer token 放 Authorization 还是 HttpOnly Cookie，要结合客户端、XSS/CSRF、CORS 与刷新流程选择。JWT payload 只是编码可读，不放秘密；验证签名之外还要校验 issuer、audience、过期和允许算法。

> VueChestServer 用 JWT + OAuth PKCE。前端持有 token（见 `pinia` 持久化），请求拦截器自动附带（见 `vite` 的 `?raw` 之外、`request.ts` 模式）。

## 四、REST 与路由设计

- 资源用名词、用 HTTP 方法表意：`GET /users`、`POST /users`、`GET /users/:id`、`PATCH /users/:id`、`DELETE /users/:id`。
- 统一响应结构（VueChestServer 约定前端 API 须带 `success` 字段，否则 `request.ts` 抛 `ApiError`），便于前端统一处理。
- 版本化：`/api/v1/...`，避免 breaking 老客户端。

## 五、错误处理与异步

```js
// Express 5 会把 async handler 的 reject 交给错误中间件
app.get('/api/me', async (req, res) => {
  const me = await db.user.findByPk(req.auth.userId)
  if (!me) throw new NotFoundError('USER_NOT_FOUND')
  res.json({ success: true, data: me })
})

// 末尾统一兜底
app.use((err, req, res, next) => {
  req.log.error({ err, requestId: req.id }, 'request failed')
  const safe = toPublicHttpError(err)
  res.status(safe.status).json({
    success: false,
    code: safe.code,
    message: safe.message,
    requestId: req.id,
  })
})
```

> Express 4 项目才常用 `wrap`/额外库传递 async reject。无论版本，已经开始写响应后再报错要避免二次发送；未知异常记录内部堆栈，客户端只返回稳定错误码和 request ID。进程级未捕获异常不应吞掉继续运行。

## 六、数据库交互（Sequelize / 原生）

- **Sequelize**（VueChestServer 用）：ORM，模型定义 + 关联（belongsTo/hasMany）。开发可用 `sync()` 辅助，生产 schema 应使用可审计、可回滚/向前修复的 migration。
- 注意 N+1 查询：循环里逐个查关联 → 用 `include` 预加载（eager loading）一次搞定。
- 原生 SQL 用参数化（见 `web-security` 防注入），别字符串拼接。

## 七、进程管理与部署

- CPU 密集任务会阻塞事件循环，可放 Worker Threads、任务队列或独立服务。水平扩容通常由进程管理器/容器编排完成，不必默认在容器内再套 cluster/PM2。
- 无状态化：登录态用 JWT 或 Redis，方便水平扩容。
- 日志/监控/健康检查（`/healthz`）是上线基本盘。
- 配合前端：Vercel 跑前端、独立服务跑 Express（VueChestServer），跨域用 CORS 或 dev proxy（见 `vite`）。

## 八、输入验证、授权与 API 语义

类型系统不会验证网络输入。path/query/header/body 进入业务前用 schema 校验并限制字符串、数组、分页与上传大小；校验成功后再做资源级授权。参数化 SQL 防注入，但不解决用户能否读取该行。

写接口设计幂等边界：PUT/DELETE 按语义通常幂等，POST 可用 `Idempotency-Key` + 请求摘要 + 结果存储避免客户端超时重试重复创建。冲突使用版本号/ETag 条件更新并返回 409/412，而不是最后写入者悄悄覆盖。

不要把所有失败都包装成 200。401 表示缺少/无效认证，403 表示不允许，404 可在敏感资源场景隐藏存在性，422/400 表达校验错误，429 搭配限流信息。响应 envelope 可以统一，但不应抹平 HTTP 语义。

## 九、超时、取消与资源上限

服务端为请求设置 deadline，并把 AbortSignal/取消传播到 fetch、数据库或下游；客户端断开后停止无价值的长任务。各层重试必须受总 deadline 与幂等性约束，避免浏览器、网关、服务各重试三次形成风暴。

限制 JSON/body/upload 大小、请求头、连接数和每租户并发；慢外部依赖使用超时、熔断和有界队列。正则、JSON 解析、压缩和同步文件 API 都可能阻塞事件循环，监控 event loop delay、堆内存、GC 与 active handles。

## 十、优雅关闭与健康检查

收到 SIGTERM 后先让 readiness 失败、停止接收新连接，再等待进行中请求、关闭 HTTP keep-alive、队列 consumer 和数据库池，超时后退出。liveness 只检测进程是否失去进展，不能因为一个可降级下游失败就重启全部实例。

启动阶段先校验必需配置并建立关键依赖，再标记 ready。后台 Promise 必须有明确 owner 和错误路径，不能 `void asyncTask()` 后让 rejection 变成全局事故。

## 十一、常见坑

- **按 Express 4 写 Express 5 教程**：重复包装、错误流判断与实际项目版本不一致。
- **JWT 等同完全无状态**：无法可靠处理刷新轮换、注销和权限即时撤销。
- **只做 schema 校验不做授权**：参数合法但可越权访问他人资源。
- **事务里调用外部 API**：锁持有过久且重试语义复杂。
- **同步 CPU/文件操作进请求路径**：一个请求阻塞整个事件循环。
- **错误中间件回显 `err.message/stack`**：泄露 SQL、路径、token 或内部实现。
- **健康检查只回固定 200**：实例已无法服务仍继续接流量。

## 十二、架构决策清单

- [ ] 项目 Express/Node/Sequelize 版本是否锁定，并按对应文档实现错误流？
- [ ] 输入 schema、资源授权、租户隔离和 HTTP 状态是否逐层明确？
- [ ] token 存储、刷新、撤销、XSS/CSRF 与 CORS 是否配套？
- [ ] 写操作是否有事务、版本条件、幂等与重试边界？
- [ ] body、上传、并发、超时和事件循环阻塞是否有上限和指标？
- [ ] migration 是否兼容滚动发布，是否避免生产 `sync({ alter: true })`？
- [ ] SIGTERM、客户端取消、下游超时和未捕获异常是否演练？
- [ ] 日志/trace 是否可定位 request 又不会泄露凭据和 PII？

## 十三、面试速记

| 主题     | 必会                                    |
| -------- | --------------------------------------- |
| 事件循环 | Node 多阶段 + nextTick 优先于微任务     |
| 中间件   | 顺序、next()、错误中间件四参置底        |
| 鉴权     | Session vs JWT 区别、JWT 无状态、Bearer |
| REST     | 方法语义、统一响应、版本化              |
| 异步     | async 必须兜错、wrap 模式               |
| ORM      | 模型关联、N+1、预加载                   |

## 参考来源

- Node.js 官方文档：<https://nodejs.org/en/docs>
- Express 文档：<https://expressjs.com/>
- Express 错误处理：<https://expressjs.com/en/guide/error-handling.html>
- JWT 介绍：<https://jwt.io/introduction>
- Sequelize：<https://sequelize.org/>
