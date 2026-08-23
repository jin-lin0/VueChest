---
group: Agent 基础
order: 36
---

# LangGraph 入门与核心概念

LangGraph 是 LangChain 团队开源的 **LLM 智能体（Agent）编排库**。它把 Agent 的执行过程建模为一张有向图：节点（Node）负责计算，边（Edge）负责控制流，所有节点共享一个状态（State）对象。相比传统“线性链（Chain）”，LangGraph 最大的特点是 **原生支持循环、分支和状态持久化**，非常适合构建需要多轮推理、工具调用、人类审批的 Agent。

> 本文基于 LangGraph v1.0（稳定版，2025-10 发布）的 API 编写，使用 Python 3.10+。核心导入路径：`from langgraph.graph import StateGraph, START, END`。

## 一、为什么需要 LangGraph

| 能力              | 传统线性 Chain | LangGraph                                   |
| ----------------- | -------------- | ------------------------------------------- |
| 执行结构          | 只能顺序执行   | 支持 **循环 / 分支 / 并行**                 |
| 状态管理          | 无内建状态     | 显式 **State** 对象，可被 reducer 合并      |
| 持久化与记忆      | 需自行拼接     | **Checkpointer** 自动存快照                 |
| 断点续跑          | 不支持         | 中断后可恢复                                |
| Human-in-the-loop | 需手动实现     | `interrupt_before/after` 一等公民           |
| 工具调用循环      | 需手写         | `ToolNode` / `tools_condition` 或上层 Agent |

当任务需要循环、分支、持久恢复和人工介入时，LangGraph 是可选的低层运行时；简单的一轮 tool calling 或固定工作流不一定需要图框架。

## 二、核心概念

### 2.1 StateGraph：图构建器

`StateGraph` 是定义图的入口。先传入状态 schema，再往里 `add_node` / `add_edge`，最后 `compile()` 得到可执行图。

```python
from langgraph.graph import StateGraph, START, END

builder = StateGraph(State)   # State 是下面定义的 TypedDict
graph = builder.compile()     # 编译为可执行对象
```

### 2.2 State：图的共享状态

状态可以用 `TypedDict`、`Pydantic` 或 `dataclass` 定义。最常用的是 `TypedDict`。**没有 reducer 的字段默认“覆盖更新”**；带 reducer 的字段按 reducer 函数合并。

```python
from typing import TypedDict, Annotated
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

class State(TypedDict):
    # messages 字段用 add_messages 作为 reducer：新消息“追加”而非覆盖
    messages: Annotated[list[AnyMessage], add_messages]
    # 普通字段：后写覆盖前写
    step: int
```

- `add_messages`（来自 `langgraph.graph.message`）：智能合并消息列表，按消息 `id` 去重/更新，是构建对话 Agent 的标准选择。
- `operator.add`：数值累加或列表拼接。

LangGraph 还提供了预置的 `MessagesState`（来自 `langgraph.graph`），等价于只有一个 `messages` 字段且使用 `add_messages` 的状态：

```python
from langgraph.graph import MessagesState

class AgentState(MessagesState):
    step: int   # 在消息状态上额外扩展字段
```

### 2.3 Node：节点函数

节点就是普通的 Python 函数，**接收当前 State，返回需要更新的字段字典**（不要返回整个 state）。

```python
def call_model(state: State) -> dict:
    response = model.invoke(state["messages"])
    return {"messages": [response]}   # 只返回变化的部分
```

### 2.4 Edge：普通边与条件边

- **普通边**：`add_edge("a", "b")` 表示 a 执行完必到 b。
- **特殊哨兵节点**：`START`（入口）、`END`（出口），编译时指定图的起点终点。
- **条件边**：`add_conditional_edges(source, router_fn, path_map)`，根据 `router_fn` 的返回值路由到不同节点，从而实现分支与循环。

## 三、构建一个简单图（最小可运行示例）

下面这个计数器图不依赖任何 LLM，纯粹用来理解“定义状态 → 加节点 → 加边 → 编译”的流程：

```python
from typing import TypedDict, Annotated
from operator import add

from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    count: Annotated[int, add]   # 累加 reducer

def increment(state: State) -> dict:
    return {"count": 1}

builder = StateGraph(State)
builder.add_node("increment", increment)
builder.add_edge(START, "increment")   # 入口 → increment
builder.add_edge("increment", END)     # increment → 出口

graph = builder.compile()

result = graph.invoke({"count": 0})
print(result)   # {'count': 1}
```

执行：`graph.invoke(input)` 即可运行整张图，`input` 是初始 state。

## 四、条件分支

条件边让你的图能“看状态做决定”。下面的例子根据 `state["sentiment"]` 决定走“安抚”还是“转人工”：

```python
def route(state: State) -> str:
    if state["sentiment"] == "negative":
        return "human"      # 返回目标节点名
    return END

builder.add_conditional_edges(
    "classify",                 # 源节点
    route,                      # 路由函数
    {"human": "human", END: END}  # 返回值 → 目标节点 的映射
)
```

