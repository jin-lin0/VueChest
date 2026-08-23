---
group: 工具与协议
order: 43
---

# MCP 入门（Model Context Protocol）

> 适用场景：让 LLM/Agent 安全、标准化地连接外部工具与数据源。本文讲协议结构、与 Agent 的关系、传输方式与生态。
> 阅读前提：了解 Agent 与 Tool Use（见 `agent-patterns`、即将补的 Function Calling 文章）。

MCP（Model Context Protocol，模型上下文协议）是 2024 年底提出并持续演进的**开放标准**，目标是把「LLM ↔ 工具/数据」的连接从「每家各写一套适配」变成可复用协议——类似 USB 之于外设。

## 一、为什么需要 MCP

没有标准时，每接一个数据源（数据库、文件系统、API）都要为「某个模型 + 某个框架」写定制胶水代码。MCP 把这套连接抽象成三层角色：

```
┌─────────────┐    MCP    ┌──────────────┐    MCP    ┌─────────────┐
│  Host      │◀─────────▶│   Client(s)  │◀─────────▶│   Server    │
│ (宿主应用)  │           │ (协议客户端) │           │ (能力提供方) │
│ Claude桌面  │           │ 每 server 一  │           │ 文件系统/DB/ │
│ /IDE/Agent  │           │ 个 client     │           │ Slack/API   │
└─────────────┘           └──────────────┘           └─────────────┘
```

- **Host（宿主）**：运行 LLM 的应用，如 Claude 桌面端、IDE 插件、你自己的 Agent。用户在这里发起任务。
- **Client（客户端）**：Host 内嵌的协议客户端，**每个 Server 对应一个 Client**，负责维持 1:1 连接。
- **Server（服务端）**：把某个能力（读文件、查数据库、调 API）按 MCP 规范暴露出来的程序，可本地进程或远程服务。

> 关键抽象：Server 只声明「我能提供什么能力」，Host 负责「何时、如何调用」。能力分三类（见下）。

## 二、Server 暴露的三类能力（Primitives）

| 能力          | 方向                  | 说明                                      | 类比              |
| ------------- | --------------------- | ----------------------------------------- | ----------------- |
| **Tools**     | Server → LLM（可调）  | 可被执行的函数（带 schema），LLM 决定调用 | 函数调用 / Action |
| **Resources** | Server → LLM（可读）  | 类文件的数据（文档、记录），供上下文注入  | 只读数据源        |
| **Prompts**   | Server → 用户（可选） | 预置的提示词模板，用户主动触发            | 快捷指令          |

> 对 Agent 开发者：绝大多数场景用 **Tools**（让模型「做事」）；Resources 用于把知识「喂给」模型；Prompts 用于复用最佳实践。一个 Server 可同时暴露多类能力。

## 三、传输方式（Transport）

Client 与 Server 通过哪种通道通信：

- **stdio（标准输入输出）**：Server 作为本地子进程，通过 stdin/stdout 通信。**本地工具（读文件、本地脚本）首选**，最简单、无需网络。
- **Streamable HTTP**：Server 跑在远端，通过 HTTP POST 交换消息，并可选用 SSE 返回流式事件，是当前远程方案。
- **旧 HTTP+SSE transport**：早期独立方案，已被 Streamable HTTP 取代；这不表示 SSE 作为 Streamable HTTP 的可选流式机制被禁用。

> 注意版本漂移：新接入通常选择 Streamable HTTP 或 stdio。不要把旧版独立 SSE transport 与 Streamable HTTP 内可选的 SSE 响应混为一谈。

### 2026-07-28 的发现与版本模型

当前规范的核心协议是无状态的，不再依赖旧版“初始化后维持协议会话”的心智模型：

- 每个请求通过 `_meta` 携带协议版本、客户端身份与 capabilities。
- Server 必须实现 `server/discover`；Client 可调用它集中获取 Server 身份、支持版本与能力，也可以直接发业务请求后处理版本错误。
- Tools / Resources / Prompts 仍通过 `*/list` 发现；工具通过 `tools/call` 执行。
- 实现必须钉住协议版本，兼容旧 Server 时显式走适配层，不要混用不同版本消息。

## 四、与 Agent 的关系

MCP **不是** Agent 框架，而是 Agent 的「工具接入层」：

```
用户意图
  └─> Agent（编排/推理，见 agent-patterns）
        └─> 通过 MCP Client 发现并调用各 Server 的 Tools
              ├─> Filesystem Server（读项目文件）
              ├─> Database Server（查数据）
              └─> Slack Server（发消息）
```

- Agent 负责「思考与决策」，MCP 负责「标准化执行外部动作」。
- 多个 Agent 框架（LangGraph、AutoGPT 等）都能把 MCP Server 当作 tool 接入，互不绑定。
- 好处：写一个 Postgres MCP Server，所有支持 MCP 的 Agent 都能直接复用，不用为每个框架重写。

## 五、安全要点

- **权限边界**：Host 应在调用前向用户确认（尤其写操作），Server 不应越权访问未授权资源。
- **最小化暴露**：Server 只暴露必要能力，敏感操作加确认/审计。
- **传输安全**：远程 Server 用 Streamable HTTP + 鉴权（token/header），stdio 仅限本地可信进程。
- 与 OWASP LLM Top 10（2025）结合看：MCP 的 tool 调用要避免被提示词注入劫持去执行危险动作（见后续「Agent 安全」文章）。

## 六、动手示意（最简 Server，Python）

```python
# server.py —— 用官方 SDK 暴露一个加法 tool
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("demo")

@mcp.tool()
def add(a: int, b: int) -> int:
    """返回两数之和"""
    return a + b

if __name__ == "__main__":
    mcp.run()  # 默认 stdio
```

Host 侧只要「连上这个 server」，LLM 就能在推理中调用 `add`。把 `stdio` 换成 HTTP 部署，即变成远程可复用服务。

## 七、生态现状（2026）

- 官方与社区 Server 快速增长：文件系统、GitHub、Slack、Postgres、浏览器自动化等均有现成 Server。
- 主流 Agent 框架与 IDE（Claude、Cursor 等）已原生支持 MCP Client。
- 规范仍在演进，关注 `modelcontextprotocol` 官方仓库的版本说明，避免照抄过时的 SSE 教程。

## 参考来源

- MCP 当前架构文档：<https://modelcontextprotocol.io/docs/learn/architecture>
- 2026-07-28 规范：<https://modelcontextprotocol.io/specification/2026-07-28/architecture>
- MCP 介绍博客（Anthropic）：<https://www.anthropic.com/news/model-context-protocol>
- Python SDK：<https://github.com/modelcontextprotocol/python-sdk>
