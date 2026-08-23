---
group: RAG 与检索
order: 39
---

# AI 评估与 RAGAS

> 适用场景：量化 RAG / 生成系统的质量，定位「答非所问 / 幻觉 / 检索不到」的根因。本文讲核心指标、RAGAS 用法、人工评估闭环。
> 阅读前提：已了解 RAG 流程（见 `rag`），以及 LLM 基本用法。

RAG 跑通只是第一步。**不评估就不知道它到底「答得准不准、检索对不对」**。本章给出一套可落地的质量量化方案，核心指标与 RAGAS 框架可直接复用。

## 一、RAG 质量的四个核心维度

RAG 链路 = 检索（Retrieval）+ 生成（Generation），问题与失败点分布在两端：

| 维度                                | 衡量什么                               | 失败表现                     |
| ----------------------------------- | -------------------------------------- | ---------------------------- |
| **Faithfulness（忠实度）**          | 答案是否只基于给定上下文，没有编造     | 幻觉：上下文没有，模型自己编 |
| **Answer Relevancy（答案相关性）**  | 答案是否切题、回应了问题               | 答非所问、绕圈子             |
| **Context Recall（上下文召回率）**  | 该检索到的相关原文是否都进了上下文     | 漏检：关键文档没召回         |
| **Context Precision（上下文精度）** | 进上下文的内容是否真相关、排序是否合理 | 噪声多、无关 chunk 排前面    |

> 诊断口诀：**生成问题看 Faithfulness / Answer Relevancy；检索问题看 Context Recall / Precision**。答非所问先查检索，胡编先查生成。

## 二、RAGAS 框架

Ragas 提供了一组 RAG 和 Agent 评估指标，可使用 LLM-as-a-judge 辅助打分。它能降低批量评估成本，但不能替代领域专家，也不能保证跨模型、跨提示词的分数可直接比较。库 API 演进较快，项目应固定版本，并按对应版本文档调整字段和 metric 类。

```python
# 示例采用 Ragas 当前对象式数据结构；运行前核对项目锁定版本
from ragas import EvaluationDataset, SingleTurnSample, evaluate
from ragas.metrics import Faithfulness, ResponseRelevancy

sample = SingleTurnSample(
    user_input="浏览器里的 no-cache 是完全不存储吗？",
    retrieved_contexts=[
        "no-cache 允许存储响应，但在复用前必须向源服务器验证。"
    ],
    response="不是。no-cache 表示复用前要重新验证；no-store 才是不应存储。",
    reference="no-cache 可存储但复用前验证，no-store 不应存储。",
)

dataset = EvaluationDataset(samples=[sample])
result = evaluate(
    dataset=dataset,
    metrics=[Faithfulness(), ResponseRelevancy()],
)
print(result)
```

20～50 条可以作为早期 smoke set，但不足以证明总体稳定。样本量应随风险、问题分布和期望置信度增长；关键是保留真实流量分布，同时单独维护边界与高风险集合。

## 三、指标怎么来的（直觉版）

RAGAS 用 LLM 抽取再打分，避免人工标注：

- **Faithfulness**：把答案拆成若干「陈述句」，逐句问 LLM「这句能否从上下文推出」→ 可推出的比例 = 忠实度。
- **Answer Relevancy**：用 LLM 基于答案反推「这个问题可能是什么」，再与原问题比对相似度。
- **Context Recall**：拿 ground_truth（标准答案应有的知识点）去问 LLM「这些点是否都在检索到的 contexts 里」。
- **Context Precision**：对 contexts 逐条问「这条是否真相关」，并按出现顺序加权（排前面的更重要）。

> 注意：RAGAS 依赖一个「裁判 LLM」，它本身也会犯错。指标用于**横向对比与回归监控**，不是绝对真理。

## 四、建立评估闭环

```
1. 攒评估集（真实问题 + ground_truth + 实际检索/回答）
2. RAGAS 跑分 → 看哪维最低
3. 针对性优化：
   - Context Recall 低 → 调 chunk 大小/overlap、加 BM25 混合检索、换更好 embedding（见 rag.md）
   - Faithfulness 低 → 收紧 prompt「只依据上下文」、降低 temperature、加引用要求
   - Answer Relevancy 低 → 优化 query 改写、明确指令
4. 再跑分，对比前后 → 把评估集与基线分数存仓库，做回归门禁
```

> 把评估集和「基线分数」一起入库（如 `evals/` 目录），每次改 RAG 流程都重跑，分数掉了就报警——这才是工程化的质量保障，而非「感觉变好了」。

## 五、人工评估不可省

自动指标覆盖不了全部。以下情况必须人工抽检：

- **领域正确性**：专业术语、数值、代码是否真对（LLM 裁判也会糊弄）。
- **安全风险**：是否泄露隐私、是否产生有害内容。
- **体验维度**：语气、结构、是否过长——这些自动指标抓不到。

> 实践：自动评估做「日常回归 + 横向对比」，人工评估做「定期抽检 + 边界 case 复核」。两者结合才是可信的质量体系。

## 六、延伸指标

- **答案正确性（Answer Correctness）**：结合 ground_truth 算事实吻合度（比 relevancy 更严）。
- **多轮对话一致性**：对话场景下前后是否矛盾。
- **延迟 / 成本**：评估不能只看质量，还要看每次检索+生成的耗时与 token 成本。

