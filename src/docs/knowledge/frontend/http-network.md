---
group: 浏览器原理与网络
order: 16
---

# HTTP 与浏览器网络

> 适用场景：理解请求全貌、配缓存、排 CORS、做性能优化。本文讲方法/状态码/缓存/HTTPS/HTTP2/WebSocket，并衔接 `web-security` 的 CORS 章。
> 阅读前提：基础网络概念。

前端发起的每个请求都走 HTTP。懂它，才能正确配缓存、排查跨域、优化首屏。

## 一、方法语义

| 方法 | 语义 | 幂等 |
|------|------|------|
| GET | 取资源（可被缓存、不应改服务端） | 是 |
| POST | 新建/提交 | 否 |
| PUT | 整体替换 | 是 |
| PATCH | 局部更新 | 否 |
| DELETE | 删除 | 是 |

> 幂等 = 多次调用效果相同。REST 设计（见 `node-backend`）靠方法表意，别全用 POST。

## 二、常见状态码

- **2xx** 成功：200 / 201(已创建) / 204(无内容)。
- **3xx** 重定向：301(永久)/302(临时)/304(资源未变，走缓存)。
- **4xx** 客户端错：400(参数错)/401(未认证)/403(无权限)/404(不存在)/429(限流)。
- **5xx** 服务端错：500(内部错)/502(网关坏)/503(不可用)/504(超时)。

> 前端看到 401 通常触发「跳登录」；429 要退避重试；5xx 多是后端问题，前端只能兜底提示。

## 三、缓存（省流量、提速）

- **强缓存**：`Cache-Control: max-age=3600`（时间内直接读本地，不发请求）；`Expires` 为旧方案。
- **协商缓存**：过期后带 `If-None-Match`(ETag) / `If-Modified-Since`，服务端回 304 表示「还能用」。
- **Vite 产物**：带 hash 的文件名（`app.a1b2.js`）可设长缓存，内容变 hash 变、自动失效（见 `vite`）。

> 调试时勾 DevTools「Disable cache」可强制每次走网络，避免被旧缓存误导。

## 四、HTTPS 与证书

- HTTPS = HTTP + TLS，加密传输、防窃听/篡改。现代站点强制 HTTPS。
- 混合内容（HTTPS 页里加载 HTTP 资源）会被浏览器拦截。
- HSTS 让浏览器只走 HTTPS。

## 五、HTTP/2 与 HTTP/3

- **HTTP/2**：多路复用（一个 TCP 连接并发多请求）、头部压缩、服务端推送。解决 HTTP/1.1 队头阻塞。
- **HTTP/3**：基于 QUIC（UDP），连握手更快、弱网下更稳。
- 实践：开启 HTTP/2 即可，无需改业务代码；域名分片（为绕过 1.1 并发限制）在 2 下反而有害。

## 六、WebSocket 与长连接

- HTTP 一问一答；**WebSocket** 全双工长连接，适合实时（聊天、行情推送，见 VueChest 行情）。
- 替代方案：SSE（服务端单向推）、轮询（定时拉，最简单但费资源）。

## 七、CORS 回顾

- 跨源请求受同源策略限制（见 `web-security`）。
- 服务端用 `Access-Control-Allow-Origin` 放行；带 cookie 须 `credentials` + 显式源（不能 `*`）。
- 开发期用 Vite `server.proxy` 转发，避免跨域（见 `vite`）。

## 八、前端性能相关

- 关键请求少、体积小的资源并行加载；大资源预加载（`<link rel="preload">`）。
- 用 CDN 就近分发静态资源。
- 这些与 `perf-frontend` / `browser-rendering` 协同：网络快 + 渲染快 = 体验好。

## 参考来源

- MDN HTTP：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP>
- HTTP 缓存：<https://web.dev/articles/http-cache>
- HTTP/2 介绍：<https://web.dev/articles/performance-http2>
- WebSocket：<https://developer.mozilla.org/zh-CN/docs/Web/API/WebSocket>
- CORS：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS>