Agent 场景里最经典的条件边是 `tools_condition`（见第七节），它判断模型是否产生了工具调用，决定去 `tools` 节点还是直接 `END`。

## 五、持久化与记忆（Checkpointer）

默认编译出的图是“无状态”的，每次调用互不相关。要支持多轮对话、断点续跑，需传入 **Checkpointer**。

### 5.1 MemorySaver（开发/测试）

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "user-123"}}
graph.invoke({"messages": [HumanMessage("你好")]}, config=config)
# 同一个 thread_id 再次调用，会自动带上历史状态
graph.invoke({"messages": [HumanMessage("我刚才说了什么？")]}, config=config)
```

`thread_id` 是**会话隔离的钥匙**：不同 `thread_id` 拥有完全独立的状态存档。

### 5.2 SqliteSaver（本地持久化）

```python
from langgraph.checkpoint.sqlite import SqliteSaver

with SqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    graph = builder.compile(checkpointer=checkpointer)
    graph.invoke({"messages": [...]}, config={"configurable": {"thread_id": "s1"}})
```

SQLite 适合本地和单进程持久化验证；多实例生产通常评估官方 Postgres checkpointer 或与部署环境匹配的持久化后端，并测试连接池、迁移、保留与恢复。

### 5.3 断点续跑与时间旅行

每个节点执行后都会自动存一份状态快照。可查看历史并回到任意快照重跑：

```python
states = list(graph.get_state_history(config))
past = states[2]                       # 取出第 3 个检查点
graph.invoke(None, past.config)        # 从该状态继续
```

## 六、Human-in-the-loop（人在回路）

对于发邮件、删数据、转账等高风险操作，应在执行前暂停等待人工审批。可以在节点中调用 `interrupt()` 获取结构化人工输入；静态断点也能用于调试或固定节点边界。审批还必须在业务层绑定实际动作参数。

```python
from langgraph.checkpoint.memory import MemorySaver

builder.add_edge(START, "draft")
builder.add_edge("draft", "send")
builder.add_edge("send", END)

graph = builder.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["send"],   # 在“发送”前暂停
)

config = {"configurable": {"thread_id": "email-1"}}
# 第一次调用会停在 interrupt 点
graph.invoke({"messages": [HumanMessage("给 Alice 发周五会议邀请")]}, config=config)

# 检查待执行节点与当前状态
snap = graph.get_state(config)
print(snap.next)                 # ('send',) 表示下一步是 send
print(snap.values["draft_email"])  # 查看草稿供人工审核

# 人工批准后，用相同的 thread_id 继续
from langgraph.types import Command
graph.invoke(Command(resume=True), config=config)
```

要点：

- 恢复时必须使用**相同的 `thread_id`**，否则会被当成新会话。
- 也可在节点内部用 `from langgraph.types import interrupt` 实现更细粒度的暂停，恢复时通过 `Command(resume=value)` 把人工输入传回。

## 七、工具调用循环：ReAct 风格 Agent

ReAct（Reasoning + Acting）是 Agent 的经典范式：模型思考、决定调用工具、拿到结果、再次思考，直到给出最终答案。用 `ToolNode` + `tools_condition` 手动构建：

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool

from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode, tools_condition

@tool
def get_weather(city: str) -> str:
    """查询指定城市的天气。"""
    return f"{city} 今天晴，25°C。"

@tool
def multiply(left: float, right: float) -> float:
    """计算两个数字的乘积。"""
    return left * right

tools = [get_weather, multiply]
model = ChatOpenAI(model=MODEL_ID)
model_with_tools = model.bind_tools(tools)

def call_model(state: MessagesState) -> dict:
    response = model_with_tools.invoke(state["messages"])
    return {"messages": [response]}

builder = StateGraph(MessagesState)
builder.add_node("agent", call_model)
builder.add_node("tools", ToolNode(tools))

builder.add_edge(START, "agent")
# 条件边：有 tool_calls 去 tools，否则结束
builder.add_conditional_edges("agent", tools_condition)
builder.add_edge("tools", "agent")   # 工具结果回到 agent，形成循环

graph = builder.compile(checkpointer=MemorySaver())
```

如果只需要常规工具循环，LangGraph v1 文档建议从 LangChain 的高层 `create_agent` 开始；它构建在 LangGraph 上。旧教程中的 `langgraph.prebuilt.create_react_agent` 在 v1 已弃用，新代码不要继续照抄：

```python
from langchain.agents import create_agent

agent = create_agent(
    model=model,
    tools=tools,
    system_prompt="只在需要实时数据或计算时调用工具。",
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "北京天气如何？再算 1337 * 42"}]
})
```

## 八、流式输出

`graph.stream()` 支持多种 `stream_mode`，方便在不同粒度上实时展示：

