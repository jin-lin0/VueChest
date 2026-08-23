---
group: 工具与协议
order: 42
---

# Function Calling 与 Tool Use 实战

> 适用场景：让 LLM 调用你定义的函数（查天气、查库、发消息）。本文讲 tool schema、多模型兼容、并行调用、错误兜底，以及与 Agent 的协作。
> 阅读前提：了解 MCP（见 `mcp`）、Agent 模式（见 `agent-patterns`）。

Function Calling（工具调用）是 LLM「连接现实世界」的核心机制：应用向模型声明工具契约，模型只生成“调用哪个工具、参数是什么”的意图；真正的鉴权、校验、执行和审计始终由受信任的应用完成。它不是远程代码执行授权。

## 一、定义 Tool（Schema 驱动）

主流模型平台都能用结构化 schema 描述工具，但消息块、并行调用、严格校验和结果回填格式并不完全相同。业务层应维护一份内部契约，再由 provider adapter 转换，而不是把某家 SDK 类型扩散到整个系统。

```json
{
  "name": "get_weather",
  "description": "查询指定城市的当前天气",
  "parameters": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "城市名，如 深圳" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["city"]
  }
}
```

> 写好 `description` 和参数 `description` 极其重要——模型靠它们「理解」何时用、怎么填。描述含糊 → 模型乱调或漏调。

## 二、调用流程（请求 → 模型决策 → 执行 → 回填）

下面用 provider-neutral 伪接口展示正确循环。模型的 assistant 消息一轮只追加一次，每个调用结果再按调用 ID 回填，避免多工具时重复写入历史：

```ts
type ToolCall = { id: string; name: string; input: unknown }

const registry = {
  get_weather: {
    effect: 'read',
    parse: parseWeatherArgs,
    execute: getWeather,
  },
} as const

async function runAgentTurn(userId: string, input: string) {
  const messages = [{ role: 'user', content: input }]

  for (let step = 0; step < 8; step += 1) {
    const turn = await model.generate({ messages, tools: toolSchemas })
    messages.push(turn.assistantMessage)

    const calls: ToolCall[] = normalizeToolCalls(turn)
    if (calls.length === 0) return turn.text

    for (const call of calls) {
      const tool = registry[call.name as keyof typeof registry]
      if (!tool) {
        messages.push(toolResult(call.id, { ok: false, code: 'UNKNOWN_TOOL' }))
        continue
      }

      try {
        await authorize(userId, call.name, tool.effect)
        const args = tool.parse(call.input)
        const data = await withTimeout(tool.execute(args), 10_000)
        messages.push(toolResult(call.id, { ok: true, data }))
      } catch (error) {
        messages.push(toolResult(call.id, toSafeToolError(error)))
      }
    }
  }

  throw new Error('Agent exceeded the maximum tool steps')
}
```

`tool_choice`、强制调用和 strict schema 的字段以具体平台文档为准；上层运行时不应假设所有 provider 支持完全相同的模式。

## 三、多模型兼容

不同厂商字段略有差异，但语义一致。落地建议：

- **抽象一层 adapter**：把“工具定义 / 请求 / 调用块 / 结果块”归一化，底层切换模型时不改业务。VueChest 的 AI 对话已经在服务端维护 provider 元数据，这类边界可继续扩展成统一 tool adapter。
- 解析时统一处理 `tool_calls` 数组（OpenAI）或 `tool_use` blocks（Anthropic），归一化成 `{ name, args, id }` 再执行。
- 错误兜底要覆盖：参数 JSON 解析失败、必填缺失、tool 执行抛错。

## 四、并行调用

部分模型支持一轮返回多个调用（如同时查两个城市）。只有当工具之间无依赖、执行顺序不影响结果、并发量受控时才适合并行：

```ts
const settled = await Promise.allSettled(
  independentReadCalls.map((call) => limit(() => executeTool(call))),
)
```

写操作即使“互不依赖”，也可能竞争同一资源。更稳妥的默认值是：只并行只读工具；写工具使用幂等键、版本条件或串行事务，并把部分成功状态明确回填。

## 五、错误兜底与健壮性

```ts
async function safeExecute(call): Promise<string> {
  try {
    const args = JSON.parse(call.function.arguments)
    const result = await runTool(call.function.name, args)
    return JSON.stringify(result)
  } catch (e) {
    // 把错误也回填，让模型知道失败了、自行换方案或向用户说明
    return JSON.stringify({ error: String(e), retriable: true })
  }
}
```

兜底清单：

- **参数非法**：catch 后回填错误，让模型重试或改参（别直接崩溃）。
- **tool 超时**：设超时（如 10s），超时返回「工具响应超时」，避免卡死整个对话。
- **敏感/危险操作**：执行前加权限校验（见 `agent-security`），如「删库」类 tool 需用户二次确认。
- **结果过大**：截断或摘要后再回填，避免撑爆上下文。

