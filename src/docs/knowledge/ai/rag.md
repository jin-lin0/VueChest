---
group: RAG 与检索
order: 38
---

# RAG 检索增强生成实战

RAG（Retrieval-Augmented Generation，检索增强生成）把外部证据检索与生成结合，适合需要私有、可更新或可引用知识的应用。本文从摄取、检索、生成、治理到评估建立完整工程模型。

## 一、RAG 是什么

大模型（LLM）本身有三个天然短板：

- **知识过时**：训练数据有截止日期，无法知道最新业务。
- **幻觉**：对不知道的内容会「自信地编造」。
- **私有数据不可用**：企业内部文档、个人笔记无法进入模型权重。

RAG 的基本路径是**先检索、再生成**。在回答前从授权知识库找出相关片段，把证据和来源交给模型。检索正确、上下文充分且生成受约束时可以降低无依据回答；检索错误也可能让答案更自信地错，因此评估不可省。

```
用户问题 ──▶ 检索相关文档 ──▶ 拼装 Prompt(上下文+问题) ──▶ LLM 生成答案
```

## 二、整体流水线

一个标准 RAG 系统由以下阶段串成：

| 阶段             | 作用                          | 关键产出   |
| ---------------- | ----------------------------- | ---------- |
| 文档加载         | 读取 PDF/Markdown/网页/数据库 | 原始文本   |
| 切分 Chunking    | 长文切成语义完整的片段        | chunks     |
| 向量化 Embedding | 每段文本转成高维向量          | vectors    |
| 存入向量库       | 持久化向量与原文              | 向量索引   |
| 查询检索         | 用问题向量召回 top-k 片段     | candidates |
| 拼装 Prompt      | 上下文 + 问题 + 约束          | prompt     |
| 生成             | LLM 基于上下文作答            | 最终答案   |

> 摄取/索引是持续流水线，而非只做一次：文档新增、更新、删除、权限变化和 embedding 升级都要触发可重放的增量或全量重建。

## 三、文档切分策略

切分质量直接决定检索精度。切太大噪声多、超窗口；切太小丢上下文、易断章取义。

### 1. 固定长度 vs 语义切分

- **固定长度（Fixed-size）**：按固定字符数滑动窗口切。简单但不顾语义，常在句子中间截断。
- **递归字符（RecursiveCharacterTextSplitter）**：LangChain 默认推荐，按 `\n\n` → `\n` → 空格 顺序递归切，尽量保住段落/句子完整。
- **语义切分（Semantic）**：用 embedding 计算相邻句相似度，相似度骤降处（话题切换）切分，块内主题最纯，但成本高。
- **父子索引（Parent-Child / Small-to-Big）**：小块用于检索、大块喂给 LLM，兼顾「精准召回」与「完整上下文」，是效果提升大杀器。

### 2. chunk size / overlap 权衡

- `chunk_size` 应从标题/段落等自然边界起步，并受 embedding 上限、问题粒度和生成预算约束。
- `chunk_overlap` 只在跨边界语义确有收益时使用；重叠过多会制造重复召回、膨胀索引和上下文。

不存在通用最佳数值。用同一标注集对不同切分策略测 Recall@k、重复率、上下文 token 与最终答案质量，再按文档类型分别配置。

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

| 模型                   | 维度 | 最大 Token | 语言   | 说明                               |
| ---------------------- | ---- | ---------- | ------ | ---------------------------------- |
| BAAI/bge-m3            | 1024 | 8192       | 多语言 | 文本稠密、稀疏与多向量能力         |
| BAAI/bge-large-zh      | 1024 | 512        | 中文   | 中文文本 embedding 候选            |
| moka-ai/m3e-base       | 768  | 512        | 中文   | 中文文本 embedding 候选            |
| text-embedding-3-small | 1536 | 8191       | 多语言 | 托管 API，版本与价格按官方文档核对 |

