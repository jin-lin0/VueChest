---
group: 综合与扩展
order: 34
---

# AI 应用前端实战（流式渲染 / SSE / 打字机）

> 大模型最打动人的体验是"边生成边显示"。本文讲 Vue 前端如何消费流式输出：从 SSE / fetch-stream 到打字机渲染、中断、工具调用可视化与错误兜底，可直接套用到 VueChest 的 AI 对话模块。

## 一、两种流式协议

| 方式                          | 机制                                                 | 前端消费                                    |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| **SSE**（Server-Sent Events） | 服务端 `Content-Type: text/event-stream`，单向长连接 | `EventSource` 或 `fetch` + `ReadableStream` |
| **Fetch Stream**              | 单次 POST，响应体是 chunked `ReadableStream`         | `response.body.getReader()` 逐块读          |

> OpenAI / Anthropic / 国内大模型多数用 fetch-stream；SSE 多用于纯文本推送。VueChest 服务端中转走 fetch-stream，前端用 `ReadableStream` 读。

## 二、用 fetch-stream 消费分片

```ts
async function* readSse(response: Response): AsyncGenerator<unknown> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (!response.body) throw new Error('响应体不支持流式读取')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })

      // 网络 chunk 与 SSE event 没有一一对应关系，必须保留半包。
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''

      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')

        if (!data) continue
        if (data === '[DONE]') return
        yield JSON.parse(data)
      }

      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}

type ProviderEvent = { type: 'text'; text: string } | { type: 'other'; raw: unknown }

function parseProviderEvent(raw: unknown): ProviderEvent {
  const event = raw as { choices?: Array<{ delta?: { content?: unknown } }> }
  const text = event.choices?.[0]?.delta?.content
  return typeof text === 'string' ? { type: 'text', text } : { type: 'other', raw }
}

async function streamChat(
  messages: ChatMsg[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  for await (const event of readSse(res)) {
    const delta = parseProviderEvent(event)
    if (delta.type === 'text') {
      onDelta(delta.text)
    }
  }
}
```

要点：`TextDecoder` 的流式解码保证多字节字符不被截断；buffer 处理跨 chunk 的半条事件；同一事件允许多个 `data:` 行。供应商事件结构放进独立 adapter，UI 不直接依赖某一家响应字段。生产代码还要决定末尾没有空行的残留是报协议错误还是按约定解析。

## 三、打字机渲染（Vue 组合式写法）

用 `ref` 累积文本，`onDelta` 直接 push，Vue 的响应式会自动更新视图，无需手动 `innerHTML`。

```ts
import { ref } from 'vue'

export function useStreamingReply() {
  const reply = ref('')
  const streaming = ref(false)
  let controller: AbortController | null = null
  let requestId = 0

  async function send(messages: ChatMsg[]) {
    controller?.abort()
    const currentId = ++requestId
    controller = new AbortController()
    reply.value = ''
    streaming.value = true
    try {
      await streamChat(
        messages,
        (text) => {
          if (currentId === requestId) reply.value += text
        },
        controller.signal,
      )
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    } finally {
      if (currentId === requestId) {
        streaming.value = false
        controller = null
      }
    }
  }
  function stop() {
    controller?.abort()
  }

  return { reply, streaming, send, stop }
}
```

> 每次请求都要创建新的 controller；AbortController abort 后不能复用。只取消仍不足以阻止已经排队的回调，所以示例再用 request ID 防止旧流写入新消息。若单条消息很长，用 buffer + `requestAnimationFrame` 批量更新响应式文本。

## 四、中断生成

用户点"停止"时调用 `AbortController.abort()`，让底层 `fetch` 抛 `AbortError` 并断开流。务必在 `catch` 区分"用户主动中断"和"真实错误"，前者不弹错误提示。

```ts
try {
  await fetch(url, { signal: controller.signal, ... })
} catch (e) {
  if (e.name === 'AbortError') return // 主动停止，静默
  throw e
}
```

## 五、工具调用（Tool Use）可视化

Agent 流程里模型会先返回 `tool_calls`，前端可渲染成"思考中 / 调用工具：xxx / 结果"的卡片时间线，再继续拼装最终回答。

```ts
// 简化状态机
type Phase = 'idle' | 'thinking' | 'tool' | 'streaming' | 'done' | 'error'
```

