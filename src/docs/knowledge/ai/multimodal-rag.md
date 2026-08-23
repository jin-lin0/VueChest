---
group: RAG 与检索
order: 41
---

# 多模态 RAG 实战

> 纯文本 RAG（见 `rag.md`）只能吃文字。但现实知识大量存在于图片、表格、图表、PPT、视频里。多模态 RAG 把"看得到的内容"也变成可检索知识。本文讲清切分、编码、检索与落地的关键决策。

## 一、多模态 RAG 的三种路线

| 路线                       | 思路                                  | 优点             | 缺点                         |
| -------------------------- | ------------------------------------- | ---------------- | ---------------------------- |
| **共享空间（多模态嵌入）** | 用 CLIP 类模型把图/文映射到同一空间   | 图文可互搜       | 垂直文档与细粒度文字未必占优 |
| **文本化（OCR/VLM 抽取）** | 图→VLM 出文字描述→走普通文本 RAG      | 复用成熟文本管线 | 丢失视觉细节，依赖抽取质量   |
| **混合（推荐）**           | 图存原向量 + 配套文本摘要，检索时融合 | 兼顾语义与细节   | 工程复杂度高                 |

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

## 三、选择 embedding 与索引

- **CLIP / Chinese-CLIP**：图文统一向量空间，支持以文搜图、以图搜文。
- **ColPali 类视觉文档检索**：直接对页面图像建立多向量表示，保留布局和视觉元素；成本与存储需要实测。
- **BGE-M3**（见 `rag.md`）是文本 embedding，名称中的 M3 指 multi-functionality、multi-linguality、multi-granularity，不表示图像模态。它可索引 OCR、caption 和表格序列化文本，但不能替代图像编码器。
- 图片检索质量高度依赖预训练域；垂直领域（医疗/工业）建议微调或叠加文本描述。

每个元素应有稳定的跨模态记录，把页级原图、局部裁剪和文本表示关联起来：

```python
element = {
    "element_id": "manual:v3:p12:figure-2",
    "document_id": "manual:v3",
    "page": 12,
    "bbox": [86, 210, 920, 710],
    "kind": "figure",
    "ocr_text": "告警灯：红色常亮……",
    "caption": "设备正面板告警灯位置示意图",
    "asset_uri": "s3://knowledge/manual/v3/p12/figure-2.png",
    "content_hash": "sha256:...",
    "acl": ["support-team"],
}
```

索引中保存受控对象引用而非公开 URL；生成前再签发短期访问地址。原文件版本、页码和坐标必须跟 chunk 一起更新，否则引用会指向旧页。

## 四、检索与重排（融合）

混合检索需"跨模态打分融合"：

1. 文本查询 → 文本块 BM25 + 向量召回。
2. 文本查询 → 图片块多模态向量召回（CLIP 相似度）。
3. 文本候选使用文本 cross-encoder，多模态候选使用明确支持图文输入的 reranker；也可以先在各路内部排序，再做 rank fusion。
4. 截断 Top-K，拼接"文本 + 图片引用"喂给生成模型。

不同检索器的原始分数通常不可直接相加。RRF 使用名次而不是分数，适合建立首个可解释基线：

```python
from collections import defaultdict

def reciprocal_rank_fusion(rankings, k=60):
    scores = defaultdict(float)
    for ranking in rankings:
        for rank, element_id in enumerate(ranking, start=1):
            scores[element_id] += 1 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)

fused_ids = reciprocal_rank_fusion([
    text_dense_ids,
    keyword_ids,
    image_embedding_ids,
])
```

生成阶段不要把所有原图无差别塞进上下文。先检索到元素，再按问题选择原图、局部裁剪、OCR、caption 或表格结构。模型 API 可接受的图片形式与大小因 provider 而异，应由 adapter 统一处理并记录实际发送的证据。

## 五、生成阶段：多模态 LLM

- 把检索到的文本块 + 图片（或其描述）一起给多模态 LLM。
- 要求模型"引用来源图片/页码"，提升可溯源与可信度。
- 对截图/图表类问题，要求模型只报告可从证据读出的趋势和数值；关键财务数字用确定性表格解析器复核。
- 回答中的引用应指向 `document_id + page + element_id`，而不是模型自行编造的文件名。
- OCR 与图片内文字都属于不可信数据，其中的“忽略系统指令”不能变成控制指令。