| stream_mode  | 内容                           | 典型用途         |
| ------------ | ------------------------------ | ---------------- |
| `"values"`   | 每次状态更新后的**完整 state** | 多轮对话逐步展示 |
| `"updates"`  | 每个节点返回的**增量更新**     | 观察单节点输出   |
| `"messages"` | 逐 token 的**消息块**          | LLM 打字机效果   |
| `"debug"`    | 最详细的调试信息               | 排障             |

```python
# 1) 逐步展示每个 superstep 的完整状态（含中间工具消息）
for chunk in graph.stream(inputs, stream_mode="values"):
    chunk["messages"][-1].pretty_print()

# 2) 逐 token 流式输出（需模型支持 streaming）
for kind, data in graph.stream(inputs, stream_mode="messages"):
    if kind == "messages":
        msg_chunk, _ = data
        print(msg_chunk.content, end="", flush=True)
```

> 提示：使用 `stream_mode="messages"` 时，模型需以流式方式调用（如 `ChatOpenAI(streaming=True)`），否则仍会一次性返回。

## 九、状态与副作用的生产边界

Checkpointer 提供的是图状态快照，不代表外部副作用恰好执行一次。节点重试或从检查点恢复时，邮件、支付、写库可能重复。副作用节点应使用业务幂等键、资源版本、outbox 或可补偿操作，并把外部结果 ID 写回状态。

状态 schema 需要版本。上线新图前要回答：旧 checkpoint 能否由新代码读取；已等待审批的运行应继续旧图还是迁移；节点重命名和 reducer 变化如何处理。长任务还应设计取消、截止时间、保留期限和敏感字段清理。

同一个 `thread_id` 的并发更新要定义冲突策略，不能假设 checkpointer 自动串行化所有业务请求。`thread_id` 也不能直接由不可信用户随意指定，否则可能读取他人状态。

## 十、常见坑

- **简单任务过度建图**：图、checkpoint 与状态迁移成本高于业务收益。
- **节点直接修改原 state**：破坏 reducer 合并和重放推理，节点应返回局部更新。
- **使用 `eval` 实现计算工具**：模型参数可变成任意代码执行，使用原子化白名单工具。
- **把 MemorySaver 当持久存储**：进程结束即丢失，只适合开发测试。
- **恢复时重复副作用**：checkpointer 不是分布式事务，需要幂等和补偿。
- **审批只保存 `resume=True`**：没有绑定工具、参数和资源版本，批准后动作可能被替换。
- **按旧教程使用弃用 API**：LangGraph/LangChain 演进快，示例必须声明并锁定版本。
- **无限消息 state**：checkpoint 体积、token 和隐私风险持续增长，应做裁剪与保留策略。

## 十一、选型与上线检查清单

- [ ] 任务是否确实需要循环、分支、持久恢复或人工中断？
- [ ] state 字段、reducer、schema 版本和迁移策略是否明确？
- [ ] 每条循环是否有步数、时间、成本和失败终止条件？
- [ ] checkpoint 后端是否匹配多实例、备份、加密与保留需求？
- [ ] 所有外部副作用是否可幂等、审计、恢复或补偿？
- [ ] 审批是否绑定规范化参数、资源版本、审批人和有效期？
- [ ] 并发 `thread_id` 的隔离、授权与冲突是否经过测试？
- [ ] 是否覆盖 crash、重试、取消、旧 checkpoint 恢复和滚动升级？

## 十二、快速上手清单

1. 安装：`pip install langgraph langgraph-checkpoint-sqlite langchain-openai`
2. 定义 `State`（对话场景直接用 `MessagesState` + `add_messages`）。
3. 写节点函数（入参 state，返回更新字典）。
4. 用 `add_node` / `add_edge` / `add_conditional_edges` 组装图。
5. 有记忆/审批需求时传入 `checkpointer`（如 `MemorySaver` / `SqliteSaver`），并带上 `thread_id`。
6. `compile()` 后 `invoke` / `stream` 运行。
7. 常规工具 Agent 先评估 LangChain `create_agent`；需要自定义状态与控制流再下沉 LangGraph。

LangGraph 把"编排逻辑"显式交给开发者：你定义状态、节点和边，框架负责调度、持久化与恢复。掌握本文的 StateGraph、State/reducer、普通/条件边、Checkpointer、interrupt 与 tools 循环，即可构建绝大多数生产级 Agent。

## 参考来源

- LangGraph 官方文档：<https://docs.langchain.com/oss/python/langgraph/overview>
- LangGraph v1 迁移指南：<https://docs.langchain.com/oss/python/migrate/langgraph-v1>
- LangGraph GitHub 仓库：[github.com/langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- LangGraph Python SDK（PyPI）：[pypi.org/project/langgraph](https://pypi.org/project/langgraph/)
- LangChain 文档 — Tools / Function Calling：[python.langchain.com](https://python.langchain.com/docs/concepts/tools)
