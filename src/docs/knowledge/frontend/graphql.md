---
group: 综合与扩展
order: 31
---

# GraphQL 入门

> 当 REST 的"过度获取/获取不足"成为前端痛点时，GraphQL 用"一套接口、按需取字段"解决了它。本文讲清核心概念、与 REST 的取舍，以及前端如何消费，补全 API 层视角（见 `http-network.md`）。

## 一、GraphQL 是什么

GraphQL 是**查询语言 + 类型系统 + 执行语义**：客户端声明需要的字段，服务端按 Schema 验证并执行。HTTP 服务常使用一个 `/graphql` 端点，但这属于常见传输约定，不是 GraphQL 语言强制要求；字段“按需”也不保证后端天然高效。

```graphql
query {
  user(id: 1) {
    name
    posts {
      title
    } # 嵌套按需取
  }
}
```

## 二、三大操作

| 操作             | 语义         | 对应 REST             |
| ---------------- | ------------ | --------------------- |
| **Query**        | 无副作用读取 | REST GET 的常见用途   |
| **Mutation**     | 有副作用操作 | REST 写操作的常见用途 |
| **Subscription** | 实时推送     | WebSocket             |

## 三、Schema 与 Resolver

```graphql
type User {
  id: ID!
  name: String!
  posts: [Post!]!
}
type Query {
  user(id: ID!): User
}
```

```js
// resolver：每个字段对应一个函数取数
const resolvers = {
  Query: { user: (_, { id }) => db.user.find(id) },
  User: { posts: (user) => db.post.findByUser(user.id) },
}
```

Schema 是“契约”，Resolver 是“实现”；类型系统支持请求验证、自省和 IDE 补全。授权仍必须在执行层检查，Schema 中“字段存在”不代表当前用户有权读取。

## 四、与 REST 对比

| 维度 | REST                                  | GraphQL                                       |
| ---- | ------------------------------------- | --------------------------------------------- |
| 端点 | 多个资源端点                          | 单一 `/graphql`                               |
| 获取 | 服务端定结构，易过度/不足             | 客户端定字段，精准                            |
| 版本 | 常 `/v1` `/v2`                        | 靠 Schema 演进（弃用字段）                    |
| 缓存 | 靠 HTTP 缓存（见 `browser-cache.md`） | 需客户端/边缓存，复杂                         |
| 错误 | 主要依赖 HTTP 状态码与业务 body       | request error 或 `data` + `errors` 的部分结果 |

> 取舍：GraphQL 减少请求次数、前端灵活；但服务端实现复杂、N+1 查询、缓存与限流更难。不是 REST 的取代者，按场景选。

## 五、前端消费

```ts
// urql / Apollo 发起查询
const { data } = useQuery(gql`
  query {
    user(id: 1) {
      name
      posts {
        title
      }
    }
  }
`)
```

- 工具：`Apollo Client`（全功能）、`urql`（轻量）、`Relay`（Facebook，强约束）。
- 类型安全：`graphql-codegen` 从 Schema 生成 TS 类型，前端零手写接口类型。

变量与 operation name 要与查询分离，不能字符串拼接用户输入。fragment 用于复用字段选择，但过度碎片化会让真实请求形状难追踪。

```graphql
query UserCard($id: ID!) {
  user(id: $id) {
    id
    name
    avatarUrl
  }
}
```

客户端不能只判断 HTTP 200。响应可能同时包含部分 `data` 和字段级 `errors`；页面要明确是允许展示部分结果、整页失败，还是仅对某张卡片降级。Mutation 还应返回稳定的业务错误结构，区分校验失败、权限拒绝和系统故障。

## 六、N+1 与 DataLoader

一个 `User.posts` 在列表里被调用 N 次 → N+1 查询。用 **DataLoader** 批处理 + 缓存：

```js
const postLoader = new DataLoader((userIds) => db.post.batchByUsers(userIds)) // 一次 IN 查询
```

DataLoader 应按请求创建：它的缓存主要用于一次 GraphQL 执行内的批处理与去重。把含权限的数据 loader 做成全局单例，可能跨用户返回旧数据。批处理函数还必须按输入 key 顺序返回等长结果，不能直接依赖数据库 `IN` 查询的返回顺序。

## 七、客户端缓存与更新

Apollo/Relay 等通常按 `__typename + id` 归一化实体。查询返回相同实体时可共享更新，但没有稳定 ID、自定义 key 或分页合并策略时会出现重复和覆盖。Mutation 后可依赖返回实体自动合并，也可精确更新 cache；不确定时重新获取相关 query，代价更高但语义清楚。

列表分页要区分 cursor 与 offset。实时变化的数据使用 cursor 更稳；merge 函数需处理去重、乱序和过滤条件。GraphQL 的 POST 响应不天然享受普通 URL 的 CDN 缓存，persisted query 可以把已审核查询映射成哈希，改善 GET/CDN 与 allowlist 治理。

## 八、安全与成本控制

- 每个 resolver/领域 service 做对象级授权，不能只在顶层 Query 检查一次。
- 限制深度、alias 数量、字段复杂度和返回分页大小；仅限流“请求次数”挡不住一个超大查询。
- 生产自省是否开放取决于威胁模型；关闭自省不能替代授权和成本限制。
- 上传、subscription 和 GET query 需要单独评估 CSRF、连接数、消息大小与超时。
- 日志记录 operation name、query hash、耗时和错误路径，避免默认保存含敏感变量的完整 query。

## 九、常见坑与决策清单

- 把 GraphQL 当“自动聚合数据库”，resolver 逐字段查询导致 N+1。
- 前端为省请求声明巨大通用 query，过度获取问题以另一种形式回来。
- Schema 删除或改字段而没有 deprecation、使用统计和迁移窗口。
- 只生成 TS 类型却不校验服务端 schema 变更，构建通过但运行时查询失败。
- 缓存 key/分页 merge 不明确，Mutation 后 UI 出现重复、旧值或幽灵项。

选型时确认：客户端字段差异是否显著、聚合边界是否稳定、团队能否承担 schema 治理/N+1/成本安全、是否强依赖 HTTP/CDN 缓存、离线与文件传输是否重要。简单资源 CRUD 用 REST 往往更直接；复杂多端图谱和快速组合需求才更能发挥 GraphQL 优势。

## 十、何时用 / 不用

- 用：多端（Web/App）字段需求差异大、聚合多数据源、前端迭代快。
- 不用：简单 CRUD、强缓存需求、团队无 GraphQL 经验。

## 十一、小结

- "按需取字段"解决过度/不足获取；Query/Mutation/Subscription 三类操作。
- Schema 是契约，Resolver 是取数实现；N+1 靠 DataLoader 批处理。
- 与 REST 取舍在"灵活性 vs 复杂度"，非替代关系。

## 参考来源

- GraphQL 官方文档：<https://graphql.org/learn/>
- GraphQL 规范：<https://spec.graphql.org/>
- Apollo Client：<https://www.apollographql.com/docs/react/>
- graphql-codegen：<https://the-guild.dev/graphql/codegen>
