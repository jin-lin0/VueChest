# Agent 设计模式与架构

Agent（智能体）是 LLM 从"只会聊天"走向"能干活"的关键形态。本文系统梳理主流 Agent 设计模式、核心组件、可靠性控制与选型建议，帮助你在 Vue 前端项目中更好地理解、接入或编排后端 Agent。

## 一、什么是 Agent

一个合格的 Agent 通常包含四个要素：

- **LLM（大脑）**：负责推理与决策。
- **工具 Tools**：搜索、计算、调用 API、读写数据库等，让 Agent 作用于外部世界。
- **记忆 Memory**：短期（上下文窗口）+ 长期（向量库 / 知识库）。
- **规划循环 Planning Loop**：把"感知—思考—行动—观察"串成闭环（Perceive → Think → Act → Observe）。

```text
            ┌──────────────────────────────────┐
            │              Agent                │
  用户目标 ─┤  LLM(推理)  ←→  记忆(短期/长期)    │
            │      │                            │
            │      ▼                            │
            │   规划循环: Thought → Action      │
            │      │        → Observation       │
            └──────┼───────────────────────────┘
                   ▼ 调用
              [ 工具 / 环境 ]
                   │
                   └── 结果回灌 → 下一轮思考
```

Agent 与传统"问答机器人"的本质区别：它会**自主决定下一步做什么**，而不是一次性生成答案。

## 二、ReAct 模式（Reasoning + Acting）

ReAct 是最经典的 Agent 循环：让 LLM 显式输出"思考"，再决定调用哪个工具，把工具结果（Observation）回灌，循环往复。

```text
Thought: 我需要先查 GDP 最高的国家
Action: Search["highest GDP country"]
Observation: United States
Thought: 再查它的首都
Action: Search["capital of United States"]
Observation: Washington, D.C.
Final Answer: 华盛顿
```

### 最简 Python 实现

```python
def react_loop(llm, tools, question, max_steps=8):
    scratchpad = ""
    for _ in range(max_steps):
        prompt = build_react_prompt(question, scratchpad)
        text = llm(prompt)
        if "Final Answer:" in text:
            return extract_answer(text)
        action, arg = parse_action(text)        # 解析 Action / Action Input
        obs = tools[action](arg)                # 执行工具
        scratchpad += f"{text}\nObservation: {obs}\n"
    return "未能在步数限制内完成"
```

**优点**：动态适应、容错好、轨迹可审计。**缺点**：每步都要调 LLM，token 消耗与延迟高。现代实现多用 Function Calling 替代纯文本解析，更可靠。

## 三、Plan-and-Execute（计划-执行）

与 ReAct 的"走一步看一步"不同，Plan-and-Execute 先由 Planner 生成完整步骤，再由 Executor 逐步落实，并可选 Replanner 调整。

```text
Input → Planner ──► [Step1, Step2, Step3]
                       │
                       ▼
                   Executor(Step1) → Replanner
                       │  revise?
                       ▼
                   Executor(Step2) → Replanner → ... → Final Answer
```

### 与 ReAct 的核心区别

| 维度     | ReAct              | Plan-and-Execute                |
| -------- | ------------------ | ------------------------------- |
| 决策方式 | 逐步推理，边走边看 | 先整体规划，再执行              |
| LLM 调用 | 每步一次           | Planner 仅一次（或按需 replan） |
| 全局视野 | 易"推理漂移"       | 计划贯穿全程，目标不丢          |
| 成本     | 中等               | 多工具任务可省 30–60% token     |
| 可控性   | 低，难干预         | 高，执行前可审核/修改计划       |
| 适用     | 探索性、不确定任务 | 长链路、流程清晰任务            |

**实践建议**：最常用的是**混合架构**——外层 Plan-and-Execute 做顶层编排，内层每个子任务用 ReAct 执行，再加 Replanner 纠偏。

## 四、Reflection / Self-critique（反思与自我批评）

Reflection 在"生成→反思→改进"的循环里提升质量：先产出初稿，Critic（可由同一 LLM 扮演）指出问题，再迭代优化。

```python
def reflect_loop(llm, task, rounds=2):
    draft = llm(f"完成任务: {task}")
    for _ in range(rounds):
        critique = llm(f"评审以下内容的问题与改进点:\n{draft}")
        if "无需修改" in critique:
            break
        draft = llm(f"根据评审改进:\n{draft}\n评审:{critique}")
    return draft
```

适合写作、代码生成、报告等高价值产出；常作为多 Agent 中的 Critic 角色复用。

## 五、Multi-Agent 协作

当工具/目标过多导致单 Agent 上下文爆炸、决策变差时，应拆成多个专职 Agent。常见角色：

- **Planner**：拆解任务、制定计划。
- **Worker**：执行具体子任务（领域专家）。
- **Critic**：校验、挑错、打分。
- **Supervisor / Orchestrator**：路由、汇总、最终决策。