错误结果应使用稳定机器码、可安全展示的信息和 `retriable` 标记。不要把堆栈、SQL、内部 URL 或访问令牌原样喂给模型；模型会把工具结果当作不可信外部输入继续处理。

## 六、与 Agent 的关系

在 Agent（见 `agent-patterns`）里，Function Calling 是最基础的「动作执行器」：

```
感知(用户输入) → 规划(模型推理) → 行动(tool_calls 执行) → 观察(回填结果) → 再推理…
```

- ReAct、Plan-and-Execute 等模式都建立在「模型产出 tool 调用 → 环境执行 → 结果反馈」的循环上。
- MCP（见 `mcp`）是把「tool 的定义与执行」标准化、可复用的上位方案；Function Calling 是各模型原生的底层能力。
- 评估工具调用质量：可用 `rag-evaluation` 类似思路，看「是否调对了 tool、参数对不对、最终结果是否正确」。

## 七、工具契约设计

一个生产级工具至少应定义：名称与用途、输入 schema、输出 envelope、副作用级别、权限范围、超时、幂等语义和版本。设计时遵循：

- 工具名用稳定业务动作，如 `order.lookup`、`draft.create`，避免模糊的 `do_task`。
- 参数尽量使用枚举、范围、格式和必填约束，减少模型猜测空间。
- 把“搜索订单”和“退款订单”拆开，使只读与高风险写操作能采用不同授权。
- 输出返回结构化 ID、状态和必要字段；大文档存对象存储，只回传摘要与受控引用。
- schema 发生破坏性变化时发布新版本，旧会话和回放任务仍能找到原契约。

工具描述是模型路由提示，不是安全控制。即使模型产生了 schema 合法参数，服务端仍须进行业务校验，例如用户是否拥有该订单、金额是否在可退款范围、资源版本是否仍一致。

## 八、安全与人在回路

可按副作用分级：

| 级别 | 示例               | 默认控制                                     |
| ---- | ------------------ | -------------------------------------------- |
| 只读 | 搜索、查询天气     | 身份与租户过滤、速率限制                     |
| 可逆 | 创建草稿、修改标签 | 审计日志、幂等键、版本检查                   |
| 外部 | 发邮件、发布内容   | 执行前展示目标与预览，用户确认               |
| 高危 | 付款、删除、改权限 | 强认证、双人或显式审批、最小权限、可恢复设计 |

审批必须绑定工具名、规范化参数、资源版本和过期时间。用户确认后若模型可以偷偷换参数，所谓 human-in-the-loop 就没有意义。工具凭据只保存在执行端，不能出现在 system prompt、浏览器或工具结果中。

## 九、可观测性与测试

每次调用记录 `trace_id`、模型轮次、tool_call_id、工具版本、参数摘要、授权结果、耗时、状态码、重试与副作用结果，并对敏感字段脱敏。评估集至少覆盖：

1. 应该调用、无需调用和工具选择冲突。
2. 必填缺失、枚举越界、未知工具和格式破损。
3. 超时、限流、部分成功、重复回填和结果过大。
4. 越权参数、提示词注入、工具结果中的恶意指令。
5. 高风险操作是否可靠触发确认，确认后参数是否被冻结。

指标不要只看“最终回答像不像”：还要统计工具选择准确率、参数准确率、任务成功率、平均步骤数、无效重试、P95 延迟、单任务成本和未经确认的副作用次数。

## 十、常见坑与上线检查清单

常见坑包括：把 JSON Schema 校验当授权；把工具异常当普通文本导致模型无限重试；多调用时重复追加 assistant 消息；并行执行有依赖的写操作；直接把数据库对象和敏感堆栈回填；没有最大步数、超时与全局预算。

上线前逐项确认：

- [ ] provider adapter 是否保留调用 ID、顺序和平台特有停止原因？
- [ ] 输入是否 schema 校验后再做权限、租户和业务规则校验？
- [ ] 高风险副作用是否绑定参数进行审批，并支持幂等与恢复？
- [ ] 并行只用于明确独立的操作，部分失败是否可表达？
- [ ] 工具结果是否限长、脱敏并被视为不可信内容？
- [ ] 是否设置轮次、时间、token、并发和花费上限？
- [ ] trace 是否能从用户请求追到每次工具执行和最终结果？

## 参考来源

- OpenAI Function Calling：<https://platform.openai.com/docs/guides/function-calling>
- Anthropic Tool Use：<https://docs.anthropic.com/en/docs/build-with-claude/tool-use>
- Google Gemini Function Calling：<https://ai.google.dev/gemini-api/docs/function-calling>
- JSON Schema 规范：<https://json-schema.org/>
