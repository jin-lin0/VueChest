---
group: 牛客全量答案
order: 4
---

# 牛客全量标准答案 · 四、网络 / 浏览器

> 本文逐条对应《牛客面试题库》，编号由源题顺序生成。每题均需保留 `niuke-id` 标记，供覆盖校验器检查。

---

## HTTP 与缓存

### NQ-126

<!-- niuke-id:NQ-126 source-line:177 -->

**问题：** HTTP 有哪些版本（1.0 / 1.1 / 2.0 / 3.0）？核心区别？HTTP/2 有什么特点（多路复用 / 二进制分帧 / 头部压缩 / Server Push）？HTTP/3 为什么更快（QUIC / UDP）？

**面试者标准回答：**

> “我会按传输模型来比较：HTTP/1.0 默认短连接；HTTP/1.1 引入持久连接、管线化和更完整的缓存控制，但同一连接仍容易发生应用层队头阻塞；HTTP/2 把报文改为二进制帧，在一个 TCP 连接上多路复用，并支持 HPACK 头部压缩和流优先级，Server Push 虽存在但实践中收益有限且已被主流浏览器弱化。HTTP/3 把语义承载在基于 UDP 的 QUIC 上，握手更快，连接迁移更友好，而且一个流丢包不会阻塞其他流；它并不是‘UDP 天生可靠’，可靠性、拥塞控制和加密由 QUIC 实现。”

### NQ-127

<!-- niuke-id:NQ-127 source-line:178 -->

**问题：** 介绍 HTTP 强缓存与协商缓存？强缓存有什么缺点为什么还需要协商缓存？cache-control 有哪些值、与 expires 优先级谁高？协商缓存字段（ETag / If-Modified-Since / Last-Modified / If-None-Match）？启发式缓存？

**面试者标准回答：**

> “我先看强缓存：`Cache-Control: max-age` 或 `s-maxage` 在有效期内可直接复用本地或共享缓存，不发请求；`Expires` 是绝对时间，受客户端时钟影响，和 Cache-Control 同时存在时后者优先。强缓存无法感知有效期内的资源变化，所以过期或要求校验后要走协商缓存：客户端携带 `If-None-Match` 或 `If-Modified-Since`，服务端没变化返回 304。ETag 精度更高且优先于 Last-Modified。常用指令包括 `no-store`、`no-cache`、`private`、`public`、`must-revalidate`、`immutable`。若响应没有显式新鲜度，浏览器可能依据 Last-Modified 等估算启发式缓存；生产上我会给带内容哈希的静态资源长强缓存，HTML 短缓存或协商缓存。”

### NQ-128

<!-- niuke-id:NQ-128 source-line:179 -->

**问题：** HTTP 状态码有哪些（301/302/304/401/500/502/504 等）？301 与 302 使用场景与浏览器执行区别？302 和 304 的区别？

**面试者标准回答：**

> “我会按类别记：2xx 成功，3xx 重定向或缓存，4xx 客户端问题，5xx 服务端或网关问题。301 是永久重定向，适合域名或资源永久迁移，可能被浏览器和搜索引擎长期缓存；302 是临时重定向。历史客户端可能把 301/302 后的非 GET 请求改成 GET，要求保持方法应使用 307/308。304 不是跳转，而是协商缓存命中，响应通常没有实体。401 表示未认证，403 是已识别但无权限；500 是源站内部错误，502 是网关收到无效上游响应，504 是网关等待上游超时。”

### NQ-129

<!-- niuke-id:NQ-129 source-line:180 -->

**问题：** HTTP 报文格式？请求头字段？请求报文的 content-type 有哪些常见字段？GET 与 POST 区别（含跨域上区别）？

**面试者标准回答：**

> “HTTP 请求由请求行、请求头、空行和可选请求体组成，响应对应状态行、响应头、空行和响应体。常见请求头有 Host、Accept、Content-Type、Authorization、Cookie、Origin、Referer、Cache-Control；常见 Content-Type 有 JSON、表单 URL 编码、multipart/form-data、text/plain 和二进制流。GET 语义是安全、幂等地读取，参数常放 URL 且更容易被缓存；POST 常用于提交或创建，数据可放请求体，但它并不天然更安全。跨域限制由同源策略和 CORS 决定，不是由 GET/POST 决定；某些简单 GET 或 POST 可免预检，最终仍要服务端允许 Origin。”

