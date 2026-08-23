---
group: RAG 与检索
order: 40
---

# 向量数据库选型与基准

> 适用场景：RAG / 语义检索选型。本文对比 Chroma / Qdrant / pgvector 的定位，讲清距离、ANN、过滤、数据治理与可复现基准。没有真实数据就不宣称“实测谁更快”。
> 阅读前提：了解 RAG 流程（见 `rag`）、embedding（见 `rag` 的 BGE-M3）。

Embedding 模型负责“把内容变成向量”，向量数据库负责存储向量、元数据并执行相似度检索。数据库不会自动理解文本；模型、归一化方式、距离函数、索引参数和过滤共同决定召回质量。

## 一、先理解距离与 ANN

- **Cosine similarity** 比较方向，常用于已归一化文本向量。
- **Inner product** 受方向与长度共同影响；某些模型明确按点积训练。
- **L2 distance** 比较欧氏距离，适合模型文档要求的场景。
- **Exact search** 扫描全部候选，召回准确但规模增大后昂贵。
- **ANN** 用 HNSW、IVF 等索引换取低延迟，代价是参数、内存与可能的召回损失。

距离必须跟 embedding 模型建议一致。更换模型、维度或归一化方式时，旧向量通常需要整体重建；不能仅把新旧向量塞进同一 collection。

## 二、三者定位

| 数据库       | 形态                                            | 适合                                         | 上手成本        |
| ------------ | ----------------------------------------------- | -------------------------------------------- | --------------- |
| **Chroma**   | 轻量、可嵌入（Python/JS SDK，内存或本地持久化） | 原型、单机、中小规模、快速验证               | 极低            |
| **Qdrant**   | 独立服务（Rust，Docker 部署，gRPC/REST）        | 生产、高并发、需过滤/量化/扩展               | 中              |
| **pgvector** | PostgreSQL 扩展                                 | 已有 PG、要「关系数据 + 向量」一体、事务一致 | 低（若已用 PG） |

这只是起始假设，不是固定结论。Chroma 也有服务化能力，pgvector 可以承载严肃生产，Qdrant 也能单机起步；最终取决于数据规模、过滤、可用性、备份与团队运维能力。

## 三、Chroma（快速起步）

```python
import chromadb
from chromadb.utils import embedding_functions

client = chromadb.Client()
coll = client.create_collection(
    "docs",
    embedding_function=embedding_functions.DefaultEmbeddingFunction(),
)
coll.add(ids=["1","2"], documents=["Vue Router 过渡坑", "Pinia 持久化"])
# 相似度检索
hits = coll.query(query_texts=["router 动画白屏"], n_results=1)
print(hits["documents"])
```

Chroma 适合低门槛验证数据建模与 RAG 链路。是否满足规模与并发不能仅凭产品类型判断，应使用真实过滤条件和部署形态压测。

## 四、Qdrant（独立向量服务）

```python
from qdrant_client import QdrantClient, models

client = QdrantClient("localhost", port=6333)
client.create_collection(
    collection_name="docs",
    vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE),
)
client.upsert(collection_name="docs", points=[
    models.PointStruct(id=1, vector=[...], payload={"text": "..."}),
])
hits = client.query_points(
    collection_name="docs",
    query=[...],
    limit=5,
    query_filter=models.Filter(...),  # 按租户、权限、文档类型过滤
)
```

Qdrant 支持 payload 过滤、量化、分片/复制等能力。生产设计仍要验证过滤字段索引、写入一致性、备份恢复和滚动升级；“支持横向扩展”不代表打开开关后所有查询都会线性加速。

