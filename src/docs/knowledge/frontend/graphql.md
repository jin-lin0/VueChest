---
group: 综合与扩展
order: 31
---

# GraphQL 入门

> 当 REST 的"过度获取/获取不足"成为前端痛点时，GraphQL 用"一套接口、按需取字段"解决了它。本文讲清核心概念、与 REST 的取舍，以及前端如何消费，补全 API 层视角（见 `http-network.md`）。

## 一、GraphQL 是什么

GraphQL 是**查询语言 + 运行时**：客户端在单次请求里声明"要哪些字段"，服务端按 Schema 精确返回，不多不少。一个端点（`/graphql`）替代 REST 的多端点。

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

| 操作             | 语义         | 对应 REST       |
| ---------------- | ------------ | --------------- |
| **Query**        | 读           | GET             |
| **Mutation**     | 写（增删改） | POST/PUT/DELETE |
| **Subscription** | 实时推送     | WebSocket       |

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

Schema 是"契约"，Resoler 是"实现"；类型系统让前后端对齐、自带自省（docs/IDE 补全）。

## 四、与 REST 对比

| 维度 | REST                                  | GraphQL                    |
| ---- | ------------------------------------- | -------------------------- |
| 端点 | 多个资源端点                          | 单一 `/graphql`            |
| 获取 | 服务端定结构，易过度/不足             | 客户端定字段，精准         |
| 版本 | 常 `/v1` `/v2`                        | 靠 Schema 演进（弃用字段） |
| 缓存 | 靠 HTTP 缓存（见 `browser-cache.md`） | 需客户端/边缓存，复杂      |
| 错误 | HTTP 状态码                           | 200 + `errors` 数组        |

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

## 六、N+1 与 DataLoader

一个 `User.posts` 在列表里被调用 N 次 → N+1 查询。用 **DataLoader** 批处理 + 缓存：

```js
const postLoader = new DataLoader((userIds) => db.post.batchByUsers(userIds)) // 一次 IN 查询
```

## 七、何时用 / 不用

- 用：多端（Web/App）字段需求差异大、聚合多数据源、前端迭代快。
- 不用：简单 CRUD、强缓存需求、团队无 GraphQL 经验。

## 八、小结

- "按需取字段"解决过度/不足获取；Query/Mutation/Subscription 三类操作。
- Schema 是契约，Resolver 是取数实现；N+1 靠 DataLoader 批处理。
- 与 REST 取舍在"灵活性 vs 复杂度"，非替代关系。

## 参考来源

- GraphQL 官方文档：<https://graphql.org/learn/>
- Apollo Client：<https://www.apollographql.com/docs/react/>
- graphql-codegen：<https://the-guild.dev/graphql/codegen>