### NQ-130

<!-- niuke-id:NQ-130 source-line:181 -->

**问题：** HTTPS / TLS 加密流程？HTTPS 与 HTTP 的区别？证书验证（CA 签名）如何防止中间人攻击？为什么用对称 + 非对称两种加密结合？浏览器提示证书无效如何处理？

**面试者标准回答：**

> “HTTPS 是 HTTP 运行在 TLS 之上。握手时客户端发送支持的版本、密码套件和随机数，服务端返回证书与密钥协商信息；客户端验证证书域名、有效期、信任链和吊销状态，再通过 ECDHE 等方式协商会话密钥，后续用对称加密保护数据并用 AEAD 校验完整性。非对称密码便于认证和安全协商，但计算成本高；对称密码适合大量数据，所以两者结合。CA 对证书签名让客户端能验证公钥确属目标域名，配合主机名校验可阻断普通中间人。证书无效时我不会让用户忽略告警，而会排查域名、时间、证书链、SNI、续期和代理劫持。”

### NQ-131

<!-- niuke-id:NQ-131 source-line:182 -->

**问题：** 浏览器缓存机制？浏览器本地存储一般用在哪些场景（localStorage / sessionStorage / cookie / IndexedDB）？cookie / localStorage / sessionStorage 的区别、大小限制？IndexedDB 与 localStorage 如何选型？跨域访问 localStorage 可以吗？

**面试者标准回答：**

> “我按数据寿命、容量、查询方式和安全性选存储：Cookie 容量通常约 4KB，会按规则随请求发送，适合服务端会话标识；localStorage 通常约 5～10MB、同源持久保存，但同步 API 会阻塞主线程；sessionStorage 按同源且按标签页会话隔离，关闭页签后清除；IndexedDB 是异步、事务型数据库，适合较大的结构化数据、索引查询和离线缓存。敏感令牌优先放 Secure、HttpOnly、SameSite Cookie，避免被 XSS 直接读取。localStorage 受协议、域名、端口组成的源隔离，不能直接跨域读取；确需共享要通过受控后端、`postMessage` 或同站点方案，并验证来源。”

### NQ-132

<!-- niuke-id:NQ-132 source-line:183 -->

**问题：** DNS 解析前端会遇到什么问题？CDN 是什么、缓存查询步骤、怎么落地？Nginx 解决跨域时是什么角色？正向 / 反向代理区别、负载均衡、静态资源缓存？

**面试者标准回答：**

> “DNS 把域名解析为 IP，前端会关注解析延迟、缓存、污染、切换不及时和 DNS 故障；可用 DNS 预解析、HTTPDNS 或多线路容灾，但要评估隐私和证书匹配。CDN 把静态内容缓存到边缘节点，请求经 DNS/Anycast 调度到合适节点，边缘先查缓存，未命中再回源并按缓存策略保存。Nginx 在跨域方案里常作为同源反向代理：浏览器只访问当前站点，Nginx 转发到真实 API，并可做 TLS 终止、负载均衡、压缩和缓存。正向代理代表客户端访问外部，反向代理代表服务端集群接收外部流量。”

### NQ-133

<!-- niuke-id:NQ-133 source-line:184 -->

**问题：** 点开淘宝网址发现是京东（被劫持），哪里出了问题？不进行劫持如何变回？VPN 原理？

**面试者标准回答：**

> “输入淘宝却到了京东，我会从 URL、hosts/本机代理、浏览器扩展、DNS、路由器、运营商链路到源站跳转逐层排查；如果地址栏域名没变但内容异常，还要考虑 Service Worker、缓存或 HTTPS 被代理。常见根因是 DNS/HTTP 劫持或恶意扩展。恢复时应切换可信 DNS、清理恶意 hosts/代理/扩展和 DNS 缓存、升级路由器固件并优先使用 HTTPS/HSTS；若是企业网络则先确认合规代理配置。VPN 是在客户端与 VPN 网关之间建立加密隧道并改变路由，让流量经网关转发；它能保护本地到网关的链路，但不等于端到端匿名，也不能替代 HTTPS。”

### NQ-134

<!-- niuke-id:NQ-134 source-line:185 -->

**问题：** 计算机网络的几层协议（OSI 七层 / 五层）？各层作用、与开发相关的层？为什么要分这么多层？文件传输协议（FTP 等）有哪些？

**面试者标准回答：**

