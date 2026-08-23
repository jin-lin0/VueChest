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

RAGAS 是目前最常用、指标定义清晰的 RAG 评估框架。它用 LLM 当「裁判」（LLM-as-a-judge）自动打分上述指标，无需人工逐条标。

```python
# 安装
# pip install ragas datasets

from ragas import evaluate
from ragas.metrics import (
    faithfulness, answer_relevancy,
    context_recall, context_precision,
)
from datasets import Dataset

# 准备评估集：问题 + 标准答案(可选) + 检索到的上下文 + 实际回答
data = Dataset.from_dict({
    "question":      ["Vue Router 的 mode=out-in 有什么坑？"],
    "answer":        ["会导致返回白屏，应改用默认模式"],
    "contexts":      [["RouterView 过渡严禁 mode=out-in，与异步懒加载冲突→返回白屏..."]],
    "ground_truth":  ["mode=out-in 与异步懒加载冲突导致白屏，用默认模式"],
})

result = evaluate(
    data,
    metrics=[faithfulness, answer_relevancy, context_recall, context_precision],
)
print(result)
# 输出各指标 0~1 分：faithfulness=0.95, answer_relevancy=0.9, ...
```

> 评估集不需要大：20–50 条覆盖核心场景的真实问答，就能稳定反映系统水平。关键是**问题来自真实用户**，而非自己编的漂亮题。

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

## 参考来源

- RAGAS 文档：<https://docs.ragas.io/>
- RAGAS GitHub：<https://github.com/explodinggradients/ragas>
- 论文《RAGAS: Automated Evaluation of Retrieval Augmented Generation》（arXiv:2309.15217）
- 评估思路参考：<https://www.confident-ai.com/>、<https://github.com/stanford-futuredata/ColBERT>