> 模型卡参数会随具体 checkpoint 变化。应读取实际 tokenizer 后测截断率，不能仅凭模型家族名推断上限；BGE-M3 文档标注最长 8192 token。

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

| 数据库   | 部署方式      | 特点                     | 适用场景         |
| -------- | ------------- | ------------------------ | ---------------- |
| FAISS    | 本地库        | 纯索引引擎，极快，无服务 | 单机原型、科研   |
| Chroma   | 嵌入式/服务   | API 简单，开箱即用       | 快速落地 RAG     |
| Qdrant   | 服务/云       | 过滤强、性能高           | 生产级、大规模   |
| pgvector | Postgres 扩展 | 复用现有数据库与事务     | 已有 PG 栈的团队 |

> 本文示例用 Chroma：内存模式调试、PersistentClient 落盘、HttpClient 接入独立服务。

## 六、检索增强

### 1. top-k 与相似度度量

- 用**余弦相似度**（向量归一化后等价点积）。Chroma 建集合时设 `metadata={"hnsw:space": "cosine"}`。
- `top_k` 由数据规模、问题类型、过滤选择性、reranker 与上下文预算共同决定，必须通过召回-延迟曲线选择。

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

粗召回后，可用 cross-encoder 联合编码 query 与 doc 重新排序。它通常计算更贵，是否提升质量取决于领域和候选集；`BAAI/bge-reranker-v2-m3` 是可评估的多语言文本候选，不是所有中文场景的固定首选。

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

**防注入**：用户问题和召回文档都可能包含“忽略以上指令”。独立内容块、长度限制和高优先级规则只能降低风险；真正的安全边界是检索 ACL、最小工具权限、服务端授权和高风险动作审批。敏感词过滤不能可靠识别语义注入（见 `agent-security.md`）。

## 八、评估与优化

| 指标       | 含义                     | 怎么看                                          |
| ---------- | ------------------------ | ----------------------------------------------- |
| 召回率     | 相关问题是否被正确检索到 | 检索不到 → 调大 top-k / 换 embedding / 优化切分 |
| 回答相关性 | 答案是否切题、有依据     | 答非所问 → 加 rerank、精简上下文                |
| 忠实度     | 是否编造资料外内容       | 有幻觉 → 强化 prompt 约束、降噪声               |

常见问题与对策：

- **检索不到**：检查权限过滤、索引新鲜度、query 表达、切分和 embedding，再通过混合检索或 query rewrite 做对照实验。
- **噪声多**：测不同 top-k 与 reranker，检查重复 chunk、错误元数据和高重叠，而不是直接套固定数值。
- **上下文超窗口**：父子索引——小块检索、大块入模；或对超长块再做摘要。

## 九、最小可运行示例（Chroma + sentence-transformers）

完整可跑的端到端 demo（中文、本地、无需 OpenAI 也可完成检索阶段）：

```bash
pip install chromadb sentence-transformers rank_bm25 openai
```

```python
import chromadb
import numpy as np
from sentence_transformers import SentenceTransformer, CrossEncoder
from rank_bm25 import BM25Okapi

# ---------- 1. 准备知识库 ----------
raw_docs = [
    "RAG 是检索增强生成，先检索再生成以降低幻觉。",
    "Chroma 是开源向量数据库，适合快速构建 RAG。",
    "BGE-M3 是支持多语言文本的 embedding 模型。",
    "混合检索结合 BM25 与向量，提升关键词召回。",
    "chunk 大小与 overlap 应在真实评估集上调优。",
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

def rrf_fuse(*rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, idx in enumerate(ranking, start=1):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda item: item[1], reverse=True)

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

def rerank(query: str, docs: list[str], top_k: int = 3) -> list[str]:
    scores = reranker.predict([[query, doc] for doc in docs])
    ranked = sorted(zip(docs, scores), key=lambda item: item[1], reverse=True)
    return [doc for doc, _ in ranked[:top_k]]

def answer(query: str, client):
    cands = retrieve(query, top_k=5)
    final = rerank(query, cands, top_k=3)  # 见第六节 rerank
    context = "\n".join(f"{i+1}. {t}" for i, t in enumerate(final))
    prompt = f"参考资料:\n{context}\n\n问题: {query}\n请基于资料作答，并标注引用编号。"
    # 接 LLM（此处以 OpenAI 为例）
    resp = client.chat.completions.create(
        model=MODEL_ID,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content

# query = "RAG 怎么降低幻觉？"
# print(answer(query, openai_client))
```

