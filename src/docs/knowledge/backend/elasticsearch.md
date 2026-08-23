---
group: 消息与搜索
order: 2
---

# Elasticsearch 与搜索实战

> Elasticsearch 适合相关性搜索、复杂过滤/聚合和日志分析，但会带来索引同步、集群与相关性治理成本。本文讲清倒排索引、mapping、分析器、查询 DSL、重建索引与源数据库同步。

## 一、ES 是什么

Elasticsearch 是基于 **Lucene** 的分布式搜索引擎：近实时、水平扩展、RESTful。核心不是"数据库"而是"搜索引擎"——为**全文检索 + 聚合分析**优化。

## 二、核心概念

| 概念         | 对应关系型                    |
| ------------ | ----------------------------- |
| **Index**    | 一组 mapping 相容的文档与分片 |
| **Document** | 行（JSON）                    |
| **Field**    | 列                            |
| **Mapping**  | 表结构/类型                   |
| **Shard**    | 分片（数据水平拆分）          |

## 三、倒排索引（搜索的根）

- 正排：文档 → 包含的词。
- **倒排**：词 → 出现在哪些文档（及位置/频率）。查询"手机"时直接定位包含它的文档列表，毫秒级。
- 查询流程：分词 → 查倒排 → 算分（TF-IDF / BM25）→ 按相关度排序返回。

## 四、分词（Analyzer）

中文搜索通常需要为业务选择合适的 analyzer、词典或 n-gram 策略。默认分析方式的效果要通过 `_analyze` 和标注查询评估，不能只凭“中文必须装某插件”决定。

```json
POST /products/_analyze
{
  "analyzer": "ik_max_word",
  "text": "小米手机官方旗舰店"
}
```

- IK、jieba 等属于插件/生态方案，必须与 Elasticsearch 版本兼容并纳入升级测试。
- index analyzer 与 search analyzer 可以故意不同，例如索引侧扩展召回、查询侧更保守；关键是产生的 token 能匹配，并通过真实 query set 验证。
- 标识符、标签、状态通常使用 `keyword`；标题/正文使用 `text`，常通过 multi-field 同时支持全文与精确排序/聚合。

## 五、查询 DSL 示例

```json
GET /products/_search
{
  "query": {
    "bool": {
      "must":   [{ "match": { "title": "手机" } }],
      "filter": [{ "range": { "price": { "gte": 1000 } } }]
    }
  },
  "sort": [{ "_score": "desc" }],
  "aggs": { "brands": { "terms": { "field": "brand" } } }
}
```

- `match` 会分析查询文本并参与相关性；`term` 不分析输入，通常用于 `keyword`、数值等精确值；filter 不参与评分且可能被缓存；aggs 做聚合。不要在 analyzed `text` 上直接 terms aggregation，通常使用其 keyword 子字段。

## 六、与 MySQL 全文检索对比

| 维度     | MySQL `FULLTEXT`    | Elasticsearch              |
| -------- | ------------------- | -------------------------- |
| 中文分词 | 能力受版本/配置影响 | 分析器与插件选择丰富       |
| 扩展     | 依赖单库/复制架构   | 原生分片与副本，但运维复杂 |
| 聚合分析 | 一般                | 强                         |
| 运维成本 | 低                  | 高（集群）                 |
| 事务     | 有                  | 无（最终一致）             |

> 简单搜索先评估数据库全文或专用托管搜索；需要复杂相关性、聚合与独立扩展时再引入 ES。数据量不是唯一标准，团队能力、SLO、同步一致性和成本同样重要。

## 七、与 VueChest 的衔接

- 市场 app / 文档搜索可用 ES 提供"按名称/标签/描述"的模糊检索，替代 `LIKE`。
- 数据同步：以 MySQL 为权威源，通过 outbox/CDC 异步更新 ES，并接受明确的索引延迟；应用层直接双写不能保证两边一致。
- 前端把查询词 + 筛选项发给搜索 API，拿到 ES 结果渲染（见 `http-network.md`）。

## 八、常见坑

- ** mapping 一旦建错难改**：类型/分词器在创建时定好，改需重建索引 + reindex。
- **深分页 `from+size` 慢**：用 `search_after` 游标（类似 MySQL 深分页，见 `mysql-optimization.md`）。
- **分词不一致**：索引/查询 analyzer 不同 → 诡异无结果。
- **集群资源**：ES 吃内存（JVM heap），小项目上云托管更省心。

## 九、Mapping 与索引生命周期

生产创建 explicit mapping，限制动态字段。任意 JSON key 被动态映射会造成 mapping explosion、cluster state 膨胀；未知属性可放受控 flattened/object 结构，或先在摄取层白名单化。

大多数 analyzer、字段类型和主分片布局变更需要新建索引重灌。标准流程是：

