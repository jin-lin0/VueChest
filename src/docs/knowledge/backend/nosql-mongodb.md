---
group: 数据与缓存
order: 3
---

# NoSQL 与 MongoDB 实战

> 不是所有数据都适合关系表。文档型、KV、列族、图——NoSQL 按访问模式选型。本文以 MongoDB 为重点，讲清适用场景、与 MySQL（见 `mysql-optimization.md`）的取舍、聚合与索引，补数据层视角。

## 一、NoSQL 四大类

| 类型       | 代表                         | 模型      | 适用               |
| ---------- | ---------------------------- | --------- | ------------------ |
| **文档型** | MongoDB / CouchDB            | JSON 文档 | 结构易变、嵌套对象 |
| **KV**     | Redis（见 `redis-cache.md`） | 键值      | 缓存、会话、计数   |
| **列族**   | Cassandra / HBase            | 列簇      | 海量写入、宽表     |
| **图**     | Neo4j                        | 节点+边   | 社交关系、推荐     |

## 二、MongoDB 是什么

MongoDB 以 **BSON** 文档存储数据。集合可容纳结构不同的文档，也支持 JSON Schema validation；“灵活 schema”不等于不需要 schema、迁移和版本治理。文档模型适合一次读写的聚合边界与嵌套数据。

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

| 维度 | MySQL（关系型）             | MongoDB（文档型）                 |
| ---- | --------------------------- | --------------------------------- |
| 结构 | 显式表/约束，迁移工具成熟   | 灵活文档 + 可选 schema validation |
| 关联 | JOIN 与关系约束强           | 嵌入、引用与 `$lookup`            |
| 事务 | 成熟多表事务                | 单文档原子；支持多文档事务        |
| 查询 | SQL 强大                    | 聚合管道、特定查询强              |
| 适用 | 强一致、关联多（订单/账务） | 结构多变、读多（内容/日志/配置）  |

> 不能按“交易必 MySQL、内容必 MongoDB”机械选择。先从一致性、查询、关系、写入模式、团队运维和恢复目标建模。日志通常更适合专门的日志/搜索平台，配置也未必需要文档数据库。

## 四、索引

```js
db.posts.createIndex({ title: 1 }) // 单字段
db.posts.createIndex({ author: 1, createdAt: -1 }) // 复合
db.posts.createIndex({ tags: 1 }) // 数组（多键）索引
```

- 复合索引的字段顺序决定支持的 query/sort，常按 equality → sort → range 的访问模式设计并用 `explain("executionStats")` 验证。
- `_id` 默认有唯一索引；慢查询用 `explain()` 看是否走索引。

## 五、聚合管道（Aggregation）

```js
db.orders.aggregate([
  { $match: { status: 'paid' } },
  { $group: { _id: '$userId', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
])
```

类似 Unix 管道：每阶段处理上阶段输出，做 filter → group → sort → limit，等价于 SQL 的 GROUP BY。

## 六、与 VueChest 的衔接

- 内容型/结构多变的资料（如文档中心元数据、用户偏好、行为日志）可用 MongoDB 存放，免去频繁改表。
- 强一致的核心数据（用户、订单、评论）仍用 MySQL（见项目约定：market_apps 等用关系表）。
- 缓存层用 Redis（见 `redis-cache.md`）挡热点，MongoDB 兜底持久。

VueChest 当前已有 MySQL/Sequelize 数据模型，没有仅因“文档元数据灵活”就迁 MongoDB 的必要。只有新访问模式在关系模型中明显笨重，并且评估过双存储运维成本时才引入。

## 七、常见坑

- **无界嵌入**：数组/子文档持续增长会逼近 16 MiB 文档上限并放大更新，改用引用或 bucket pattern。
- **无 schema 变脏数据**：灵活≠无约束，应用层或 JSON Schema 校验必要字段。
- **误用事务**：跨文档事务有性能成本，能靠设计（嵌套路子）避免就别用。
- **索引缺失**：聚合/查询慢 → 先 `explain` 再建索引。

## 八、嵌入还是引用

判断原则是“一起读取、一起更新、生命周期一致”倾向嵌入；独立增长、多对多、独立权限和高频单独访问倾向引用。不要以嵌套层数一刀切：小而有界的多层地址可以嵌入，一个无限增长的一层评论数组也不应嵌入。

