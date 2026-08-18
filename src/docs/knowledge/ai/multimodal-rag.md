---
group: RAG 与检索
order: 41
---

# 多模态 RAG 实战

> 纯文本 RAG（见 `rag.md`）只能吃文字。但现实知识大量存在于图片、表格、图表、PPT、视频里。多模态 RAG 把"看得到的内容"也变成可检索知识。本文讲清切分、编码、检索与落地的关键决策。

## 一、多模态 RAG 的三种路线

| 路线 | 思路 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **多向量（原生多模态嵌入）** | 用 CLIP 等把图/文映射到同一向量空间 | 图文可互搜 | 需多模态模型，文本检索精度略逊 |
| **文本化（OCR/VLM 抽取）** | 图→VLM 出文字描述→走普通文本 RAG | 复用成熟文本管线 | 丢失视觉细节，依赖抽取质量 |
| **混合（推荐）** | 图存原向量 + 配套文本摘要，检索时融合 | 兼顾语义与细节 | 工程复杂度高 |

> 实践建议：表格/扫描件先用 OCR/VLM 抽取文本做主索引，原图向量做补充，召回后把图片连同摘要一起喂给多模态 LLM 生成答案。

## 二、文档布局感知切分（Layout-aware）

PDF/PPT 不能按固定字数切——一段可能横跨文字、图表、表格。用 **布局感知** 解析器保留结构化语义：

- `unstructured` / `layoutlm` / 商用 PDF 解析：输出"带类型的块"（标题/段落/表格/图片）。
- 表格单独成块并用 `table` 序列化（markdown 表 / HTML 表），避免被切成碎行。
- 图片块记录页码/坐标，便于回链原图。

```python
from unstructured.partition.pdf import partition_pdf
elements = partition_pdf("doc.pdf", strategy="hi_res",
                         infer_table_structure=True)
for el in elements:
    print(el.category, "->", el.text[:50])
```

## 选用多模态嵌入模型

- **CLIP / Chinese-CLIP**：图文统一向量空间，支持以文搜图、以图搜文。
- **BGE-M3**（见 `rag.md`）也支持多向量与多语言，可作为统一底座减少栈复杂度。
- 图片检索质量高度依赖预训练域；垂直领域（医疗/工业）建议微调或叠加文本描述。

## 三、检索与重排（融合）

混合检索需"跨模态打分融合"：

1. 文本查询 → 文本块 BM25 + 向量召回。
2. 文本查询 → 图片块多模态向量召回（CLIP 相似度）。
3. 用 cross-encoder（含多模态 reranker，如 `bge-reranker-v2-m3` 对图文对）统一重排。
4. 截断 Top-K，拼接"文本 + 图片引用"喂给生成模型。

> 注意：图片本身不直接塞进 prompt 上下文（token 贵），而是传"图片 URL + 摘要 + 关键可视信息"，由多模态 LLM（GPT-4o / Gemini / Qwen-VL）读取原图。

## 四、生成阶段：多模态 LLM

- 把检索到的文本块 + 图片（或其描述）一起给多模态 LLM。
- 要求模型"引用来源图片/页码"，提升可溯源与可信度。
- 对截图/图表类问题，让模型描述图中趋势而非凭空生成数字。

## 五、工程落地清单

- **存储**：向量库（见 `vector-db.md`）存文本/图片向量；原文件/图片走对象存储（VueChest 用 R2），DB 只存引用。
- **切分**：布局感知，表格/图片独立成块并保留坐标。
- **索引**：文本倒排 + 多模态向量双索引，reranker 融合。
- **评估**：在 `rag-evaluation.md` 的指标上，额外加"多模态忠实度"（答案是否真基于所引图片）。
- **成本**：图片向量与多模态 LLM 调用都贵，做好缓存与按需调用。

## 六、典型场景

- **企业知识库**：产品手册 PDF（含大量示意图）→ 用户问"这个指示灯红色代表什么"，召回对应图 + 文字作答。
- **研报/财报**：表格密集，布局感知切分 + 表格序列化保证数字可检索。
- **视频**：抽帧 + 帧级 caption，按时间检索片段（进阶）。

## 七、小结

- 多模态 RAG = 布局感知切分 + 多向量编码 + 融合重排 + 多模态生成。
- 优先"文本化 + 原图补充"的混合路线，复用成熟文本管线。
- 图片走对象存储、prompt 传引用，控制成本；评估加多模态忠实度。

## 参考来源

- LangChain 多模态 RAG 教程：<https://python.langchain.com/docs/tutorials/rag/>
- CLIP（OpenAI）：<https://github.com/openai/CLIP>
- unstructured 文档解析：<https://github.com/Unstructured-IO/unstructured>
- BGE-M3 / Reranker：<https://github.com/FlagOpen/FlagEmbedding>
