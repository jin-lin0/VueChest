---
group: Agent 基础
order: 37
---

# Agent 框架对比（LangGraph vs AutoGen vs CrewAI vs 自研）

> 选框架不是追新，而是匹配你的"控制粒度"与"协作形态"。本文横向对比四个主流方案，给出选型清单，避免一上来就被框架绑定。

## 一、先问三个问题

1. **需要显式控制流吗？**（分支、循环、人工介入、状态回放）→ 偏 LangGraph / 自研。
2. **是多智能体对话协作吗？**（角色互怼、群聊）→ 偏 AutoGen / CrewAI。
3. **团队有没有精力维护状态、恢复和观测？** 没有 → 先缩小 Agent 自主范围；高层封装只能减少样板代码，不能替你承担生产责任。

## 二、四框架速览

| 框架               | 核心范式                | 状态管理                  | 控制流                    | 适合场景                            |
| ------------------ | ----------------------- | ------------------------- | ------------------------- | ----------------------------------- |
| **LangGraph**      | 有向图（StateGraph）    | 显式 State + Checkpointer | 任意图、条件边、interrupt | 生产级、需可恢复/可观测的复杂 Agent |
| **AutoGen**        | 事件驱动、多 Agent 对话 | 消息/运行时状态           | 对话、路由与协作模式      | 多角色研究、实验性协作流程          |
| **CrewAI**         | 角色、任务与流程        | 任务/流程状态             | Crew 与 Flow              | 快速表达角色化业务流水线            |
| **自研（轻封装）** | 你定义循环              | 你管                      | 完全自定义                | 逻辑简单、要极致可控/低成本         |

## 三、LangGraph：把编排"显式化"

- 优点：状态、节点、边都由你定；Checkpointer 支持断点续跑；`interrupt()` 做人工审批；与 LangChain 生态互通；最适合"严肃生产"。
- 代价：学习曲线陡，图写复杂了难调试（用 `graph.getGraph().draw_mermaid()` 可视化）。
- 适用：客服工单闭环、带工具循环的研究 Agent、需要审计轨迹的系统。

## 四、AutoGen：多 Agent 群聊

- 优点：围绕 AgentChat/Core 等层次表达事件驱动或多角色协作，适合研究不同协作模式。
- 代价：对话轮次失控会导致 token 爆炸与死循环，需要最大轮次、终止条件和消息压缩。AutoGen 不同代际 API 差异明显，必须按项目锁定版本阅读对应文档。
- 适用：代码评审（一个写、一个审）、开放式头脑风暴、原型验证。

## 五、CrewAI：像搭团队

- 优点：用角色、任务、Crew/Flow 等概念快速表达流水线，适合业务方共同讨论流程。
- 代价：复杂恢复、并发和分支仍要落到显式工程设计；版本演进快，示例代码应绑定版本验证。
- 适用：内容生产流水线、调研报告生成、标准化的多步业务。

## 六、自研：最小可用

当你的 Agent 只是"循环调 LLM + 工具"时，几十行代码即可：

```python
for step in range(MAX_STEPS):
    turn = llm.generate(messages=messages, tools=tool_schemas)
    messages.append(turn.assistant_message)
    if not turn.tool_calls:
        return turn.text
    messages.extend(execute_validated_tools(turn.tool_calls))
raise StepBudgetExceeded(MAX_STEPS)
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

业务代码最好只依赖自己的端口，而非框架对象：

```ts
export interface AgentRuntime<State, Event> {
  start(input: unknown, config: RunConfig): Promise<string>
  resume(runId: string, event: Event): Promise<void>
  stream(runId: string): AsyncIterable<RuntimeEvent<State>>
  cancel(runId: string): Promise<void>
}
```

模型网关、tool registry、checkpointer、审批服务和 trace exporter 分别实现独立接口。迁移框架时只替换编排 adapter，已有工具权限、评估集和业务状态不随框架重写。

## 九、生产能力矩阵

Demo 能跑不代表框架适合生产，至少用真实代码验证以下能力：

| 能力           | 要验证的问题                                               |
| -------------- | ---------------------------------------------------------- |
| 持久化与恢复   | 进程崩溃后从哪个节点恢复？副作用会不会重复？               |
| 人工介入       | 审批是否冻结参数？等待几天后能否恢复？                     |
| 流式与取消     | 能否区分 token、状态、工具事件？取消能否传递到底层？       |
| 并发与队列     | 同一会话如何串行化？背压、超时和重试在哪里控制？           |
| 可观测性       | 是否能导出标准 trace，定位一次任务的模型、工具和状态变化？ |
| 版本迁移       | 图、序列化状态和检查点升级后是否兼容旧运行？               |
| 部署与数据边界 | 是否必须使用托管服务？状态、提示和日志存放在哪里？         |

框架提供 checkpointer 不等于业务恰好一次执行。发送邮件、扣款等副作用仍需幂等键、outbox 或补偿流程；恢复点只解决编排状态，不自动解决外部世界的一致性。

## 十、用同一任务做选型实验

选取 30～100 个真实任务，用候选框架实现同一最小闭环，并固定模型、工具和提示词。比较：任务成功率、人工接管率、平均步骤、P95 延迟、token/工具成本、失败恢复时间、trace 可读性、代码复杂度和升级风险。

先实现确定性工作流基线。如果简单状态机已经满足需求，就不应为了“多 Agent”增加不可预测的角色对话。只有并行探索、独立专业上下文或相互审查带来可测收益时，多 Agent 才是架构而非包装。

## 十一、常见坑与决策清单

常见坑包括：按 GitHub 热度选型；把 prompt 角色当权限边界；让多个 Agent 共享无限消息历史；依赖框架默认重试导致副作用重复；没有状态 schema 版本；只看 happy path，未验证等待、取消和恢复。

- [ ] 任务是否真的需要动态规划，还是普通工作流更稳定？
- [ ] 是否画清状态、分支、循环、终止条件和人工审批点？
- [ ] 模型、工具、存储、观测是否已从框架 API 解耦？
- [ ] 是否用锁定版本做过故障注入、恢复和升级演练？
- [ ] 是否比较单 Agent、自研循环和框架方案的真实指标？
- [ ] 所有外部副作用是否有幂等、审计和补偿边界？
- [ ] 托管平台的数据、成本和退出风险是否可以接受？

## 参考来源

- LangGraph 文档：<https://docs.langchain.com/oss/javascript/langgraph/overview>
- AutoGen 文档：<https://microsoft.github.io/autogen/stable/>
- CrewAI 文档：<https://docs.crewai.com/>
- OpenAI Agents SDK：<https://openai.github.io/openai-agents-js/>
