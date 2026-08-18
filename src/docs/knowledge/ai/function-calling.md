---
group: 工具与协议
order: 42
---

# Function Calling 与 Tool Use 实战

> 适用场景：让 LLM 调用你定义的函数（查天气、查库、发消息）。本文讲 tool schema、多模型兼容、并行调用、错误兜底，以及与 Agent 的协作。
> 阅读前提：了解 MCP（见 `mcp`）、Agent 模式（见 `agent-patterns`）。

Function Calling（工具调用）是 LLM「连接现实世界」的核心机制：你给模型一堆「带 schema 的函数描述」，模型在推理时决定「调哪个、传什么参」，你执行后把结果喂回去，模型再据此生成最终回答。

## 一、定义 Tool（Schema 驱动）

主流厂商（OpenAI / Anthropic / Gemini）都支持 JSON Schema 描述工具，结构高度一致：

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

```ts
// 以 OpenAI 风格为例
const tools = [getWeatherSchema]
const messages = [{ role: 'user', content: '深圳今天天气怎样？' }]

// 1) 带上 tools 请求
let res = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools,
  tool_choice: 'auto', // 让模型自己决定要不要调
})

// 2) 模型返回 tool_calls（而不是直接回答）
const msg = res.choices[0].message
if (msg.tool_calls) {
  // 3) 本地执行每个 tool
  for (const call of msg.tool_calls) {
    const args = JSON.parse(call.function.arguments)
    const result = await getWeather(args.city, args.unit) // 你自己的函数
    messages.push(msg) // 先存模型的「调用意图」消息
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(result),
    })
  }
  // 4) 把结果回填，再请求一次 → 这次模型给出基于真实数据的回答
  res = await client.chat.completions.create({ model, messages, tools })
}
const finalAnswer = res.choices[0].message.content
```

> 关键点：**tool 的真实执行永远在你这边**（服务端），模型只产出「调用意图」。`tool_choice: 'auto'` 让模型按需调用；`required` 可强制必调；指定函数名则只调那个。

## 三、多模型兼容

不同厂商字段略有差异，但语义一致。落地建议：

- **抽象一层 adapter**：把「工具定义 / 请求 / 解析 tool_calls」包成统一接口，底层切换 OpenAI/Anthropic/本地模型不改业务。VueChest 的 AI 对话就是在服务端做这层中转（`config/aiProviders.js` 的 `PROVIDER_META` 加平台）。
- 解析时统一处理 `tool_calls` 数组（OpenAI）或 `tool_use` blocks（Anthropic），归一化成 `{ name, args, id }` 再执行。
- 错误兜底要覆盖：参数 JSON 解析失败、必填缺失、tool 执行抛错。

## 四、并行调用

现代模型支持一轮返回多个 `tool_calls`（如「查深圳和北京天气」→ 两个调用）。执行时**并行**跑再统一回填，比串行快：

```ts
const results = await Promise.all(
  msg.tool_calls.map((c) => executeTool(c)), // 并行执行
)
```

> 注意幂等：并行 tool 不要有依赖顺序；有依赖的（B 要用 A 的结果）应串行或拆成多轮。

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

## 六、与 Agent 的关系

在 Agent（见 `agent-patterns`）里，Function Calling 是最基础的「动作执行器」：

```
感知(用户输入) → 规划(模型推理) → 行动(tool_calls 执行) → 观察(回填结果) → 再推理…
```

- ReAct、Plan-and-Execute 等模式都建立在「模型产出 tool 调用 → 环境执行 → 结果反馈」的循环上。
- MCP（见 `mcp`）是把「tool 的定义与执行」标准化、可复用的上位方案；Function Calling 是各模型原生的底层能力。
- 评估工具调用质量：可用 `rag-evaluation` 类似思路，看「是否调对了 tool、参数对不对、最终结果是否正确」。

## 参考来源

- OpenAI Function Calling：<https://platform.openai.com/docs/guides/function-calling>
- Anthropic Tool Use：<https://docs.anthropic.com/en/docs/build-with-claude/tool-use>
- Google Gemini Function Calling：<https://ai.google.dev/gemini-api/docs/function-calling>
- JSON Schema 规范：<https://json-schema.org/>