## 七、先用确定性指标评检索

如果有“问题 → 相关文档 ID”的标注，优先计算不依赖裁判模型的指标：

- `Recall@k`：前 k 个结果覆盖了多少相关文档，适合判断漏检。
- `Precision@k`：前 k 个中有多少相关，适合判断上下文噪声。
- `MRR`：第一个相关结果出现得是否足够靠前。
- `nDCG@k`：相关性有等级时，同时衡量顺序与增益。

```python
def recall_at_k(ranked_ids, relevant_ids, k):
    relevant = set(relevant_ids)
    if not relevant:
        return None  # 无标注样本不能武断记为 0 或 1
    hits = len(set(ranked_ids[:k]) & relevant)
    return hits / len(relevant)

def reciprocal_rank(ranked_ids, relevant_ids):
    relevant = set(relevant_ids)
    for rank, doc_id in enumerate(ranked_ids, start=1):
        if doc_id in relevant:
            return 1 / rank
    return 0.0
```

文档 ID 标注要明确粒度：页面级标注不能直接当 chunk 级精确答案。若同一事实分布在多个 chunk，还要记录“满足答案所需的最小证据集合”，否则 Recall@k 会奖励重复段落。

## 八、评估集设计与切片

评估集至少包含：常见问题、长尾表达、同义改写、多跳问题、无答案问题、时间敏感问题、权限隔离、注入攻击和故意含糊的问题。每条样本保存：

1. 用户输入与必要对话历史。
2. 可接受答案要点，而不只是一段唯一文案。
3. 相关文档/证据 ID、知识版本和租户范围。
4. 不可接受事实、必须拒答或澄清的条件。
5. 来源、难度、语言、业务域和风险标签。

总体平均分会掩盖问题。应按语言、问题类型、数据源、客户、文档新旧和是否需要多跳分别切片；发布门禁同时约束关键切片和最差切片，而不只是全局均值。

为避免测试集污染，开发调参集、回归集和最终保留集分开。线上失败经人工去敏后进入候选池，经过标注审核再加入回归集，不能自动把模型旧答案当标准答案。

## 九、校准 LLM 裁判

LLM judge 容易受回答长度、顺序、措辞、模型自偏好和提示词影响。上线前：

- 用领域专家双人标注一批样本，计算裁判与人工的一致性。
- 对候选 A/B 随机交换顺序，检查位置偏差；必要时多次运行看方差。
- 要求裁判输出结构化标签和简短证据，但不要把隐藏推理过程当审计依据。
- 固定 judge 模型、版本、温度、prompt 和解析器；升级时重新校准基线。
- 高风险错误按严重度计权，不能让十个文风优点抵消一次事实性严重错误。

自动指标适合回归趋势，最终上线判断还应包含人工盲评。若裁判无法区分两个系统，就报告不确定性，而不是把 0.01 的差异包装成明确胜负。

## 十、Agent 与端到端评估

Agent/RAG 系统还需拆解轨迹：是否选对工具、参数是否正确、检索过滤是否越权、步骤是否冗余、最终副作用是否符合目标。一次任务成功可能掩盖危险的中间调用，一次答案失败也可能是工具不可用而不是模型能力不足。

建议分三层：组件层测检索和 tool contract；轨迹层测路由、步骤与权限；端到端层测用户任务成功率。故障注入要覆盖向量库超时、空检索、裁判不可用、模型限流和一部分工具成功的情况。

## 十一、在线实验与质量门禁

离线分数通过后再小流量灰度，观察任务完成率、用户修正率、引用点击、转人工率、P95 延迟、单任务成本和安全事件。点赞率受用户结构和展示位置影响，不能单独作为真实性指标。

发布门禁示例：关键安全集零严重越权；Recall@5 不低于基线；事实错误率不显著上升；P95 延迟和成本在预算内。每个门禁都要注明数据集版本、样本数和比较方法。

## 十二、常见坑与评估检查清单

常见坑包括：让待测模型同时当唯一裁判；只用合成的简单问题；评估答案却不保存实际检索上下文；调参时反复看最终保留集；只报平均分不报样本数和切片；模型或知识库升级后继续沿用不可比基线。

- [ ] 是否把检索、生成、轨迹和端到端成功分开评估？
- [ ] 是否包含真实流量、无答案、越权、注入和高风险样本？
- [ ] 确定性检索指标是否优先于 LLM 猜测相关性？
- [ ] judge 是否与人工标注校准，并检查顺序偏差和方差？
- [ ] 数据集、知识快照、模型、prompt 与代码版本是否可复现？
- [ ] 是否按关键业务切片报告，而不只看总平均？
- [ ] 发布门禁是否同时约束质量、延迟、成本和安全？
- [ ] 线上失败是否经过脱敏与人工审核后沉淀为回归样本？

## 参考来源

- RAGAS 文档：<https://docs.ragas.io/>
- RAGAS GitHub：<https://github.com/explodinggradients/ragas>
- RAGAS 论文：<https://arxiv.org/abs/2309.15217>
- BEIR 检索基准：<https://github.com/beir-cellar/beir>
- TREC Evaluation：<https://trec.nist.gov/trec_eval/>
