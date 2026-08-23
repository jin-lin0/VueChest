---
group: Agent 基础
order: 37
---

# Agent 框架对比（LangGraph vs AutoGen vs CrewAI vs 自研）

> 选框架不是追新，而是匹配你的"控制粒度"与"协作形态"。本文横向对比四个主流方案，给出选型清单，避免一上来就被框架绑定。

## 一、先问三个问题

1. **需要显式控制流吗？**（分支、循环、人工介入、状态回放）→ 偏 LangGraph / 自研。
2. **是多智能体对话协作吗？**（角色互怼、群聊）→ 偏 AutoGen / CrewAI。
3. **团队有没有精力维护图/编排代码？** 没有 → 偏高层封装（CrewAI）或托管平台。

## 二、四框架速览

| 框架               | 核心范式                          | 状态管理                  | 控制流                    | 适合场景                            |
| ------------------ | --------------------------------- | ------------------------- | ------------------------- | ----------------------------------- |
| **LangGraph**      | 有向图（StateGraph）              | 显式 State + Checkpointer | 任意图、条件边、interrupt | 生产级、需可恢复/可观测的复杂 Agent |
| **AutoGen**        | 多 Agent 对话                     | 会话消息列表              | 事件驱动对话轮转          | 研究、多角色头脑风暴、代码生成      |
| **CrewAI**         | 角色（Agent）+ 任务（Task）+ 流程 | 任务上下文                | 顺序/层级（hierarchical） | 业务流水线、快速搭"团队"            |
| **自研（轻封装）** | 你定义循环                        | 你管                      | 完全自定义                | 逻辑简单、要极致可控/低成本         |

## 三、LangGraph：把编排"显式化"

- 优点：状态、节点、边都由你定；Checkpointer 支持断点续跑；`interrupt()` 做人工审批；与 LangChain 生态互通；最适合"严肃生产"。
- 代价：学习曲线陡，图写复杂了难调试（用 `graph.getGraph().draw_mermaid()` 可视化）。
- 适用：客服工单闭环、带工具循环的研究 Agent、需要审计轨迹的系统。

## 四、AutoGen：多 Agent 群聊

- 优点：两个 `AssistantAgent` + `UserProxyAgent` 就能跑起来；`GroupChat` 支持多角色轮流发言；适合"让模型互相挑错"。
- 代价：对话轮次失控会导致 token 爆炸与死循环，需要 `max_turns` / 终止条件。
- 适用：代码评审（一个写、一个审）、开放式头脑风暴、原型验证。

## 五、CrewAI：像搭团队

- 优点：概念贴近人（`Agent` 有 role/goal/backstory，`Task` 有 description/expected_output），几行代码组" crew"；`Process.sequential` / `hierarchical` 两种流程。
- 代价：灵活性弱于 LangGraph，复杂分支难表达；版本演进快、API 偶有变动。
- 适用：内容生产流水线、调研报告生成、标准化的多步业务。

## 六、自研：最小可用

当你的 Agent 只是"循环调 LLM + 工具"时，几十行代码即可：

```python
while not done:
    resp = llm(messages, tools=tools)
    if resp.tool_calls:
        messages += run_tools(resp.tool_calls)
    else:
        print(resp.content); done = True
```

- 优点：零依赖、可控、易调试、成本低。
- 代价：缺持久化、观测、并发等生产件，需自己补。
- 适用：MVP、逻辑简单、对延迟/成本敏感的内部工具。

## 七、选型决策表

- 要**可恢复、可审计、复杂控制流** → LangGraph。
- 要**多角色自动协作 / 研究探索** → AutoGen。
- 要**快速搭业务"团队"流水线** → CrewAI。
- 要**最小依赖、完全可控** → 自研轻封装。
- 不确定 → 先用自研跑通，再按痛点迁到 LangGraph。

## 八、迁移与解耦建议

- 把"模型调用""工具执行""状态存储"做成可替换接口，框架只是编排层，别让业务耦合进框架 API。
- 评估指标（见 `rag-evaluation.md`）与可观测性（trace/log）应独立于框架，方便横向对比。
- 多模型兼容层（见 `function-calling.md`）能降低换框架/换模型的摩擦。

## 参考来源

- LangGraph 文档：<https://langchain-ai.github.io/langgraph/>
- AutoGen 文档：<https://microsoft.github.io/autogen/>
- CrewAI 文档：<https://docs.crewai.com/>
- LangChain 博客（Agent 框架综述）：<https://blog.langchain.dev/>
