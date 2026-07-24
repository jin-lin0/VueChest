# RAG 检索增强生成实战

RAG（Retrieval-Augmented Generation，检索增强生成）是当前构建「懂私有知识」的大模型应用最核心的工程范式。本文从原理到流水线，再到可运行的 Python 代码，带你完整落地一个中文 RAG 系统。

## 一、RAG 是什么

大模型（LLM）本身有三个天然短板：

- **知识过时**：训练数据有截止日期，无法知道最新业务。
- **幻觉**：对不知道的内容会「自信地编造」。
- **私有数据不可用**：企业内部文档、个人笔记无法进入模型权重。

RAG 的解法很直接：**先检索、再生成**。在回答用户问题前，先从外部知识库里找出最相关的片段，把这些片段作为上下文拼进 prompt，让模型「带着资料答题」。模型从「凭记忆答」变成「凭资料答」， hallucination 大幅降低。

```
用户问题 ──▶ 检索相关文档 ──▶ 拼装 Prompt(上下文+问题) ──▶ LLM 生成答案
```

## 二、整体流水线

一个标准 RAG 系统由以下阶段串成：

| 阶段 | 作用 | 关键产出 |
| --- | --- | --- |
| 文档加载 | 读取 PDF/Markdown/网页/数据库 | 原始文本 |
| 切分 Chunking | 长文切成语义完整的片段 | chunks |
| 向量化 Embedding | 每段文本转成高维向量 | vectors |
| 存入向量库 | 持久化向量与原文 | 向量索引 |
| 查询检索 | 用问题向量召回 top-k 片段 | candidates |
| 拼装 Prompt | 上下文 + 问题 + 约束 | prompt |
| 生成 | LLM 基于上下文作答 | 最终答案 |

> 离线阶段（加载→入库）只做一次；在线阶段（查询→生成）每次请求执行。

## 三、文档切分策略

切分质量直接决定检索精度。切太大噪声多、超窗口；切太小丢上下文、易断章取义。

### 1. 固定长度 vs 语义切分

- **固定长度（Fixed-size）**：按固定字符数滑动窗口切。简单但不顾语义，常在句子中间截断。
- **递归字符（RecursiveCharacterTextSplitter）**：LangChain 默认推荐，按 `\n\n` → `\n` → 空格 顺序递归切，尽量保住段落/句子完整。
- **语义切分（Semantic）**：用 embedding 计算相邻句相似度，相似度骤降处（话题切换）切分，块内主题最纯，但成本高。
- **父子索引（Parent-Child / Small-to-Big）**：小块用于检索、大块喂给 LLM，兼顾「精准召回」与「完整上下文」，是效果提升大杀器。

### 2. chunk size / overlap 权衡

- `chunk_size`：通用问答 800–1200 字符较稳；中文建议 256–512 token。
- `chunk_overlap`：设成 `chunk_size` 的 10%–20%，防止关键词被「腰斩」。

### 3. 标题/Markdown 感知切分（推荐用于技术文档）

```python
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)

# 中文友好的递归切分：把句号、逗号也作为分隔候选
splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=80,
    separators=["\n\n", "\n", "。", "！", "？", ".", " ", ""],
    is_separator_regex=False,
)

# Markdown 按标题切分，标题作为元数据保留
md_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")]
)
docs = md_splitter.split_text(markdown_text)
for d in docs:
    print(d.metadata, d.page_content[:50])
```

## 四、Embedding 模型

embedding 把文本映射为定长向量，是「语义」的数学表示。中文场景优先选中文优化模型。

| 模型 | 维度 | 最大 Token | 语言 | 说明 |
| --- | --- | --- | --- | --- |
| BAAI/bge-m3 | 1024 | 8192 | 多语言 | 开源最强，支持稠密+稀疏+多向量混合检索 |
| BAAI/bge-large-zh | 1024 | 512 | 中文 | 中文表现优秀，轻量 |
| moka-ai/m3e-base | 768 | 512 | 中文 | 专为中文优化，CPU 可跑 |
| text-embedding-3-small | 1536 | 8191 | 多语言 | OpenAI，性价比高，需 API |

> 注意：BGE/M3E 最大仅 512 token，切分超过会截断；BGE-M3 支持 8K。务必让 `chunk_size` 落在模型上限内。

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-m3")
vecs = model.encode(
    ["RAG 检索增强生成", "向量数据库 Qdrant"],
    normalize_embeddings=True,   # L2 归一化，点积即余弦相似度
    batch_size=32,
)
print(len(vecs[0]))  # 1024
```

## 五、向量数据库选型

| 数据库 | 部署方式 | 特点 | 适用场景 |
| --- | --- | --- | --- |
| FAISS | 本地库 | 纯索引引擎，极快，无服务 | 单机原型、科研 |
| Chroma | 嵌入式/服务 | API 简单，开箱即用 | 快速落地 RAG |
| Qdrant | 服务/云 | 过滤强、性能高 | 生产级、大规模 |
| pgvector | Postgres 扩展 | 复用现有数据库与事务 | 已有 PG 栈的团队 |

> 本文示例用 Chroma：内存模式调试、PersistentClient 落盘、HttpClient 接入独立服务。

## 六、检索增强

### 1. top-k 与相似度度量

- 用**余弦相似度**（向量归一化后等价点积）。Chroma 建集合时设 `metadata={"hnsw:space": "cosine"}`。
- `top_k` 先粗召回 10–20 条，再精排取 3–5 条喂给 LLM。

### 2. 混合检索（BM25 + 向量）

纯向量检索会漏掉精确关键词（如产品型号、错误码）。BM25 补关键词召回，再用 **RRF（Reciprocal Rank Fusion）** 融合两路排名：

```python
import numpy as np
from rank_bm25 import BM25Okapi

