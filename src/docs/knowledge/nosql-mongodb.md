# NoSQL 与 MongoDB 实战

> 不是所有数据都适合关系表。文档型、KV、列族、图——NoSQL 按访问模式选型。本文以 MongoDB 为重点，讲清适用场景、与 MySQL（见 `mysql-optimization.md`）的取舍、聚合与索引，补数据层视角。

## 一、NoSQL 四大类

| 类型 | 代表 | 模型 | 适用 |
| --- | --- | --- | --- |
| **文档型** | MongoDB / CouchDB | JSON 文档 | 结构易变、嵌套对象 |
| **KV** | Redis（见 `redis-cache.md`） | 键值 | 缓存、会话、计数 |
| **列族** | Cassandra / HBase | 列簇 | 海量写入、宽表 |
| **图** | Neo4j | 节点+边 | 社交关系、推荐 |

## 二、MongoDB 是什么

文档型数据库，存 **BSON**（JSON 的二进制扩展）。集合（Collection）类似表，文档（Document）类似行，但**字段可不同构**，适合演进快、结构嵌套的数据。

```js
// 文档示例
{
  _id: ObjectId(...),
  title: "Vue3 实战",
  tags: ["vue", "frontend"],   // 数组
  author: { name: "alice", id: 1 }, // 嵌套对象
  createdAt: ISODate(...)
}
```

## 三、与 MySQL 取舍

| 维度 | MySQL（关系型） | MongoDB（文档型） |
| --- | --- | --- |
| 结构 | 强 schema，改结构需迁移 | 弱 schema，灵活 |
| 关联 | JOIN 强 | 嵌套路子，少用 JOIN |
| 事务 | ACID 完整 | 多文档事务支持但有成本 |
| 查询 | SQL 强大 | 聚合管道、特定查询强 |
| 适用 | 强一致、关联多（订单/账务） | 结构多变、读多（内容/日志/配置） |

> 取舍：核心交易/账务（强一致、复杂关联）用 MySQL；内容/配置/日志/画像（结构易变、读多）用 MongoDB。很多系统是"MySQL 主 + MongoDB 辅"。

## 四、索引

```js
db.posts.createIndex({ title: 1 })          // 单字段
db.posts.createIndex({ author: 1, createdAt: -1 }) // 复合
db.posts.createIndex({ tags: 1 })           // 数组（多键）索引
```

- 复合索引遵循**最左前缀**（同 MySQL，见 `mysql-optimization.md`）。
- `_id` 默认有唯一索引；慢查询用 `explain()` 看是否走索引。

## 五、聚合管道（Aggregation）

```js
db.orders.aggregate([
  { $match: { status: "paid" } },
  { $group: { _id: "$userId", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
])
```

类似 Unix 管道：每阶段处理上阶段输出，做 filter → group → sort → limit，等价于 SQL 的 GROUP BY。

## 六、与 VueChest 的衔接

- 内容型/结构多变的资料（如文档中心元数据、用户偏好、行为日志）可用 MongoDB 存放，免去频繁改表。
- 强一致的核心数据（用户、订单、评论）仍用 MySQL（见项目约定：market_apps 等用关系表）。
- 缓存层用 Redis（见 `redis-cache.md`）挡热点，MongoDB 兜底持久。

## 七、常见坑

- **过度嵌套**：嵌太深难查询/更新，超过一两层考虑引用（类似外键）。
- **无 schema 变脏数据**：灵活≠无约束，应用层或 JSON Schema 校验必要字段。
- **误用事务**：跨文档事务有性能成本，能靠设计（嵌套路子）避免就别用。
- **索引缺失**：聚合/查询慢 → 先 `explain` 再建索引。

## 八、小结

- NoSQL 四类：文档/MongoDB、KV/Redis、列族/Cassandra、图/Neo4j，按访问模式选。
- MongoDB 弱 schema、嵌套友好；强一致/复杂关联仍用 MySQL。
- 索引最左前缀、聚合管道做 GROUP BY；内容类数据适合它。

## 参考来源

- MongoDB 文档：<https://www.mongodb.com/docs/>
- MongoDB 聚合管道：<https://www.mongodb.com/docs/manual/aggregation/>
- 各 NoSQL 对比：<https://www.mongodb.com/nosql-explained>