单文档更新原子，适合把必须共同变化的数据放在同一聚合根。跨文档事务能提供 ACID，但会增加锁、网络和重试成本；如果每次请求都依赖大型多文档事务，可能说明文档边界或数据库选型不匹配。

文档更新使用 `$set/$inc/$push` 等原子操作和版本条件，避免读出整文档修改后覆盖并发写。大数组分页用独立集合和稳定游标，不要每次返回完整文档。

## 九、查询、聚合与索引成本

把 `$match` 和能缩小数据的阶段尽量放前面，但最终以优化器和 `explain` 为准。`$lookup`、`$unwind`、`$sort` 与 `$group` 可能放大中间结果或溢写磁盘；建立真实数据规模的性能基线，限制用户可控管道和结果数。

每个索引都会增加写入、内存和磁盘成本。数组字段产生 multikey 索引并有组合限制；排序与 filter 的字段顺序要按真实查询设计。低选择性索引不一定有用，未命中索引的 regex 和任意动态字段搜索也可能扫描大量文档。

TTL index 适合“过期后最终删除”，后台清理不是精确计时器，不应用于到点必须撤权/扣费的逻辑。唯一索引才是并发下真正的去重边界，应用层“先查再插”会竞争。

## 十、复制、分片与一致性

Replica set 提供冗余和故障切换；read concern、write concern、read preference 决定确认与陈旧读语义。读 secondary 可能看到旧数据，写后读场景必须明确一致性要求。复制不是备份，误删会同步到副本。

分片键决定数据分布、路由和热点，选错后代价很高。单调递增键可能把写集中到一个 chunk；低基数键分布不足；不含 shard key 的查询会 scatter-gather。引入 sharding 前先证明单副本集已成为瓶颈，并用生产查询验证候选键。

Change Streams 可驱动搜索索引/缓存同步，但消费者仍会重连和重复处理，需要 resume token、幂等和积压监控。

## 十一、备份、迁移与可观测性

备份需要恢复演练、时间点恢复目标和加密/访问控制。schema 演进采用文档 `schemaVersion`、兼容读和后台批量迁移，控制批次避免压垮主库；迁移完成再收紧 validator。

监控慢查询、扫描/返回比、working set、cache eviction、连接、复制延迟、oplog 窗口、锁/事务、磁盘与 chunk balance。应用 trace 保存 collection/operation 和耗时，不能记录完整敏感查询或文档。

## 十二、常见坑补充

- **把 schema 灵活理解为无需迁移**：旧文档缺字段，应用升级后批量报错。
- **复制集等同备份**：误删和坏数据会被快速复制。
- **所有数据都嵌入一个文档**：无界增长、热点更新和 16 MiB 上限。
- **无 shard key 查询**：扩容后每次请求广播到所有分片。
- **读 secondary 当强一致读**：用户刚保存却看不到新数据。
- **双写 MySQL/Mongo**：任一边失败造成漂移，应使用 outbox/CDC 与对账。

## 十三、选型决策清单

- [ ] 访问是否以聚合文档为中心，还是关系/约束/跨实体查询更重要？
- [ ] 嵌入数据是否有界且同生命周期，引用是否有索引和一致性策略？
- [ ] schema validator、schemaVersion、兼容读与迁移是否设计？
- [ ] query/sort/aggregate 是否用真实数据 `explain` 并评估索引写成本？
- [ ] read/write concern 是否符合写后读、故障和延迟目标？
- [ ] 是否真的需要分片，候选 shard key 会不会热点或 scatter-gather？
- [ ] 备份、恢复、误删、复制延迟和 change stream 重放是否演练？
- [ ] 引入 MongoDB 相比现有 MySQL 的收益是否大于新增运维与一致性成本？

## 十四、小结

- NoSQL 四类：文档/MongoDB、KV/Redis、列族/Cassandra、图/Neo4j，按访问模式选。
- MongoDB 弱 schema、嵌套友好；强一致/复杂关联仍用 MySQL。
- 索引最左前缀、聚合管道做 GROUP BY；内容类数据适合它。

## 参考来源

- MongoDB 文档：<https://www.mongodb.com/docs/>
- MongoDB 聚合管道：<https://www.mongodb.com/docs/manual/aggregation/>
- MongoDB Data Modeling：<https://www.mongodb.com/docs/manual/data-modeling/>
- MongoDB Sharding：<https://www.mongodb.com/docs/manual/sharding/>
