# AI 应用前端实战（流式渲染 / SSE / 打字机）

> 大模型最打动人的体验是"边生成边显示"。本文讲 Vue 前端如何消费流式输出：从 SSE / fetch-stream 到打字机渲染、中断、工具调用可视化与错误兜底，可直接套用到 VueChest 的 AI 对话模块。

## 一、两种流式协议

| 方式 | 机制 | 前端消费 |
| --- | --- | --- |
| **SSE**（Server-Sent Events） | 服务端 `Content-Type: text/event-stream`，单向长连接 | `EventSource` 或 `fetch` + `ReadableStream` |
| **Fetch Stream** | 单次 POST，响应体是 chunked `ReadableStream` | `response.body.getReader()` 逐块读 |

> OpenAI / Anthropic / 国内大模型多数用 fetch-stream；SSE 多用于纯文本推送。VueChest 服务端中转走 fetch-stream，前端用 `ReadableStream` 读。

## 二、用 fetch-stream 消费分片

```ts
// 逐 token 渲染聊天消息
async function streamChat(messages: ChatMsg[], onDelta: (t: string) => void) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.body) throw new Error('no stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    // SSE 形如 "data: {...}\n\n"，需按 \n\n 切分解析
    for (const line of chunk.split('\n\n')) {
      if (!line.startsWith('data:')) continue
      const json = JSON.parse(line.slice(5).trim())
      onDelta(json.choices?.[0]?.delta?.content ?? '')
    }
  }
}
```

要点：`TextDecoder` 的 `stream: true` 保证多字节字符（中文）不被截断；`data:` 行可能有内嵌换行，按协议边界（空行）切分。

## 三、打字机渲染（Vue 组合式写法）

用 `ref` 累积文本，`onDelta` 直接 push，Vue 的响应式会自动更新视图，无需手动 `innerHTML`。

```ts
import { ref } from 'vue'

export function useStreamingReply() {
  const reply = ref('')
  const streaming = ref(false)
  const controller = new AbortController()

  async function send(messages: ChatMsg[]) {
    reply.value = ''
    streaming.value = true
    try {
      await streamChat(messages, (t) => { reply.value += t }) // 直接拼接，响应式驱动
    } finally {
      streaming.value = false
    }
  }
  function stop() { controller.abort(); streaming.value = false }

  return { reply, streaming, send, stop }
}
```

> 若单条消息过长导致频繁重渲染卡顿，可用 `requestAnimationFrame` 节流拼接到 DOM（先存缓冲，rAF 中 flush）。

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
- **协议异常**：流中混入非 JSON 行要 try/catch 跳过单条，不整段崩溃。
- **内容安全拦截**：后端返回 4xx（合规）时，前端展示"该内容已被拦截"而非红屏。
- **断线重连**：短暂网络抖动可自动重连用 `ReadableStream` 续传（需后端支持 cursor/resume）。

## 七、性能与体验细节

- 用 `keep-alive` 缓存对话列表组件，避免切回丢失滚动位置。
- 长对话用虚拟列表（如 `vue-virtual-scroller`）防止 DOM 爆炸。
- 打字机阶段禁用输入框提交或排队，避免并发流错乱。
- Markdown 渲染（VueChest 用 `marked` + `highlight.js`）要在"流式"中增量解析，可用防抖避免每 token 全量重排。

## 八、小结

- 流式消费核心是 `ReadableStream.getReader()` + `TextDecoder({stream:true})`，中文不乱码。
- 响应式 `ref` 累积即可实现打字机，不必操作 DOM。
- 中断 = `AbortController`；错误要区分"主动中断 vs 真实失败"。
- 工具调用、降级、虚拟列表决定 AI 前端的"高级感"。

## 参考来源

- MDN Streams API：<https://developer.mozilla.org/zh-CN/docs/Web/API/Streams_API>
- MDN EventSource（SSE）：<https://developer.mozilla.org/zh-CN/docs/Web/API/EventSource>
- OpenAI Streaming 文档：<https://platform.openai.com/docs/guides/streaming>
- Anthropic Streaming：<https://docs.anthropic.com/en/docs/build-with-claude/streaming>