> “OSI 七层从下到上是物理、数据链路、网络、传输、会话、表示、应用；工程中常用五层模型：物理、链路、网络、传输、应用。IP 负责寻址和路由，TCP/UDP/QUIC 负责端到端传输，HTTP、DNS、WebSocket、FTP 位于应用层。分层的价值是职责隔离、协议可替换和互操作，排障时也能按层定位。文件传输除 FTP/FTPS 外还有基于 SSH 的 SFTP、SCP，以及最常见的 HTTP/HTTPS 和对象存储协议；我会优先选择加密且易审计的 HTTPS 或 SFTP。”

### NQ-135

<!-- niuke-id:NQ-135 source-line:186 -->

**问题：** 更新代码发版之后，用户那边显示的还是旧页面，要怎么排查？（涉及哪几层缓存、如何逐层定位与解决）

**面试者标准回答：**

> “我先确认旧的是 HTML、接口数据还是带 hash 的静态资源，再从浏览器内存/磁盘缓存、Service Worker、CDN、Nginx/反向代理、源站和多机发布版本逐层定位，结合响应头里的 Age、ETag、Cache-Control、Via 和实际资源 hash 判断命中位置。标准发布策略是 HTML 不做长期强缓存，文件名带内容 hash 的 JS/CSS 使用一年强缓存加 immutable；新 HTML 只引用新 hash，旧资源保留一段时间以支持滚动发布。紧急处理可刷新 CDN、修正代理缓存并更新 Service Worker，但不靠让所有用户手动清缓存。”

---

## 跨域与安全

### NQ-136

<!-- niuke-id:NQ-136 source-line:190 -->

**问题：** 什么是跨域？同源策略？浏览器怎么识别是否同源？常见跨域解决方案（CORS / Nginx 反向代理 / JSONP / dev proxy）？详述 CORS 具体配置？预检请求用到什么方法（OPTIONS）？跨域是否携带 cookie？src 与 href 的区别？

**面试者标准回答：**

> “同源要求协议、主机和端口都相同；同源策略限制脚本读取跨源响应和 DOM，但并不阻止所有跨源请求发送。首选 CORS：服务端按可信白名单返回 `Access-Control-Allow-Origin`，需要凭证时再返回 `Access-Control-Allow-Credentials: true`，此时 Origin 不能是 `*`；预检 OPTIONS 还要允许方法和请求头，并可设置 Max-Age。Nginx 或开发代理通过同源转发规避浏览器跨域，JSONP 只支持 GET 且有注入风险。跨域 Fetch 默认不带凭证，需设置 credentials，服务端也要配合。`src` 表示嵌入或加载资源，`href` 表示当前文档与目标资源的关系，它们都不是任意读取跨域内容的通行证。”

### NQ-137

<!-- niuke-id:NQ-137 source-line:191 -->

**问题：** XSS 是什么、什么情况会发生、怎么防御？CSRF 是什么、怎么发生、防御办法？XSS / CSRF 怎么获取 cookie？React 原生支持转义吗？恶意注入 script 标签怎么办（CSP）？三种 XSS 如何防护？浏览器安全攻击手段与原理、如何检测脚本注入？

**面试者标准回答：**

> “XSS 是不可信数据被浏览器当代码执行，分反射型、存储型和 DOM 型；核心防线是按输出上下文转义、避免 `innerHTML`/`eval`、富文本使用白名单净化，再用 CSP、Trusted Types 和 HttpOnly Cookie 降低后果。React 默认转义文本插值，但 `dangerouslySetInnerHTML` 仍需净化。CSRF 是攻击者借用受害者已登录的 Cookie 发起非预期请求，防御用 SameSite Cookie、CSRF Token、Origin/Referer 校验和敏感操作二次确认。XSS 可能直接读非 HttpOnly Cookie，CSRF 通常读不到 Cookie，只是让浏览器自动携带。检测上我会做 SAST/依赖扫描、CSP report、运行时监控与渗透测试。”

### NQ-138

<!-- niuke-id:NQ-138 source-line:192 -->

**问题：** 攻击者如何伪装成用户？JWT 是什么？JWT 配置了哪些字段、业内安全隐患（易被逆向解码）如何加固？为什么不用 sessionID、cookie 的安全隐患及解决？AES / RSA 区别、公私钥？单点登录（SSO）/ 小程序授权流程？

**面试者标准回答：**