示例为了聚焦链路，中文 BM25 仍使用了最简单的空格切词；真实中文数据要选合适 tokenizer。运行还需要由调用方提供 `client` 与 `MODEL_ID`，并在生产补上稳定 ID、元数据、ACL、批处理、持久化和错误处理。

## 十、索引治理与新鲜度

每个 chunk 保存稳定 ID、document/version、标题路径、来源位置、内容哈希、tenant/ACL、embedding model/version 和索引时间。摄取流程按内容哈希幂等，文档删除和权限撤销要同步清理向量、全文索引、缓存与对象引用。

升级 embedding 时建立新索引并行回填，用影子查询比较召回，切流后延迟删除旧索引。不要在同一 collection 混用不同维度、归一化或语义空间。线上回答记录知识快照与引用 ID，才能解释“当时为什么这样答”。

## 十一、常见坑

- **把 RAG 当事实保证**：错误或被投毒的检索内容会放大错误。
- **用固定字符切所有文档**：代码、表格、FAQ 和长报告需要不同结构策略。
- **只新增不更新/删除**：旧版本重复召回，权限撤销后内容仍可见。
- **先全库召回再过滤租户**：向量、reranker 和缓存阶段都可能泄露数据。
- **引用是模型自己生成的**：文件名和页码可能幻觉，必须从检索元数据确定性附加。
- **只调 prompt 不看检索 trace**：召回错了，生成端很难补救。
- **离线 Demo 直接上线**：缺少持久化、并发、超时、恢复、监控与成本边界。

## 十二、架构决策清单与上线门禁

先问是否真的需要 RAG：少量稳定规则可以直接结构化查询或写业务代码；需要全文证据、持续更新和来源引用时再引入检索生成。SQL/指标问题通常应由受控查询工具回答，而不是把整库转成向量。

- [ ] 是否有非 RAG 基线，并证明检索确实提升真实任务？
- [ ] chunk 策略是否按文档类型评估，而不是套固定数值？
- [ ] 模型、维度、距离、索引和知识版本是否可重放？
- [ ] ACL 是否贯穿检索、rerank、缓存、引用与对象下载？
- [ ] 是否支持新增、更新、删除、重建、切流和回滚？
- [ ] 是否分别测 Recall@k、忠实度、正确性、P95 和成本？
- [ ] 无答案、冲突来源、时间敏感和注入样本是否进入回归集？
- [ ] 回答引用是否来自确定性元数据，用户能否打开原证据？

## 十三、小结

RAG = **摄取治理 → 切分 → 多路索引 → 授权检索 → 可选重排 → 基于证据生成 → 评估反馈**。模型、数据库、chunk 和 top-k 都是待验证变量；真正可上线的系统还必须解决权限、新鲜度、引用、删除、可观测和回滚。

## 参考来源

- LangChain — [RAG 官方教程](https://python.langchain.com/docs/tutorials/rag/)
- Chroma 文档：[docs.trychroma.com](https://docs.trychroma.com/)
- BGE-M3（HuggingFace 模型卡）：[huggingface.co/BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- Sentence-Transformers 文档：[www.sbert.net](https://www.sbert.net/)
- pgvector（Postgres 向量扩展）：[github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)
- LlamaIndex — [RAG 指南](https://docs.llamaindex.ai/en/stable/understanding/rag/)
