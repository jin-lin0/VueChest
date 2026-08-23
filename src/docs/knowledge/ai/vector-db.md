---
group: RAG 与检索
order: 40
---

# 向量数据库对比实测

> 适用场景：RAG / 语义检索选型。本文对比 Chroma / Qdrant / pgvector 的定位、插入/检索基准与选型建议。
> 阅读前提：了解 RAG 流程（见 `rag`）、embedding（见 `rag` 的 BGE-M3）。

向量数据库负责「把文本变成向量后存起来，并按相似度检索」。选型直接影响 RAG 的召回质量、延迟与运维成本。

## 一、三者定位

| 数据库       | 形态                                            | 适合                                         | 上手成本        |
| ------------ | ----------------------------------------------- | -------------------------------------------- | --------------- |
| **Chroma**   | 轻量、可嵌入（Python/JS SDK，内存或本地持久化） | 原型、单机、中小规模、快速验证               | 极低            |
| **Qdrant**   | 独立服务（Rust，Docker 部署，gRPC/REST）        | 生产、高并发、需过滤/量化/扩展               | 中              |
| **pgvector** | PostgreSQL 扩展                                 | 已有 PG、要「关系数据 + 向量」一体、事务一致 | 低（若已用 PG） |

> 没有「最好」，只有「最合适」：**原型用 Chroma，生产独立服务用 Qdrant，已有 PG 且不想多维护一套用 pgvector**。

## 二、Chroma（最快起步）

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

> VueChest 的 `rag.md` 示例就用 Chroma + BGE-M3，适合本地验证。缺点：大规模与高并发下不如独立服务。

## 三、Qdrant（生产向）

```python
from qdrant_client import QdrantClient, models

client = QdrantClient("localhost", port=6333)
client.recreate_collection(
    "docs",
    vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE),
)
client.upsert("docs", points=[
    models.PointStruct(id=1, vector=[...], payload={"text": "..."}),
])
hits = client.search("docs", query_vector=[...], limit=5,
                     query_filter=models.Filter(...))  # 支持 payload 过滤
```

> 亮点：**payload 过滤**（检索时按元数据筛，如「只搜某用户文档」）、量化压缩、横向扩展。适合需要过滤 + 高 QPS 的生产 RAG。

## 四、pgvector（复用现有 PG）

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

> 优势：**向量与业务数据同库同事务**，不用同步两套存储；还能用 SQL 做混合检索（向量 + 结构化条件）。代价：超大规模下调优比专用向量库麻烦。

## 五、基准关注点（别只看「快」）

实测时要固定变量，否则数字无意义：

- **数据集**：文档数量（1万 / 10万 / 100万）、维度（768 / 1024 / 1536）。
- **指标**：插入吞吐（docs/s）、查询 P99 延迟、召回率（@k 是否真 relevant）、内存占用。
- **检索方式**：暴力（准确但慢）vs 近似（ANN，快但略损召回）——生产几乎都开 ANN（HNSW/IVF）。
- **过滤影响**：带 payload 过滤时，ANN 召回可能下降，要测真实查询形态。

> 经验：**召回率 > 延迟**。先用真实数据 + RAGAS（见 `rag-evaluation`）测召回，再谈优化延迟。盲目追 QPS 却召回差，RAG 答案就是错的。

## 六、选型决策树

```
已有 PostgreSQL 且数据量中等？ ──是──> pgvector（复用、一致性强）
        │否
需要高并发 + 元数据过滤 + 易扩展？ ──是──> Qdrant
        │否
只想快速验证 RAG 效果 / 单机原型？ ──是──> Chroma
```

> 也可演进：先 Chroma 验证 → 业务起来后迁 Qdrant/pgvector。文档与 embedding 解耦（见 `rag`），迁移成本低。

## 参考来源

- Chroma 文档：<https://docs.trychroma.com/>
- Qdrant 文档：<https://qdrant.tech/documentation/>
- pgvector：<https://github.com/pgvector/pgvector>
- 向量检索基准（ANN-Benchmarks）：<https://github.com/erikbern/ann-benchmarks>
- 相似度度量（余弦/内积）：<https://www.sbert.net/docs/usage/semantic-search.html>