> “攻击者可通过窃取凭证、会话固定、XSS、钓鱼或重放来冒充用户。JWT 是带签名的声明载体，常见字段有 iss、sub、aud、exp、nbf、iat、jti；header 指明算法，payload 只是 Base64URL 编码而非加密，不能放秘密。加固要固定允许算法、校验签名及全部关键声明、短有效期、密钥轮换、refresh token 轮换与撤销机制，并用 HTTPS 和安全 Cookie。Session ID 便于服务端撤销，JWT 便于分布式验证，没有绝对优劣。AES 是共享密钥的对称加密，RSA 是公私钥非对称算法。SSO/小程序授权通常基于授权码：客户端拿一次性 code，后端向身份方换令牌并建立自己的会话。”

### NQ-139

<!-- niuke-id:NQ-139 source-line:193 -->

**问题：** cookie 有哪些属性？SameSite 是什么、JS 能否获取 cookie、后端想让 cookie 失效怎么实现？cookie 和 session？

**面试者标准回答：**

> “Cookie 常见属性包括 Domain、Path、Expires/Max-Age、Secure、HttpOnly、SameSite、Priority；`__Host-` 前缀还能约束 Secure、Path=/ 且无 Domain。SameSite=Strict 最严格，Lax 允许部分顶层导航，None 用于跨站且必须配合 Secure。没有 HttpOnly 的 Cookie 可由 `document.cookie` 读取，有 HttpOnly 则只能由网络请求携带。后端让 Cookie 失效时要用相同 Domain 和 Path 设置 Max-Age=0 或过去时间。Cookie 是浏览器存储与传输机制，Session 是服务端会话状态，通常用一个不可预测的 Cookie 会话 ID 关联。”

### NQ-140

<!-- niuke-id:NQ-140 source-line:194 -->

**问题：** 接口幂等如何实现（前端防重、后端幂等、数据库幂等三层）？自动化脚本向输入框填 1000w 个手机号发验证码，前端如何防范 / 规避刷接口？如何防止用户连续点击造成多次请求、并发请求打断？

**面试者标准回答：**

> “幂等不能只靠按钮置灰。我会分三层：前端立即禁用、节流并用 AbortController 取消过时请求；接口携带一次性 idempotency key 或业务唯一号；后端原子校验并缓存首次结果，数据库再用唯一索引、状态机条件更新或事务兜底。验证码防刷要以后端为主：按账号、手机号、IP、设备和风险画像限频，加入验证码/人机校验、黑名单、配额和告警，签名不能替代限流。并发搜索类请求用序号或取消机制只接纳最新响应，支付等关键写操作则依赖服务端幂等，前端防重只是体验层。”

### NQ-141

<!-- niuke-id:NQ-141 source-line:195 -->

**问题：** 多级故障（超时、弱网、熔断、宕机）前端如何分层降级、灰度兜底？流量高峰期后端限流、前端节流、队列削峰如何联动？前后端异步链路状态一致性等级与兜底策略？

**面试者标准回答：**

> “我会先定义可观测的错误分级和用户可接受的一致性。前端设置连接、首字节和总超时，仅对幂等请求做带抖动的有限重试；弱网降级图片、关闭非核心实时功能，服务熔断时展示缓存、只读页或明确的稍后重试。灰度按用户或租户稳定分桶，并准备远程开关和回滚。高峰期前端防抖节流只是减噪，真正限流在网关/服务端，写入可入队削峰并返回任务 ID。异步链路用幂等键、状态机、版本号、轮询/推送和最终对账保证最终一致；金额、库存等强约束由后端事务或预占补偿保证。”

### NQ-142

<!-- niuke-id:NQ-142 source-line:196 -->

**问题：** 前端安全实践（接口加密、token 鉴权、CSP）？Prompt Injection 与越狱的区别；前端如何防止提示词注入？

**面试者标准回答：**

> “前端安全里 HTTPS、CSP、输入输出编码、依赖治理和安全 Cookie 是基础；接口参数加密不能替代 TLS，公开前端里的密钥也不是真秘密。Token 要最小权限、短时效、可撤销并避免暴露给 XSS。Prompt Injection 是恶意输入诱导模型覆盖原指令或泄露/滥用工具，越狱更侧重绕过模型安全规则，两者有交集。前端无法单独消除注入：我会把外部内容标记为不可信数据，工具使用白名单和结构化参数，高风险动作服务端鉴权与人工确认，隔离秘密、限制出网和写权限，并记录审计；不要把隐藏系统提示词当安全边界。”