## 六、解析、更新与成本

- **存储**：向量库（见 `vector-db.md`）存文本/图片向量；原文件/图片走对象存储（VueChest 用 R2），DB 只存引用。
- **切分**：布局感知，表格/图片独立成块并保留坐标。
- **索引**：文本倒排 + 多模态向量双索引，reranker 融合。
- **评估**：在 `rag-evaluation.md` 的指标上，额外加"多模态忠实度"（答案是否真基于所引图片）。
- **增量更新**：按内容哈希跳过未变化元素；删除旧文档时同步删除图像、文本向量和缓存。
- **成本**：保存 OCR/caption 缓存，只把召回后的少量证据发送给多模态模型，并设置图片数量与像素预算。
- **降级**：OCR、视觉模型或对象存储不可用时明确返回能力受限，不能悄悄用空 caption 生成答案。

## 七、评估方法

除文本 RAG 的 Recall@k、faithfulness 与 answer correctness，还要增加：

- **页面/元素召回率**：相关页、图或表是否进入候选。
- **定位质量**：引用页码和 bbox 是否指向真正证据。
- **OCR/表格准确率**：按字段、单元格或关键数值测，不只看整页字符相似。
- **视觉忠实度**：回答中的颜色、位置、趋势和数值是否被图像直接支持。
- **模态消融**：分别关闭 OCR、视觉 embedding、原图输入，确认每路是否真正带来收益。

评估集要覆盖扫描件、旋转页、跨页表格、低分辨率、小字、图例相近、多图同页和无答案问题。对关键数值由人工或规则验证，不能只用另一个 VLM 给 VLM 打分。

## 八、典型场景

- **企业知识库**：产品手册 PDF（含大量示意图）→ 用户问"这个指示灯红色代表什么"，召回对应图 + 文字作答。
- **研报/财报**：表格密集，布局感知切分 + 表格序列化保证数字可检索。
- **视频**：抽帧 + 帧级 caption，按时间检索片段（进阶）。

## 九、常见坑与安全边界

- **把 BGE-M3 的 multi-vector 误解为多模态**：它处理文本，不编码图片。
- **直接合并不同检索器分数**：分数量纲不同，排名会被某一路支配。
- **只索引整页截图**：命中后无法定位具体图表，也浪费生成端图片预算。
- **只保留 OCR 文本**：箭头、颜色、空间关系和图形趋势会丢失。
- **表格转 Markdown 后丢合并单元格**：列头归属错误会让数值语义相反。
- **信任图片中的指令**：视觉 prompt injection 可诱导 Agent 调工具或泄露数据。
- **对象地址永久公开**：引用链接可能绕过知识库权限与删除流程。

多租户过滤必须同时应用于文本索引、图像索引、reranker 和对象读取。上传文件要做格式、大小、恶意内容和解析资源限制，防止压缩炸弹或超大页面造成无界消费。

## 十、架构决策清单

- [ ] 问题真的依赖视觉信息，还是高质量 OCR + 文本 RAG 已足够？
- [ ] element ID、页码、bbox、版本和 ACL 是否贯穿全部索引？
- [ ] embedding/reranker 是否明确支持输入模态，而不是按名称猜测？
- [ ] 融合方法是否在真实标注集上优于单路基线？
- [ ] 是否只把必要原图/裁剪发送给模型，并记录证据快照？
- [ ] 数值、表格和引用是否有确定性或人工复核？
- [ ] 更新、删除、权限变更是否同步清理所有派生物？
- [ ] 是否测试视觉注入、恶意文件、对象 URL 泄露和资源预算？

## 十一、小结

- 多模态 RAG = 布局感知切分 + 多向量编码 + 融合重排 + 多模态生成。
- 优先"文本化 + 原图补充"的混合路线，复用成熟文本管线。
- 图片走对象存储、prompt 传引用，控制成本；评估加多模态忠实度。

## 参考来源

- LangChain 多模态 RAG 教程：<https://python.langchain.com/docs/tutorials/rag/>
- CLIP（OpenAI）：<https://github.com/openai/CLIP>
- unstructured 文档解析：<https://github.com/Unstructured-IO/unstructured>
- BGE-M3（文本检索）：<https://github.com/FlagOpen/FlagEmbedding/tree/master/research/BGE_M3>
- ColPali 论文：<https://arxiv.org/abs/2407.01449>
