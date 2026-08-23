---
group: 浏览器原理与网络
order: 16
---

# HTTP 与浏览器网络

> HTTP 问题往往不只发生在“发送请求”这一步。本文从连接建立、方法语义、缓存、重试、跨域到实时通信，建立一套可用于开发、排障和面试表达的完整模型。

## 一、一次请求经过什么

以首次访问 HTTPS 地址为例，常见路径包括：

1. 解析 URL，检查 Service Worker、HTTP 缓存和浏览器安全策略。
2. DNS 把域名解析为地址；实际环境中可能先命中本地或递归解析器缓存。
3. 建立传输连接：HTTP/1.1、HTTP/2 通常基于 TCP，HTTPS 还要完成 TLS；HTTP/3 基于 QUIC。
4. 发送请求行、头和可选消息体，经过代理、CDN、网关到达服务。
5. 接收状态码、响应头和响应体，按缓存、Cookie、CORS 等规则处理。
6. 连接可能被复用，资源再交给解析、脚本或业务逻辑。

`PerformanceResourceTiming` 能观察 DNS、连接、TLS、等待首字节和下载阶段，但受连接复用、跨域 `Timing-Allow-Origin` 与隐私限制影响。不要把总耗时全部归因于“后端慢”。

## 二、方法、安全性与幂等性

| 方法     | 典型语义                | 安全方法 | 通常幂等 | 常见提醒                             |
| -------- | ----------------------- | -------- | -------- | ------------------------------------ |
| `GET`    | 读取资源                | 是       | 是       | 不应用来产生业务副作用               |
| `HEAD`   | 只取与 GET 相同的响应头 | 是       | 是       | 响应不含消息体                       |
| `POST`   | 提交、创建或触发命令    | 否       | 否       | 重试前需业务幂等键或结果查询         |
| `PUT`    | 用给定表示整体替换      | 否       | 是       | 幂等指最终效果，不等于响应完全相同   |
| `PATCH`  | 对资源应用部分修改      | 否       | 视语义   | “设为 3”可幂等，“加 1”通常不幂等     |
| `DELETE` | 删除目标资源            | 否       | 是       | 第二次可能回 404，但最终状态仍可相同 |

“安全”是指客户端不请求状态变更；日志、计费等服务端附带影响不改变方法定义。“幂等”决定自动重试的风险，但网络调用是否可重试还要看请求体可重放性、服务端实现与业务约束。

## 三、状态码是协议，不是 UI 文案

- `200 OK`：成功；`201 Created`：创建完成，通常可带 `Location`；`204 No Content`：无响应体。
- `301` / `308` 表示永久重定向，`302` / `307` 常用于临时重定向；307/308 明确保留方法。
- `304 Not Modified` 属于条件请求响应，不带完整新响应体。
- `400` 参数或语法错误；`401` 缺少或无效认证；`403` 已理解但拒绝授权；`404` 不存在。
- `409 Conflict` 适合版本或状态冲突；`422 Unprocessable Content` 适合语义校验失败；`429` 表示限流。
- `502` 是网关从上游收到无效响应，`503` 是暂时不可用，`504` 是网关等待上游超时。

不要在任意 401 上并发触发多次跳转或刷新令牌；要用单飞锁合并刷新，并防止刷新接口本身造成无限循环。收到 429/503 时优先遵循 `Retry-After`，而不是所有请求固定 1 秒重发。

## 四、超时、取消与有限重试

Fetch 默认不会因为 HTTP 4xx/5xx reject，也没有业务通用的默认超时。封装层应显式判断 `response.ok`，并区分用户取消、超时、断网与服务端错误。