## 五、pgvector（复用 PostgreSQL）

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE docs (id serial PRIMARY KEY, text text, embedding vector(1024));
-- 近似检索（HNSW 索引）
CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops);
```

```python
# 用 SQL 查最近邻
cur.execute(
  "SELECT text FROM docs ORDER BY embedding <=> %s::vector LIMIT 5",
  (query_vec,),
)
```

优势是向量与关系数据能使用 PostgreSQL 的事务、权限和 SQL 生态，还可组合全文与结构化过滤。代价不是简单的“规模大就不行”，而是索引构建、查询规划、连接池、VACUUM、复制和资源隔离都要纳入既有数据库运维。

## 六、数据模型与权限边界

每个 chunk 至少保留：稳定 chunk ID、document ID、tenant/ACL、原文、来源位置、内容哈希、embedding model/version、索引时间和删除状态。写入流程要幂等：相同内容哈希不重复嵌入，文档更新能找到并删除旧 chunk。

多租户过滤必须在数据库查询层强制应用，不能先全库近邻搜索再由 LLM“不要引用别人的数据”。高基数 ACL 可能影响 ANN 行为，应分别压测 pre-filter、post-filter 或按租户分 collection 的成本。

删除还要覆盖缓存、备份保留策略和派生索引。若用户要求删除原文，却仍在向量库里留下可检索 embedding，就不能视为完整删除。

## 七、基准关注点（别只看“快”）

实测时要固定变量，否则数字无意义：

- **数据集**：文档数量（1万 / 10万 / 100万）、维度（768 / 1024 / 1536）。
- **指标**：插入吞吐（docs/s）、查询 P99 延迟、召回率（@k 是否真 relevant）、内存占用。
- **检索方式**：暴力（准确但慢）vs 近似（ANN，快但略损召回）——生产几乎都开 ANN（HNSW/IVF）。
- **过滤影响**：候选集大小、选择性和过滤实现会影响召回与延迟，要测真实查询形态。
- **并发模型**：固定并发、QPS、连接复用、冷/热缓存和写读比例，报告 P50/P95/P99。
- **可靠性**：节点故障、索引重建、备份恢复期间的可用性和数据丢失边界。

先定义质量与延迟 SLO，再比较满足最低召回后的成本。召回、延迟和资源是约束关系，不应把其中任何一项绝对化。检索层优先用带相关文档标注的 Recall@k、MRR、nDCG 等确定性指标，生成质量再接 `rag-evaluation.md` 的完整闭环。

## 八、可复现基准框架

基准必须把查询、过滤和相关性标注固化，避免每次手工挑几个“看起来不错”的例子：

```python
from time import perf_counter

def run_benchmark(store, cases, k=10):
    rows = []
    for case in cases:
        started = perf_counter()
        hits = store.search(
            vector=case.query_vector,
            filters=case.filters,
            limit=k,
        )
        latency_ms = (perf_counter() - started) * 1000
        hit_ids = [item.id for item in hits]
        rows.append({
            "latency_ms": latency_ms,
            "recall_at_k": recall_at_k(hit_ids, case.relevant_ids, k),
        })
    return summarize_percentiles(rows)
```

在同一硬件、数据快照、索引参数和 embedding 下分别测 exact 与 ANN，可估算索引造成的召回损失。改变 HNSW 搜索参数时同时画 recall-latency 曲线，而不是只保留最快的一个数字。

## 九、选型决策树

```
已有 PostgreSQL 且数据量中等？ ──是──> pgvector（复用、一致性强）
        │否
需要高并发 + 元数据过滤 + 易扩展？ ──是──> Qdrant
        │否
只想快速验证 RAG 效果 / 单机原型？ ──是──> Chroma
```

可以先用 Chroma 验证，再迁 Qdrant/pgvector，但迁移成本取决于是否保留原文、模型版本和可重放索引流水线。不要把某数据库生成的内部 ID 当业务主键，也不要让检索调用散落在业务代码中。

## 十、备份、迁移与可观测性

- 备份必须验证恢复，而不是只验证文件存在；记录数据与索引是否需要分别恢复。
- collection/schema 变更采用新索引并行构建、影子查询、切流和延迟删除旧索引。
- 指标包含写入积压、索引构建进度、过滤命中、空结果率、候选数、P95/P99、错误率和资源水位。
- trace 保存 query 版本、过滤摘要、召回 ID/分数和 reranker 版本，但对文本与身份信息脱敏。
- embedding 服务不可用时进入队列或显式失败，不能悄悄用零向量写入。

## 十一、常见坑与上线检查清单

常见坑包括：距离函数与模型不匹配；不同模型向量混在一个索引；用随机向量压测却推断真实过滤性能；只看 P50；租户过滤在检索后才做；文档更新只新增不删除；备份无法恢复；把相似度分数跨模型解释成统一置信度。

- [ ] embedding 模型、版本、维度、归一化和距离是否成套记录？
- [ ] chunk/document ID 是否稳定，更新、删除和重建是否可重放？
- [ ] ACL 是否在查询层强制执行，并覆盖缓存与 reranker？
- [ ] 是否用真实数据、相关性标注、过滤和并发测 Recall@k 与 P99？
- [ ] 是否比较 exact/ANN 并记录完整索引参数？
- [ ] 是否演练节点故障、备份恢复、新旧索引切换和回滚？
- [ ] 数据库 SDK 是否封装在 adapter 中，避免供应商锁定扩散？

## 参考来源

- Chroma 文档：<https://docs.trychroma.com/>
- Qdrant 文档：<https://qdrant.tech/documentation/>
- pgvector：<https://github.com/pgvector/pgvector>
- 向量检索基准（ANN-Benchmarks）：<https://github.com/erikbern/ann-benchmarks>
- Sentence Transformers 语义搜索：<https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html>