1. 创建 `products_v3`，写入新 mapping/settings。
2. 从权威数据源全量回填，期间 CDC/outbox 继续增量追平。
3. 对新旧索引做影子查询，比较文档数、延迟和 relevance。
4. 原子切换读/写 alias 到 v3，观察后再删除 v2。

alias 让应用不依赖物理索引名，也是快速切回的边界。但若新版本已产生旧 schema 无法理解的写，回滚仍需兼容设计。

日志/时序索引使用 data streams/ILM 管理 rollover、冷热层和删除，不能让单索引无限增长。删除索引前确认合规保留、快照与恢复需求。

## 十、分片、刷新与容量

分片过多会增加 heap、文件句柄和 cluster state，分片过大又会拖慢恢复与迁移。按数据量、保留期、查询并发、节点数和恢复目标压测；不要沿用“每索引固定 N 个 shard”的旧经验。

文档写入到可搜索存在 refresh 延迟。强制每次 refresh 会降低吞吐；`refresh=wait_for` 也增加写延迟，只在确有写后搜需求的路径使用。业务写成功但暂时搜不到应有明确 UX，而不是把 ES 当事务数据库。

bulk 能提高摄取吞吐，但批次过大会放大内存与重试。对 429 做有界退避，按 item 检查部分失败；不能只看 bulk HTTP 200。副本提升读取/可用性但增加写与存储，跨可用区还要评估网络。

## 十一、相关性与分页

相关性不是“BM25 默认就好”。维护真实 query set、相关文档等级和业务切片，评估 Recall@k、MRR/nDCG、零结果率、点击/转化与人工判断。词典、同义词、boost、function score 和 reranker 每次变化都做离线回归与线上灰度。

深分页使用 `search_after` 时排序键必须稳定且包含唯一 tie-breaker；需要跨多次请求保持一致视图时评估 point in time（PIT）。高亮、聚合和 wildcard/regexp 都可能昂贵，对用户输入限制长度、字段和结果窗口。

## 十二、安全、同步与可观测性

ES 不应直接暴露给浏览器。搜索 API 在服务端应用租户/ACL 过滤、字段白名单和查询复杂度限制。检索后再过滤会泄露分数、聚合或高亮，也浪费候选容量。

同步事件携带 document ID、源版本和 event ID，ES 使用外部版本/条件更新拒绝旧事件覆盖新状态。监控 CDC lag、版本冲突、DLQ、文档数差异并定期对账；修复工具从权威源重建，不反向把 ES 当正确数据回写 MySQL。

集群指标包括 shard allocation、cluster health、JVM/GC、heap、磁盘水位、线程池 rejection、refresh/merge、query/index P95、cache 和 snapshot。慢查询日志需要阈值和脱敏，避免记录用户敏感搜索词。

## 十三、常见坑补充

- **动态字段无限增长**：mapping explosion 影响整个集群稳定性。
- **应用直接双写 DB/ES**：任一边失败后永久漂移且难对账。
- **bulk 返回 200 就认为全成功**：单 item 仍可能 429/映射失败。
- **每次写后强制 refresh**：搜索更及时但吞吐和延迟显著恶化。
- **插件版本未锁定**：ES 升级后 analyzer 无法加载或 token 行为变化。
- **把 `_score` 当业务置信度**：它只在特定查询/索引内相对比较，不能跨查询直接设统一阈值。

## 十四、选型决策清单

- [ ] 数据库全文/托管搜索是否已不能满足相关性、聚合或扩展需求？
- [ ] 权威源、outbox/CDC、版本冲突、对账和全量重建是否设计？
- [ ] mapping、text/keyword、analyzer 与动态字段策略是否通过真实语料验证？
- [ ] shard/replica/refresh/bulk 是否由容量与恢复压测决定？
- [ ] 查询、聚合、分页和高亮是否有复杂度/结果窗口上限？
- [ ] tenant/ACL 是否在 ES query 层强制执行？
- [ ] relevance 是否有固定 query set、人工标注和线上护栏？
- [ ] alias 切换、snapshot 恢复、节点/磁盘故障和插件升级是否演练？

## 十五、小结

- ES = 倒排索引 + 分布式；中文靠 IK 分词。
- DSL：`bool`(must/filter) + `aggs`；filter 可缓存不评分。
- 与 MySQL 取舍在"检索强度/规模/运维成本"；常见 MySQL 源 + 同步 ES 检索。

## 参考来源

- Elasticsearch 官方文档：<https://www.elastic.co/guide/index.html>
- IK 中文分词插件：<https://github.com/infinilabs/analysis-ik>
- Elasticsearch Mapping：<https://www.elastic.co/docs/manage-data/data-store/mapping>
- Elasticsearch Index Lifecycle Management：<https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management>