### 常见编排模式

```text
1) Supervisor 路由（动态分发）
   User → Supervisor ─┬─► Worker A
                      ├─► Worker B
                      └─► Worker C → 汇总

2) Debate 辩论（多轮互评，投票收敛）
   Solver A ⇄ Solver B ⇄ Solver C → Aggregator(多数投票)

3) Pipeline 流水线（顺序交接，线性）
   Ingest → Validate → Transform → Load → Output

4) Critic 校验（质量门禁）
   Primary ──► output ──► Critic ──► 通过? 交付 : 打回重做
```

> 注意：Supervisor 超过约 5 个并发委派会成为串行瓶颈；Pipeline 存在"错误级联"，首步幻觉会污染后续。务必加步数上限与 Critic 兜底。

## 六、Tool / Function Calling 设计

工具是 Agent 与世界的接口，设计质量直接决定可用性。

- **清晰描述**：说明"何时用、产出什么"，帮助 LLM 选对工具。
- **参数 Schema**：用 JSON Schema 约束入参，避免自由文本解析。
- **原子化**：一个工具只做一件事，复杂操作由 Agent 组合。
- **错误处理**：返回可读错误信息而非堆栈；提供降级路径。
- **结果回灌**：把工具结果以 `Observation` / function message 形式送回 LLM。

```json
{
  "name": "search_docs",
  "description": "在知识库检索相关文档，用于回答需要外部依据的问题",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "检索关键词" },
      "top_k": { "type": "integer", "default": 3 }
    },
    "required": ["query"]
  }
}
```

```python
def call_tool(name, args):
    try:
        return TOOLS[name](**args)
    except Exception as e:
        return f"[工具错误] {type(e).__name__}: {e}"  # 可读信息回灌
```

## 七、记忆管理

| 类型     | 载体       | 用途         | 策略                 |
| -------- | ---------- | ------------ | -------------------- |
| 短期记忆 | 上下文窗口 | 当前任务对话 | 滑动窗口、截断旧轮   |
| 长期记忆 | 向量库     | 跨会话知识   | 嵌入检索（RAG）      |
| 摘要压缩 | LLM 摘要   | 控制 token   | 把早期对话压缩为摘要 |

```python
def remember(memory, turn):
    memory.append(turn)
    if len(memory) > WINDOW:
        old = memory[: len(memory) - WINDOW]
        summary = llm(f"总结以下对话:\n{old}")   # 摘要压缩
        memory = [summary] + memory[-WINDOW:]
    return memory
```

## 八、控制与可靠性

生产环境必须内建护栏：

- **最大步数限制**：防止无限循环（ReAct/多 Agent 都需）。
- **兜底策略**：超时、工具失败、解析失败时的默认回复或人工接管。
- **可观测性**：记录每步 Thought / Action / Observation，用 LangSmith 等追踪。
- **评估**：任务完成率、工具选择准确率、步数效率、LLM-as-judge 打分。

```python
def safe_agent(agent, task, max_steps=10, timeout=30):
    try:
        with time_limit(timeout):
            return agent.run(task, max_steps=max_steps)
    except TimeoutError:
        return "执行超时，请简化任务或稍后重试"
    except Exception as e:
        return f"执行异常: {e}"
```

## 九、选型建议

```text
任务步骤少 / 高度不确定 / 需实时试错 ? ──► 单 Agent + ReAct
        │
任务可拆 >3 步 / 流程清晰 / 需审计 ? ──► Plan-and-Execute（或混合）
        │
工具或目标过多 / 单 Agent 上下文爆炸 ? ──► 多 Agent（Supervisor/Pipeline）
        │
输出质量关乎重大（合规/财务）? ──► 加 Critic 校验环
```

**权衡原则**：

1. 先单 Agent 后多 Agent——多 Agent 带来 2–4 倍成本与延迟，复杂度陡增。
2. 不确定、需探索用 ReAct；长链路、可预见用 Plan-and-Execute。
3. 多 Agent 优先选 Pipeline（固定流程最快最省），仅在路径动态时才用 Supervisor。
4. 无论哪种架构，都加步数上限、错误处理与可观测性——这是可靠性的底线。

> 总结：Agent 没有"银弹"。理解各模式的取舍，按任务确定性、成本与质量需求组合使用，才是工程落地的关键。

## 参考来源

- Anthropic — [Building Effective Agents（高效 Agent 设计指南）](https://www.anthropic.com/research/building-effective-agents)
- LangChain — [Agents 概念指南](https://python.langchain.com/docs/concepts/agents)
- OpenAI — [Function Calling 指南](https://platform.openai.com/docs/guides/function-calling)
- LlamaIndex — [Multi-Agent 协作模式](https://docs.llamaindex.ai/en/stable/use_cases/agents/)