### NQ-143

<!-- niuke-id:NQ-143 source-line:197 -->

**问题：** POST 请求一定会触发预检（OPTIONS）请求吗？哪些情况下 POST 仍属于简单请求、不触发预检（如 Content-Type 为 application/x-www-form-urlencoded、multipart/form-data、text/plain）？

**面试者标准回答：**

> “POST 不一定触发预检。跨源请求若方法是 GET、HEAD 或 POST，手动设置的请求头属于 CORS safelist，且 Content-Type 仅为 `application/x-www-form-urlencoded`、`multipart/form-data` 或 `text/plain` 并满足参数限制，就可能是简单请求，浏览器直接发送。`application/json`、Authorization、自定义头或非简单方法通常会先发 OPTIONS。简单请求只是免预检，响应仍必须有正确的 CORS 头，脚本才能读取；Cookie 是否携带还受 credentials、SameSite 和服务端允许凭证共同约束。”

---

## 实时通信与流式

### NQ-144

<!-- niuke-id:NQ-144 source-line:201 -->

**问题：** WebSocket 的完整流程和底层原理？和 SSE 的区别？心跳保活和断线重连（指数退避）怎么实现？还有哪些全双工协议？用 WebSocket 还是 SSE（为什么 AI 对话优先用 SSE 而非轮询 / WebSocket、文本流式输出选 SSE、语音转写选 WebSocket）？SSE 与 HTTP streamable 的区别？SSE 不支持 fetch 为什么不用 fetch-eventsource？

**面试者标准回答：**

> “WebSocket 先用 HTTP Upgrade 握手，成功后在一条 TCP 连接上以帧双向通信；SSE 是服务端通过 `text/event-stream` 在 HTTP 长连接上单向推送文本事件。AI 文本生成通常只有服务端持续下发，SSE 语义简单、可穿过普通 HTTP 基础设施并支持事件 ID；语音实时上传下载需要双向、低开销帧，更适合 WebSocket 或 WebRTC。心跳用于发现半开连接，重连采用带抖动的指数退避并设置上限。需要纠正的是：原生 EventSource 不能自定义请求头或 POST，但 Fetch 可以读取流；`fetch-event-source` 是为补足这些限制的库。MCP 的 Streamable HTTP 是一套可同时使用普通响应与可选 SSE 的传输约定，不等同于裸 SSE。”

### NQ-145

<!-- niuke-id:NQ-145 source-line:202 -->

**问题：** SSE 原理？SSE 连接过程、前端如何流式响应？断连重连、指数退避、断点续传补丢失文本怎么实现？后端什么时候推送、前端断连怎么处理？大模型返回中断如何处理（断点续传 / 重连）？

**面试者标准回答：**

> “服务端设置 `Content-Type: text/event-stream`，按 `event`、`id`、`data` 字段和空行持续写入并及时 flush；浏览器 EventSource 解析事件，或用 Fetch 的 ReadableStream 增量解码。重连时我保存最后确认的 event ID，客户端用 `Last-Event-ID` 或业务游标续传，服务端保留短期事件日志并去重；只靠把间隔文本拼起来不能保证不丢。指数退避要加随机抖动、上限和最大次数，超时或鉴权失败要分类处理。LLM 中断时把消息状态标成 stopped/failed，已持久化的 token 或事件可恢复，否则明确重新生成，不能假装无损续写。”

### NQ-146

<!-- niuke-id:NQ-146 source-line:203 -->

**问题：** 打字机逐字输出怎么实现？后端一直吐数据如何保证前端不卡（Web Worker 释放计算线程）？流式场景下 Markdown 表格如何判断"完整解析"再一次性渲染、HTML 标签流式缓冲区处理？前端接收流式数据的方式（服务端 yield、前端增量渲染、处理中断 / 重连 / 超时）？

**面试者标准回答：**

> “我把网络接收、协议解析、内容聚合和 UI 刷新解耦。字节流先用 TextDecoder 的 stream 模式处理跨 chunk 字符，再解析 SSE/NDJSON 边界；token 写入缓冲区，以 `requestAnimationFrame` 或 30～50ms 批量更新，打字机只是消费缓冲区，不对每个 token 触发重渲染。重 Markdown 解析可放 Web Worker，但 DOM 更新仍在主线程。代码围栏、HTML 标签和表格需要维护增量解析状态；未闭合表格可先作为纯文本或缓冲到完整行，再局部替换。配合 AbortController、超时、游标重连和虚拟列表，才能在长回答下保持流畅。”