```js
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

async function requestJson(url, options = {}) {
  const { timeout = 8000, retries = 1, signal, ...fetchOptions } = options
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const retryableMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method)

  for (let attempt = 0; ; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(timeout)
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: combinedSignal,
      })

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`)
        error.status = response.status
        throw error
      }
      return await response.json()
    } catch (error) {
      const retryableStatus = [429, 502, 503, 504].includes(error.status)
      const canRetry = attempt < retries && retryableMethod && (retryableStatus || !error.status)
      if (!canRetry || signal?.aborted) throw error
      await delay(300 * 2 ** attempt, signal)
    }
  }
}
```

上例只是基础模板：生产实现还应解析 `Retry-After`、加入随机抖动、限制全局并发并接入可观测性。POST 若使用稳定幂等键且服务端保存处理结果，才可能安全自动重试。

## 五、HTTP 缓存与内容协商

- `Cache-Control: max-age=...` 决定新鲜度；`no-cache` 表示复用前验证，`no-store` 才是不存储。
- `ETag` / `If-None-Match` 与 `Last-Modified` / `If-Modified-Since` 支持条件请求和 304。
- 带内容哈希的 JS/CSS 适合 `immutable` 长缓存；HTML 通常需要及时验证。
- `Vary` 把会改变响应表示的请求头纳入缓存键，例如 `Accept-Encoding`。
- `Accept`、`Accept-Language`、`Content-Type` 描述可接受或实际发送的表示，不要把格式协商散落成隐式猜测。

更完整策略见 `browser-cache.md`。缓存只优化可复用内容，不能替代服务端数据一致性方案。

## 六、HTTPS、TLS 与混合内容

HTTPS 使用 TLS 提供传输加密、完整性和服务端身份校验，但它不自动解决 XSS、越权、恶意依赖或终端泄露。HSTS 告诉浏览器在指定时间内只用 HTTPS 访问域名；启用 `includeSubDomains` 与预加载前要确认所有子域都已支持 HTTPS。

HTTPS 页面加载主动型 HTTP 混合内容通常会被阻止。证书错误可能来自过期、域名不匹配、中间证书缺失或客户端时间异常，排障应检查完整证书链，而不是关闭校验。

## 七、HTTP/1.1、HTTP/2 与 HTTP/3

- **HTTP/1.1** 常通过多个连接提升并发；同一连接上的请求/响应顺序容易形成应用层队头等待。
- **HTTP/2** 在一个 TCP 连接中用多个流多路复用，并使用 HPACK 压缩头部。它消除了 HTTP/1.1 式的应用层串行，但 TCP 丢包仍会阻塞同连接上的流。
- **HTTP/3** 把 HTTP 映射到 QUIC 独立流，某个流的数据丢失不会让其他流等待该数据重传，并集成 TLS 1.3 握手。

浏览器端通常无需为不同版本改业务 API，协议由客户端与服务端协商。过去为了 HTTP/1.1 做的域名分片会损失连接复用和压缩收益，应基于真实瀑布图重新评估。HTTP/2 Server Push 已不适合作为现代浏览器优化主线，优先使用缓存、`preload`、`preconnect` 和 103 Early Hints 等可观测方案。

## 八、CORS 与预检

CORS 是浏览器对跨源响应读取的授权机制，不是身份认证。满足特定条件的跨源请求会先发 `OPTIONS` 预检，服务端需正确返回允许的 Origin、方法和请求头。

```js
const response = await fetch('https://api.example.com/profile', {
  credentials: 'include',
  headers: { 'X-Request-Id': crypto.randomUUID() },
})
```

带凭据请求不能把 `Access-Control-Allow-Origin` 设为 `*`，服务端还应返回 `Access-Control-Allow-Credentials: true`，并对允许的 Origin 做白名单校验。Vite 开发代理只能改善本地开发路径，生产环境仍要由网关或 API 正确配置跨域策略。CORS 也不能替代 CSRF 防护。

## 九、WebSocket、SSE 与轮询

| 方案      | 通信方向       | 自动重连基础   | 适用场景                     |
| --------- | -------------- | -------------- | ---------------------------- |
| WebSocket | 双向           | 业务实现       | 协作、游戏、双向实时指令     |
| SSE       | 服务端到客户端 | EventSource 有 | 通知、日志、Agent 流式文本   |
| 长/短轮询 | 客户端发起     | 业务实现       | 更新低频、兼容优先或简单兜底 |

WebSocket API 没有自动业务确认、断线补偿和完整背压机制。生产方案应设计心跳、指数退避、消息序号、重放边界、鉴权过期和 `bufferedAmount` 上限。SSE 是文本事件流，使用 Fetch 自读流时还要正确处理分块不等于消息边界的问题。

## 十、常见坑与排障

- **看到 200 就认为业务成功**：部分旧接口把错误包在 200 中，导致监控和重试语义混乱。
- **所有失败都自动重试**：非幂等操作可能重复扣款、创建或发送消息。
- **混淆 401 与 403**：重复登录无法解决授权不足。
- **把 CORS 当服务端访问控制**：非浏览器客户端并不受浏览器同源策略限制。
- **忽略预检缓存**：自定义头过多会增加 OPTIONS 开销，但不能为了省预检删掉必要安全校验。
- **用并发数推断协议**：连接复用、优先级、代理与缓存都会改变瀑布图。
- **没有请求关联 ID**：前端、网关和服务日志难以串联一次失败。

先在 Network 中确认请求是否真正发出，再分别查看 DNS/连接/TTFB/下载、状态码、重定向、缓存和 CORS 控制台错误。线上问题应保留脱敏 URL、协议、状态、耗时、重试次数和 request ID。

## 十一、工程检查清单

- [ ] API 是否使用符合语义的方法、状态码和 `Content-Type`？
- [ ] 超时、取消、重试是否分开处理，非幂等请求是否受保护？
- [ ] 是否尊重 `Retry-After`，并使用上限、退避和抖动避免重试风暴？
- [ ] 缓存头、ETag、Vary 与 CDN 缓存键是否一致？
- [ ] 401 刷新是否单飞，403 是否进入无权限流程？
- [ ] CORS 白名单、Cookie SameSite 与 CSRF 方案是否配套？
- [ ] 实时连接是否有心跳、重连、消息去重和流量上限？
- [ ] 是否用真实用户监控和服务端链路数据验证性能结论？

## 十二、小结

HTTP 工程能力的核心不是背状态码，而是用协议语义约束正确性：按方法的幂等性决定重试，按缓存指令决定复用，按 401/403 区分认证授权，按 HTTP/2 与 HTTP/3 的传输差异解释瀑布图，再用可观测数据定位瓶颈。

## 参考来源

- HTTP Semantics（RFC 9110）：<https://httpwg.org/specs/rfc9110.html>
- HTTP Caching（RFC 9111）：<https://httpwg.org/specs/rfc9111.html>
- HTTP/2（RFC 9113）：<https://httpwg.org/specs/rfc9113.html>
- HTTP/3（RFC 9114）：<https://httpwg.org/specs/rfc9114.html>
- MDN CORS：<https://developer.mozilla.org/docs/Web/HTTP/CORS>
- MDN WebSocket：<https://developer.mozilla.org/docs/Web/API/WebSocket>
