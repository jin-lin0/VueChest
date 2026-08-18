---
group: 后端与基础设施
order: 57
---

# Elasticsearch 与搜索实战

> 站内搜索、日志检索、商品检索，MySQL 的 `LIKE` 撑不住时，Elasticsearch（ES）是事实标准。本文讲清倒排索引、分词、查询 DSL、聚合，以及与 MySQL 全文检索的取舍，补搜索架构视角（配合 `mysql-optimization.md`）。

## 一、ES 是什么

Elasticsearch 是基于 **Lucene** 的分布式搜索引擎：近实时、水平扩展、RESTful。核心不是"数据库"而是"搜索引擎"——为**全文检索 + 聚合分析**优化。

## 二、核心概念

| 概念 | 对应关系型 |
| --- | --- |
| **Index** | 库（一类文档集合） |
| **Document** | 行（JSON） |
| **Field** | 列 |
| **Mapping** | 表结构/类型 |
| **Shard** | 分片（数据水平拆分） |

## 三、倒排索引（搜索的根）

- 正排：文档 → 包含的词。
- **倒排**：词 → 出现在哪些文档（及位置/频率）。查询"手机"时直接定位包含它的文档列表，毫秒级。
- 查询流程：分词 → 查倒排 → 算分（TF-IDF / BM25）→ 按相关度排序返回。

## 四、分词（Analyzer）

中文必须分词，否则"商品标题"会被切成单字，召回与精度都差。

```json
{
  "analyzer": "ik_max_word",   // IK 中文分词
  "text": "小米手机官方旗舰店"
}
// → 小米 / 手机 / 官方 / 旗舰店 ...
```

- 内置 `standard` 对中文不友好；中文用 `IK`、`jieba` 等插件。
- 索引时分词与查询时分词需一致，否则匹配不上。

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

- `match` 全文（算分）；`term` 精确（不分词）；`filter` 不参与算分、可缓存；`aggs` 做聚合（分组统计）。

## 六、与 MySQL 全文检索对比

| 维度 | MySQL `FULLTEXT` | Elasticsearch |
| --- | --- | --- |
| 中文分词 | 弱（ngram 凑合） | 强（IK 等） |
| 大规模 | 慢、难扩展 | 分布式、水平扩展 |
| 聚合分析 | 一般 | 强 |
| 运维成本 | 低 | 高（集群） |
| 事务 | 有 | 无（最终一致） |

> 取舍：简单站内搜、数据量小 → MySQL 全文够用；复杂搜索、海量日志/商品 → ES。常见架构：MySQL 为源，Binlog 同步到 ES 供检索（见 `message-queue.md` 的 CDC 思路）。

## 七、与 VueChest 的衔接

- 市场 app / 文档搜索可用 ES 提供"按名称/标签/描述"的模糊检索，替代 `LIKE`。
- 数据同步：app 上下架时写 ES（或经消息队列异步同步），保证检索与源一致。
- 前端把查询词 + 筛选项发给搜索 API，拿到 ES 结果渲染（见 `http-network.md`）。

## 八、常见坑

- ** mapping 一旦建错难改**：类型/分词器在创建时定好，改需重建索引 + reindex。
- **深分页 `from+size` 慢**：用 `search_after` 游标（类似 MySQL 深分页，见 `mysql-optimization.md`）。
- **分词不一致**：索引/查询 analyzer 不同 → 诡异无结果。
- **集群资源**：ES 吃内存（JVM heap），小项目上云托管更省心。

## 九、小结

- ES = 倒排索引 + 分布式；中文靠 IK 分词。
- DSL：`bool`(must/filter) + `aggs`；filter 可缓存不评分。
- 与 MySQL 取舍在"检索强度/规模/运维成本"；常见 MySQL 源 + 同步 ES 检索。

## 参考来源

- Elasticsearch 官方文档：<https://www.elastic.co/guide/index.html>
- IK 中文分词插件：<https://github.com/infinilabs/analysis-ik>
- ES 权威指南（中文）：<https://www.elastic.co/guide/cn/elasticsearch/guide/current/index.html>