### NQ-147

<!-- niuke-id:NQ-147 source-line:204 -->

**问题：** 文本流式输出选用 SSE、语音转写选用 WebSocket 的原因？乐观更新如何实现？

**面试者标准回答：**

> “文本生成主要是服务器到客户端的有序单向流，SSE 基于 HTTP、实现和代理兼容性较好，还自带事件 ID/重连语义；语音转写要持续上传音频帧并接收部分结果，是双向低延迟场景，因此 WebSocket 或 WebRTC 更合适。乐观更新是先在本地插入带临时 ID 和 pending 状态的数据，再发请求；成功后用服务端版本替换，失败则回滚或标记可重试。并发时要用客户端 mutation ID、版本号和幂等键，避免晚到响应覆盖新状态。”

### NQ-148

<!-- niuke-id:NQ-148 source-line:205 -->

**问题：** 用户点击"停止生成"，后端如何立即终止 LLM 推理？多轮对话 + 流式输出如何保证消息不乱序、上下文不丢失？跨服务流式透传（gRPC streaming / HTTP2 SSE）？

**面试者标准回答：**

> “点击停止时，前端用 AbortController 关闭读取并向后端发送包含 generationId 的取消指令；后端维护请求到任务的映射，传播 cancellation token 到模型 SDK 或推理服务，并停止下游工具与计费，不能只断开前端连接。每轮消息使用 conversationId、messageId、parentId、sequence 和 generationId，服务端先持久化状态，再按序推送带事件 ID 的增量，客户端去重且只更新对应消息。跨服务用支持背压和取消传播的 gRPC streaming 或 HTTP 流式转发，并贯穿 trace ID；重试必须有幂等语义。”

---

## 其他

### NQ-149

<!-- niuke-id:NQ-149 source-line:209 -->

**问题：** TCP 和 UDP 的区别？TCP 如何实现可靠性传输（拥塞控制、慢启动）？TCP 三次握手、四次挥手，为什么需要三次握手？最后一次 ack 丢失怎么办？TCP 粘包？游戏模块一般用什么协议？

**面试者标准回答：**

> “TCP 面向连接、提供有序可靠字节流，UDP 无连接、保留报文边界且不保证到达或顺序。TCP 通过序号、确认、超时重传、滑动窗口、流量控制和拥塞控制保证可靠性；慢启动让拥塞窗口从较小值逐步增长。三次握手让双方确认收发能力并同步初始序号，四次挥手是因为两个方向要分别关闭。最后 ACK 丢失时服务端会重传 FIN，客户端在 TIME_WAIT 内再次 ACK。TCP 本身没有消息边界，所谓粘包要靠长度前缀、分隔符或固定长度协议处理。竞技游戏常用 UDP/QUIC 并按业务自定义可靠性，登录和交易仍可能用 TCP/HTTPS。”

### NQ-150

<!-- niuke-id:NQ-150 source-line:210 -->

**问题：** XMLHttpRequest（XHR）的 readyState 有哪些状态码？fetch vs XHR / Ajax 应用场景？ajax 底层原理？

**面试者标准回答：**

> “XHR 的 readyState 依次是 0 UNSENT、1 OPENED、2 HEADERS_RECEIVED、3 LOADING、4 DONE，最终成功与否还要看 HTTP status。Ajax 是无需整页刷新地异步请求并局部更新页面的模式，早期通常由 XHR 实现。Fetch 基于 Promise，接口更简洁，原生支持 Request/Response、流和 AbortController，但 HTTP 4xx/5xx 不会自动 reject，需要手动判断 `response.ok`；上传进度、某些老环境和细粒度事件监听仍可选择 XHR。二者最终都通过浏览器网络栈发送 HTTP，并受同源策略和 CORS 约束。”

### NQ-151

<!-- niuke-id:NQ-151 source-line:211 -->

**问题：** CDN 怎么做？静态资源（JS/CSS/图片）如何处理？hash 强缓存策略？CDN 与 COS 等对象存储的优势对比？

**面试者标准回答：**

