---
group: Node 与 API
order: 1
---

# Node / Express 后端面试

> 适用场景：补全全栈视角（VueChest 后端是 VueChestServer：Express + MySQL + Sequelize）。本文讲 Node 事件循环差异、Express 中间件、鉴权、REST、错误处理。
> 阅读前提：JS 基础、事件循环（见 `event-loop`）、Web 安全（见 `web-security`）。

前端同学懂 Node，能独立打通「请求从浏览器到数据库再回来」的全链路。下面按面试高频点梳理。

## 一、Node 事件循环与浏览器差异

- 浏览器：宏任务 / 微任务 / 渲染三层。
- Node：**多个阶段**（Timers → Pending → Poll → Check → Close），且多一个 `process.nextTick` 队列（**比微任务还优先**）。
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

> 顺序即一切：错误中间件（`(err, req, res, next)` 四参）必须放**最后**，才能兜住前面抛的错。VueChestServer 的 auth/OAuth PKCE、R2 上传、市场 API 都靠中间件串联。

## 三、鉴权：Session vs JWT

- **Session**：服务端存登录态（内存/Redis），客户端持 cookie（带 sessionId）。状态在服务端。
- **JWT**：服务端签一个 token（header.payload.signature），客户端持 token，服务端**无状态**校验签名。适合分布式/移动端。
- 实践：JWT 放 `Authorization: Bearer <token>`；敏感信息别塞 payload（可被解码）；设短过期 + 刷新机制。

> VueChestServer 用 JWT + OAuth PKCE。前端持有 token（见 `pinia` 持久化），请求拦截器自动附带（见 `vite` 的 `?raw` 之外、`request.ts` 模式）。

## 四、REST 与路由设计

- 资源用名词、用 HTTP 方法表意：`GET /users`、`POST /users`、`GET /users/:id`、`PATCH /users/:id`、`DELETE /users/:id`。
- 统一响应结构（VueChestServer 约定前端 API 须带 `success` 字段，否则 `request.ts` 抛 `ApiError`），便于前端统一处理。
- 版本化：`/api/v1/...`，避免 breaking 老客户端。

## 五、错误处理与异步

```js
// async 路由要包一层，把 reject 转给错误中间件
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

app.get(
  '/api/me',
  wrap(async (req, res) => {
    const me = await db.user.findByPk(req.userId)
    res.json({ success: true, data: me })
  }),
)
// 末尾统一兜底
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ success: false, message: '服务器错误' })
})
```

> `try/catch` 包 async 是 Node 后端的高频坑：未捕获的 Promise reject 在老 Node 会进程崩；用 `wrap` 或 `express-async-errors` 统一兜。

## 六、数据库交互（Sequelize / 原生）

- **Sequelize**（VueChestServer 用）：ORM，模型定义 + 关联（belongsTo/hasMany），`sync()` 建表。
- 注意 N+1 查询：循环里逐个查关联 → 用 `include` 预加载（eager loading）一次搞定。
- 原生 SQL 用参数化（见 `web-security` 防注入），别字符串拼接。

## 七、进程管理与部署

- 单进程吃不满多核 → `cluster` 模式或 PM2 起多个 worker。
- 无状态化：登录态用 JWT 或 Redis，方便水平扩容。
- 日志/监控/健康检查（`/healthz`）是上线基本盘。
- 配合前端：Vercel 跑前端、独立服务跑 Express（VueChestServer），跨域用 CORS 或 dev proxy（见 `vite`）。

## 八、面试速记

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