def rrf_fuse(dense_ranks, bm25_ranks, k=60):
    scores = {}
    for r, idx in enumerate(dense_ranks):
        scores[idx] = scores.get(idx, 0) + 1.0 / (k + r + 1)
    for r, idx in enumerate(bm25_ranks):
        scores[idx] = scores.get(idx, 0) + 1.0 / (k + r + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

### 3. 重排 Rerank（Cross-Encoder）

粗召回后，用 cross-encoder 把「query + doc」拼在一起打分，精度远高于双塔向量。中文首选 `BAAI/bge-reranker-v2-m3`。

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

def rerank(query: str, docs: list, top_k: int = 3) -> list:
    pairs = [[query, d] for d in docs]
    scores = reranker.predict(pairs)          # 返回相关性分数列表
    ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
    return [d for d, _ in ranked[:top_k]]
```

## 七、拼装 Prompt

把召回片段拼进上下文，并加约束：基于资料作答、引用来源、不编造。

```
你是一个严谨的助手。请仅根据下面的【参考资料】回答问题。
如果资料中没有答案，请明确说「资料中未提及」，不要编造。

【参考资料】
1. <chunk 1>   来源: faq.md#计费
2. <chunk 2>   来源: manual.pdf p.12

【用户问题】
{query}

请引用所用资料的编号（如 [1]）来支持你的回答。
```

**防注入**：用户问题可能含「忽略以上指令」。缓解手段：把检索内容放在独立隔离区、对用户输入做转义/长度限制、用系统提示明确优先级、必要时对召回文本做敏感词过滤。

## 八、评估与优化

| 指标 | 含义 | 怎么看 |
| --- | --- | --- |
| 召回率 | 相关问题是否被正确检索到 | 检索不到 → 调大 top-k / 换 embedding / 优化切分 |
| 回答相关性 | 答案是否切题、有依据 | 答非所问 → 加 rerank、精简上下文 |
| 忠实度 | 是否编造资料外内容 | 有幻觉 → 强化 prompt 约束、降噪声 |

常见问题与对策：

- **检索不到**：chunk 太大稀释主题 → 减小 size；embedding 不匹配中文 → 换 BGE/M3E；关键词被切坏 → 加 BM25 混合检索。
- **噪声多**：召回 top-k 过大 → 用 rerank 压到 3–5 条；overlap 过高 → 降到 10%–15%。
- **上下文超窗口**：父子索引——小块检索、大块入模；或对超长块再做摘要。

## 九、最小可运行示例（Chroma + sentence-transformers）

完整可跑的端到端 demo（中文、本地、无需 OpenAI 也可完成检索阶段）：

```bash
pip install chromadb sentence-transformers rank_bm25 openai
```

```python
import chromadb
from sentence_transformers import SentenceTransformer, CrossEncoder
from rank_bm25 import BM25Okapi

# ---------- 1. 准备知识库 ----------
raw_docs = [
    "RAG 是检索增强生成，先检索再生成以降低幻觉。",
    "Chroma 是开源向量数据库，适合快速构建 RAG。",
    "BGE-M3 是开源中文友好的 embedding 与 rerank 模型。",
    "混合检索结合 BM25 与向量，提升关键词召回。",
    "chunk_size 建议 256-512 token，overlap 取 10%-20%。",
]

# ---------- 2. 切分（这里按句子简单切，生产用第三节策略）----------
chunks = [d for doc in raw_docs for d in doc.split("。") if d.strip()]
chunks = [c + "。" for c in chunks]

# ---------- 3. 向量化 + 入库 ----------
embed_model = SentenceTransformer("BAAI/bge-m3")
collection = chromadb.Client().create_collection(
    name="kb_demo", metadata={"hnsw:space": "cosine"}
)
embeddings = embed_model.encode(chunks, normalize_embeddings=True).tolist()
collection.add(
    documents=chunks,
    embeddings=embeddings,
    ids=[str(i) for i in range(len(chunks))],
)

# ---------- 4. 混合检索（向量 + BM25）----------
bm25 = BM25Okapi([c.split() for c in chunks])

def retrieve(query: str, top_k: int = 5):
    q_vec = embed_model.encode([query], normalize_embeddings=True).tolist()[0]
    v_res = collection.query(query_embeddings=[q_vec], n_results=top_k)
    v_idx = [int(i) for i in v_res["ids"][0]]
    b_scores = bm25.get_scores(query.split())
    b_idx = list(np.argsort(-b_scores)[:top_k])
    fused = rrf_fuse(v_idx, b_idx)  # 见第六节 rrf_fuse
    return [chunks[i] for i, _ in fused[:top_k]]

# ---------- 5. Rerank 精排 ----------
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

def answer(query: str, client):
    cands = retrieve(query, top_k=5)
    final = rerank(query, cands, top_k=3)  # 见第六节 rerank
    context = "\n".join(f"{i+1}. {t}" for i, t in enumerate(final))
    prompt = f"参考资料:\n{context}\n\n问题: {query}\n请基于资料作答，并标注引用编号。"
    # 接 LLM（此处以 OpenAI 为例）
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content

# query = "RAG 怎么降低幻觉？"
# print(answer(query, openai_client))
```

把 `rrf_fuse` 与 `rerank` 直接贴上即可运行。若要彻底离线，可把生成环节换成本地模型（如 Ollama），检索与 rerank 部分已完全本地化。

## 小结

RAG = **切分 → 向量化 → 入库 → 混合检索 → 重排 → 带上下文生成**。中文场景优先 `BGE-M3` + `Chroma` + `bge-reranker-v2-m3`，chunk 控制在 256–512 token、overlap 10%–20%，并用 BM25 补关键词召回、cross-encoder 精排，可显著提升召回率与答案忠实度。