> “我会把 JS、CSS、字体和图片构建为内容哈希文件，上传对象存储作为可靠源站，再由 CDN 做边缘缓存和就近分发；响应设置长期 `Cache-Control: public, max-age=31536000, immutable`，HTML 保持短缓存并只引用新 hash。CDN 的优势是全球节点、协议优化、回源保护和带宽抗峰值，对象存储的优势是低成本、高持久性和简单的源数据管理，两者通常组合而非二选一。发布要原子化、旧资源延迟删除，并处理跨域、字体 MIME、压缩、图片格式和缓存刷新。”

### NQ-152

<!-- niuke-id:NQ-152 source-line:212 -->

**问题：** 从输入 URL 到页面展示的完整过程（含三次握手/四次挥手、具体重排重绘例子）？浏览器事件从硬件 → 操作系统 → 浏览器进程 → JS 回调的完整链路？

**面试者标准回答：**

> “输入 URL 后先解析地址，检查 HSTS/缓存/Service Worker，进行 DNS 解析，再建立 TCP 和 TLS 或直接建立 QUIC；发送 HTTP 请求，经 CDN/网关到服务端，收到 HTML 后预加载扫描器和解析器发现资源，构建 DOM、CSSOM、渲染树，完成布局、绘制、分层与合成。读取布局后立即修改样式可能触发强制同步布局；改变宽高会重排并通常重绘，transform/opacity 常可只合成。关闭 TCP 时常见四次挥手。输入事件则由硬件中断到操作系统事件队列，再到浏览器进程命中页面，转发渲染进程做命中测试和分发，最终进入 JS 任务队列执行监听器并触发更新。”

### NQ-153

<!-- niuke-id:NQ-153 source-line:213 -->

**问题：** 浏览器有哪些进程？进程和线程的区别？浏览器渲染进程 / 渲染原理？

**面试者标准回答：**

> “现代浏览器通常有 Browser 主进程、每站点或页面的渲染进程、网络进程、GPU 进程以及扩展/工具进程。进程拥有独立地址空间、隔离更强但通信成本高；线程共享进程内存、切换更轻但要处理并发安全。渲染进程中主线程负责 HTML/CSS 解析、样式、布局和大部分 JS，合成线程与光栅线程协作生成图块，GPU 进程负责提交显示。多进程架构提升稳定性和安全隔离，代价是内存和 IPC；长 JS 会阻塞同一渲染主线程，所以要拆任务或用 Worker。”

### NQ-154

<!-- niuke-id:NQ-154 source-line:214 -->

**问题：** 客户端服务器重连的策略？实时音频通话跟大模型交互，期间的时延怎么控制？

**面试者标准回答：**

> “重连策略先区分离线、鉴权失败、服务端限流和瞬时网络错误；只对可恢复错误采用带随机抖动的指数退避，设置最大间隔、最大次数和总时限，网络恢复或页面可见时再触发，并携带会话游标去重补偿。实时音频时延要拆成采集、编码、上行、推理、合成、下行和播放逐段监控；使用流式 ASR/LLM/TTS、较小但不过度的音频帧、WebRTC/WebSocket、就近节点、连接预热和及时打断，配合 jitter buffer、VAD 与自适应码率。不能只追求最低缓冲，否则抖动会让体验更差。”

### NQ-155

<!-- niuke-id:NQ-155 source-line:215 -->

**问题：** 微信登录 / 二维码扫码登录怎么实现的？介绍流程？PC 端怎么感知登录状态并跳转？

**面试者标准回答：**

> “二维码里通常是短时、一次性的登录会话标识，不直接放长期凭证。PC 创建二维码会话并通过 SSE/WebSocket、长轮询或带退避的轮询等待状态；手机扫码后先展示待确认信息，用户确认时手机端携带自身登录态向服务端授权该会话。服务端把状态从待扫码更新为已扫码、已确认或过期，并签发只给 PC 的一次性交换码；PC 收到确认后换取自己的安全会话并跳转。整个流程要绑定客户端、短过期、防重放、扫码与确认分离，并避免在 URL 暴露 token。”

### NQ-156

<!-- niuke-id:NQ-156 source-line:216 -->

**问题：** 大文件分片上传如何实现？秒传、断点续传（基于 HTTP Range）、进度同步？切片用的什么 API？弱网怎么办？前端如何显示上传进度？大文件拆分上传、断线重连如何实现重传？

**面试者标准回答：**