建议：工具调用阶段展示工具名 + 入参摘要（避免泄露敏感 key），结果阶段展示"已获取 N 条数据"而非原始 payload，既直观又安全。

## 六、错误兜底与降级

- **网络/超时**：捕获后展示友好提示 + "重试"按钮；首字延迟（TTFT）过长显示骨架/加载动画。
- **协议异常**：区分心跳、未知事件和损坏 JSON；记录采样日志。不能一律静默跳过，否则用户会看到内容缺失却没有错误。
- **内容安全拦截**：后端返回 4xx（合规）时，前端展示"该内容已被拦截"而非红屏。
- **断线重连**：短暂网络抖动可自动重连用 `ReadableStream` 续传（需后端支持 cursor/resume）。

## 七、性能与体验细节

- 用 `keep-alive` 缓存对话列表组件，避免切回丢失滚动位置。
- 长对话用虚拟列表（如 `vue-virtual-scroller`）防止 DOM 爆炸。
- 打字机阶段禁用输入框提交或排队，避免并发流错乱。
- Markdown 渲染（VueChest 用 `marked` + `highlight.js`）要在"流式"中增量解析，可用防抖避免每 token 全量重排。

## 八、工具调用状态与安全边界

流式响应不是只有文本。前端应把 response/item、text delta、tool arguments delta、tool result、completed、failed 等事件归一化为自己的判别联合，再由 reducer/state machine 推进状态。工具参数可能分片到达，必须等“参数完成”事件后再解析；工具执行权限由服务端决定，前端卡片只负责展示与用户确认。

模型输出、工具名、参数和引用都不可信。Markdown 最终 HTML 要消毒；链接限制协议；工具参数按字段脱敏；“确认执行”卡片展示实际影响对象和不可逆性，而不是原样渲染模型生成的说明。密钥始终放在服务端中转，浏览器不能直连需要长期凭证的模型 API。

## 九、常见坑与排障

- **按 chunk 直接 `JSON.parse`**：chunk 可含半条或多条事件，必须 buffer。
- **只 abort 不校验请求身份**：旧回调仍可能在切换会话后落盘，增加 session/request ID 二次校验。
- **把取消显示成失败**：用户主动停止是正常状态，可保留已生成内容并标记 stopped。
- **每 token 全量 Markdown 渲染**：会重复解析和布局；按帧/时间片刷新，结束后做完整渲染。
- **自动滚动抢用户位置**：只有用户仍接近底部时跟随；用户上滚后显示“回到底部”。
- **失败留下空 assistant 消息**：创建占位、提交完成和异常回滚要作为一次状态事务设计。
- **重试重复执行工具**：恢复协议需要 cursor/event ID，工具调用还要幂等键；后端不支持时不能假装可无损续传。

## 十、流式交互检查清单

1. 非 2xx、空 body、CRLF、半包、多事件、多行 data、结束标记和损坏 JSON 都有测试。
2. 新请求、切会话、离开页面和停止按钮会取消资源，并阻止旧流脏写。
3. 文本、推理摘要、工具参数、工具结果和错误使用显式事件类型。
4. 渲染按帧合并，长列表虚拟化，自动滚动尊重用户操作。
5. Markdown、链接和工具卡片按不可信内容处理，高风险工具要求服务端授权和用户确认。
6. 记录 TTFT、总时长、中止率、解析错误和工具失败率，但不采集敏感 prompt 原文。

## 十一、小结

- 流式消费核心是 `ReadableStream.getReader()` + `TextDecoder({stream:true})`，中文不乱码。
- 响应式 `ref` 累积即可实现打字机，不必操作 DOM。
- 中断 = `AbortController`；错误要区分"主动中断 vs 真实失败"。
- 工具调用、降级、虚拟列表决定 AI 前端的"高级感"。

## 参考来源

- MDN Streams API：<https://developer.mozilla.org/zh-CN/docs/Web/API/Streams_API>
- MDN EventSource（SSE）：<https://developer.mozilla.org/zh-CN/docs/Web/API/EventSource>
- OpenAI Streaming 文档：<https://platform.openai.com/docs/guides/streaming>
- OpenAI Responses 流式事件参考：<https://platform.openai.com/docs/api-reference/responses-streaming>
- Anthropic Streaming：<https://docs.anthropic.com/en/docs/build-with-claude/streaming>
