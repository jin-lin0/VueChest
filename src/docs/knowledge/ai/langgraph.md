---
group: Agent 基础
order: 36
---

# LangGraph 入门与核心概念

LangGraph 是 LangChain 团队开源的 **LLM 智能体（Agent）编排库**。它把 Agent 的执行过程建模为一张有向图：节点（Node）负责计算，边（Edge）负责控制流，所有节点共享一个状态（State）对象。相比传统“线性链（Chain）”，LangGraph 最大的特点是 **原生支持循环、分支和状态持久化**，非常适合构建需要多轮推理、工具调用、人类审批的 Agent。

> 本文基于 LangGraph v1.0（稳定版，2025-10 发布）的 API 编写，使用 Python 3.10+。核心导入路径：`from langgraph.graph import StateGraph, START, END`。

## 一、为什么需要 LangGraph

| 能力              | 传统线性 Chain | LangGraph                                |
| ----------------- | -------------- | ---------------------------------------- |
| 执行结构          | 只能顺序执行   | 支持 **循环 / 分支 / 并行**              |
| 状态管理          | 无内建状态     | 显式 **State** 对象，可被 reducer 合并   |
| 持久化与记忆      | 需自行拼接     | **Checkpointer** 自动存快照              |
| 断点续跑          | 不支持         | 中断后可恢复                             |
| Human-in-the-loop | 需手动实现     | `interrupt_before/after` 一等公民        |
| 工具调用循环      | 需手写         | `tools_condition` / `create_react_agent` |

当你需要让模型“先思考→调工具→看结果→再思考”这种 ReAct 循环时，LangGraph 几乎是必不可少的。

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
- `Annotation.Root`：当你需要“整体替换某字段”的特殊语义时使用，普通场景用 `Annotated[Type, reducer]` 即可。

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

### 5.2 SqliteSaver（单机生产）

```python
from langgraph.checkpoint.sqlite import SqliteSaver

with SqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    graph = builder.compile(checkpointer=checkpointer)
    graph.invoke({"messages": [...]}, config={"configurable": {"thread_id": "s1"}})
```

生产环境优先使用 `SqliteSaver`（文件持久化）或 `PostgresSaver`（分布式共享）。

### 5.3 断点续跑与时间旅行

每个节点执行后都会自动存一份状态快照。可查看历史并回到任意快照重跑：

```python
states = list(graph.get_state_history(config))
past = states[2]                       # 取出第 3 个检查点
graph.invoke(None, past.config)        # 从该状态继续
```

## 六、Human-in-the-loop（人在回路）

对于发邮件、删数据、转账等高风险操作，应在执行前暂停等待人工审批。方式是编译时指定 `interrupt_before`（节点执行前暂停）或 `interrupt_after`（节点执行后暂停）。

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
def calculator(expr: str) -> str:
    """计算数学表达式。"""
    return str(eval(expr))

tools = [get_weather, calculator]
model = ChatOpenAI(model="gpt-4o-mini")
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

更简洁的写法是用预置工厂 `create_react_agent`，它内部就是上面的两张节点 + 三条边：

```python
from langgraph.prebuilt import create_react_agent

agent = create_react_agent(
    model,
    tools=tools,
    checkpointer=MemorySaver(),
)

config = {"configurable": {"thread_id": "demo"}}
for chunk in agent.stream(
    {"messages": [HumanMessage("北京天气如何？再算一下 1337 * 42")]},
    config=config,
    stream_mode="values",
):
    print(chunk["messages"][-1].content)
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

## 九、快速上手清单

1. 安装：`pip install langgraph langgraph-checkpoint-sqlite langchain-openai`
2. 定义 `State`（对话场景直接用 `MessagesState` + `add_messages`）。
3. 写节点函数（入参 state，返回更新字典）。
4. 用 `add_node` / `add_edge` / `add_conditional_edges` 组装图。
5. 有记忆/审批需求时传入 `checkpointer`（如 `MemorySaver` / `SqliteSaver`），并带上 `thread_id`。
6. `compile()` 后 `invoke` / `stream` 运行。
7. 工具 Agent 可直接用 `create_react_agent(model, tools=...)` 快速起手。

LangGraph 把"编排逻辑"显式交给开发者：你定义状态、节点和边，框架负责调度、持久化与恢复。掌握本文的 StateGraph、State/reducer、普通/条件边、Checkpointer、interrupt 与 tools 循环，即可构建绝大多数生产级 Agent。

## 参考来源

- LangGraph 官方文档：[langchain-ai.github.io/langgraph](https://langchain-ai.github.io/langgraph/)
- LangGraph GitHub 仓库：[github.com/langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- LangGraph Python SDK（PyPI）：[pypi.org/project/langgraph](https://pypi.org/project/langgraph/)
- LangChain 文档 — Tools / Function Calling：[python.langchain.com](https://python.langchain.com/docs/concepts/tools)