> “前端用 File/Blob 的 `slice` 按固定或自适应大小切片，可在 Worker 中计算文件指纹；先向服务端初始化上传，获取 uploadId 和已存在分片列表。各分片带索引、大小和校验值并限制并发上传，失败做指数退避重试；服务端按唯一键幂等落盘，全部完成后校验并合并。秒传本质是服务端确认相同内容已存在，不能只信前端 hash。进度按已确认字节加当前分片进度汇总，状态持久化后可断点续传。HTTP Range 主要用于范围下载；上传续传常由分片协议或 tus/S3 multipart 实现，不能笼统说都靠 Range。”

### NQ-157

<!-- niuke-id:NQ-157 source-line:217 -->

**问题：** 音视频通话：怎么实现码率自适应调整、怎么判断网卡调整码率、交换媒体信息的安全问题？视频编码 H264 与 H265 的区别？

**面试者标准回答：**

> “实时音视频通常通过 WebRTC 的带宽估计观察丢包、RTT、抖动、接收反馈和队列延迟，动态调整发送码率、分辨率、帧率和编码层；网络恶化时先保音频，再降视频层级，恢复时渐进上调，避免频繁震荡。媒体协商的 SDP/ICE 信令要经鉴权和完整性保护，媒体用 DTLS-SRTP 加密，TURN 凭证短时化并限制房间权限。H.265 在相近画质下通常比 H.264 更省码率，但编码复杂度、授权和浏览器兼容性更差；Web 场景不能只看压缩率，还要看硬件解码与端到端支持。”

### NQ-158

<!-- niuke-id:NQ-158 source-line:218 -->

**问题：** 跨端开发框架（React Native / 小程序 / 公众号）了解？WebAssembly 电子签章 / 跨语言交互（与原生接口）？

**面试者标准回答：**

> “React Native 用 JS/React 描述原生组件，通过新架构的 JSI 等机制与原生能力交互；小程序运行在平台提供的双线程或多层运行环境，受平台组件和 API 约束；公众号 H5 本质仍是 WebView 页面，通过 JS SDK 获取微信能力。WebAssembly 适合把 C/C++/Rust 的计算密集逻辑编译到浏览器沙箱运行，例如签章图像或密码学处理，但 DOM 和系统能力仍要经 JS 或宿主导入函数调用。选型时我会比较性能、包体、生态、审核、热更新和原生能力，不把跨端理解为零平台适配。”

### NQ-159

<!-- niuke-id:NQ-159 source-line:219 -->

**问题：** JSBridge 是什么、有了解吗？H5 / WebView 与 Native 之间如何互相通信（协议约定、调用与回调机制）？

**面试者标准回答：**

> “JSBridge 是 WebView 中 JavaScript 与 Native 的受控消息通道。JS 调原生时通常发送包含 method、params、callbackId 的结构化消息，iOS 可用 WKScriptMessageHandler，Android 可用 WebMessage 或谨慎封装的接口；Native 完成后按 callbackId 回传结果。Native 调 JS 则通过消息事件或在主线程执行受控脚本。协议需要版本、超时、错误码、序列化和生命周期管理，安全上必须白名单方法、校验页面来源与参数、限制敏感权限，避免把任意反射或 `eval` 暴露给不可信 H5。”

### NQ-160

<!-- niuke-id:NQ-160 source-line:220 -->

**问题：** WebView 加载慢 / 白屏怎么优化（预加载 / 离线包 / 资源缓存 / 内核复用等）？App 新增蓝牙与硬件连接后，硬件广播的信息前端页面怎么接收与展示？

**面试者标准回答：**

> “WebView 白屏我会先用分段指标定位是容器创建、DNS/TLS、HTML 首包、资源下载还是 JS 渲染慢。优化手段包括复用或预热 WebView 内核、预连接、骨架屏、本地离线包与增量更新、静态资源缓存、关键资源内联/预加载、减少首屏 JS，并设计离线包签名、版本回滚和缓存失效。蓝牙等硬件能力应由 Native 层申请权限、扫描和解析广播，再通过安全 JSBridge 或事件通道向 H5 推送结构化状态；前端做去重、节流、连接状态机和异常提示，不直接假设浏览器 API 在所有 App 容器可用。”

---

## 参考来源

- [牛客网面试经验](https://www.nowcoder.com/discuss)
- [MDN：HTTP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP)
- [MDN：CORS](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Guides/CORS)
- [MDN：Server-sent events](https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events)
- [OWASP：Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
