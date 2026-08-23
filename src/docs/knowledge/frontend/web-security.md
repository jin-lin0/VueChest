---
group: 浏览器原理与网络
order: 20
---

# Web 安全

> 适用场景：前端面试高频 + 上线前必查。本文讲 XSS / CSRF / CSP / 同源 / SQL 注入 / 依赖安全，并给可落地的防护代码。
> 阅读前提：HTTP 基础、事件循环（见 `event-loop`）。

安全是「木桶效应」——任何一处短板都可能被攻破。下面按「发生频率 × 危害」挑前端最该懂的六块。

## 一、XSS（跨站脚本，最普遍）

**原理**：把恶意脚本注入到页面并执行（如评论区插 `<script>`，或 URL 参数拼进 HTML）。

**三类**：

- 存储型：恶意脚本存库，所有人访问都中招（如商品评论）。
- 反射型：脚本在 URL 里，诱骗点击后执行。
- DOM 型：前端 JS 把不可信数据写进 DOM（如 `innerHTML`）。

**防护**：

```vue
<!-- 1) 默认用文本绑定（不解析 HTML），Vue 的 {{ }} 自动转义 -->
<div>{{ userInput }}</div>

<!-- 2) 必须渲染 HTML 时，用 v-html 且内容先经消毒库（DOMPurify） -->
<div v-html="sanitizedHtml" />
```

```ts
import DOMPurify from 'dompurify'
const sanitizedHtml = DOMPurify.sanitize(rawHtml) // 剥掉 script/onerror 等
```

> VueChest 的评论/展示类组件用 `v-text` 防 XSS（见项目约定）；需要富文本才走 `v-html + DOMPurify`。

## 二、CSRF（跨站请求伪造）

**原理**：攻击者诱导已登录用户访问恶意页，该页悄悄发起「带用户 cookie 的请求」（如转账）。

**防护**：

- **SameSite Cookie**：`Set-Cookie: SameSite=Lax/Strict`，跨站请求不带 cookie（首选）。
- **CSRF Token**：表单/敏感请求带服务端下发的随机 token，服务端校验。
- **校验 Referer / Origin**：确认请求来源同源。
- **关键操作二次确认 / 重新鉴权**。

SameSite 是重要缓解但不是唯一防线：子域接管、旧浏览器、需要 `SameSite=None` 的跨站业务和同站跨源请求仍要分析。服务端对有副作用的方法校验 token 或 Origin，并保证 GET 幂等；前端不能仅靠“请求头不是表单能发的”来推断永远安全。

## 三、CSP（内容安全策略）

**原理**：用 HTTP 头白名单限定「能加载哪些脚本/资源」，即使有 XSS 漏洞也难执行外部脚本。

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-abc123'; img-src 'self' data:;
```

> 配合每个 HTTP 响应随机生成的 `nonce` 或固定脚本 `hash` 给可信内联脚本放行；示例中的 `abc123` 只是占位，不能复用。先用 `Content-Security-Policy-Report-Only` 收集违规，再逐步收紧；CSP 是纵深防御，不能替代输出编码和消毒。

## 四、同源策略与 CORS

- **同源**：协议 + 域名 + 端口三者相同。跨源请求受同源策略限制。
- **CORS**：服务端用 `Access-Control-Allow-Origin` 等头声明「允许哪些源跨域访问」。
- 开发期跨域用 Vite `server.proxy`（见 `vite`）转发，避免在前端放开 `*` 通配。
  > 注意：`Access-Control-Allow-Origin: *` 配合 `credentials` 无效；带 cookie 的跨域必须显式指定源。

## 五、SQL 注入（后端侧，前端也要懂）

**原理**：把用户输入直接拼进 SQL，改变语义（如 `' OR '1'='1`）。

**防护（后端）**：参数化查询 / 预编译语句，**绝不字符串拼接**：

```js
// ❌ 危险
await db.query(`SELECT * FROM users WHERE name = '${req.body.name}'`)
// ✅ 安全（参数化）
await db.query('SELECT * FROM users WHERE name = ?', [req.body.name])
```

> 前端校验只改善体验，攻击者可以绕过浏览器直接调用 API，因此前端可以传递业务允许的原始输入，真正的安全边界必须在后端做参数化查询、授权和输入约束。不要把“前端过滤特殊字符”当成 SQL 注入防护。

## 六、依赖与供应链安全

- 定期 `npm audit` 查已知漏洞，及时升级。
- 提交对应包管理器的锁文件，保证依赖树可复现。
- 警惕「typosquatting」伪装包、安装前看下载量与维护情况。
- 对应 OWASP LLM 的 Supply Chain（LLM03）思路：第三方模型/库/插件也要审计。

锁文件不证明依赖安全，`audit` 也只能发现已有公告。CI 还应限制安装脚本、审查新增依赖与维护者变化、生成 SBOM，并为高风险升级保留回滚。浏览器第三方脚本尽量自托管；从 CDN 加载固定资源时可配 Subresource Integrity。

## 七、认证、授权与浏览器隔离

认证回答“你是谁”，授权回答“你能做什么”。隐藏按钮和前端路由守卫都不是授权，服务端必须对每个对象执行权限校验，避免用户把 `/users/1` 改成 `/users/2` 读取他人数据。会话 Cookie 使用 `Secure; HttpOnly; SameSite`，设置尽量窄的 Domain/Path 和合理过期；退出、改密与风险事件应使服务端会话失效。

外链使用 `target="_blank"` 时配 `rel="noopener noreferrer"`；敏感页面通过 CSP `frame-ancestors` 或兼容头防 clickjacking。iframe、Web Worker 和市场插件要按不可信代码设计隔离，`postMessage` 接收侧校验 `source`、精确 origin、消息 schema 和能力权限，不能看到消息类型就执行。

## 八、常见坑与攻击面

- **只过滤 `<script>`**：XSS 还可来自事件属性、危险 URL、SVG 和 DOM API。按输出上下文编码，富文本交给成熟 sanitizer。
- **把 CORS 当鉴权或 CSRF 防护**：CORS 约束浏览器读取响应，不阻止服务端客户端发请求，也不能替代权限检查。
- **JWT 放 LocalStorage 就“无状态安全”**：XSS 可读取；选择存储方式前比较 CSRF、XSS、撤销和多端会话需求。
- **错误信息泄漏内部细节**：用户看到稳定错误码，堆栈、SQL 和凭证只进入受控日志并脱敏。
- **开放重定向和 URL 代理**：回跳地址、图片代理、Webhook 都要规范化并做 allowlist，防钓鱼和 SSRF。
- **文件上传只看扩展名**：限制体积和类型、随机文件名、隔离存储，服务端重新识别内容并禁止上传目录执行。

## 九、安全检查清单（上线前）

- [ ] 所有输入在服务端按业务 schema 校验，所有输出按 HTML/属性/URL/JS 上下文编码
- [ ] 富文本消毒配置有测试，依赖更新时复查允许标签和 URL 协议
- [ ] Cookie、CSRF、CORS、CSP、frame-ancestors 与 TLS 策略明确
- [ ] 每个 API 做服务端认证和对象级授权，敏感操作可撤销或二次认证
- [ ] postMessage、重定向、上传、代理与第三方脚本有独立威胁建模
- [ ] 依赖锁定、漏洞扫描、secret 扫描、日志脱敏和事件响应进入 CI/运维

## 十、速查清单（上线前过一遍）

- [ ] 所有不可信文本走 `{{ }}` / `v-text`，不裸 `innerHTML` / `v-html`
- [ ] 必须 `v-html` 的内容经 DOMPurify 消毒
- [ ] Cookie 设 `HttpOnly` + `SameSite`
- [ ] 敏感请求带 CSRF Token / 二次确认
- [ ] 评估开启 CSP
- [ ] 跨域走显式 CORS 或 dev proxy，不开 `*`
- [ ] SQL 全部参数化；`npm audit` 无高危

## 参考来源

- MDN Web 安全：<https://developer.mozilla.org/zh-CN/docs/Web/Security>
- OWASP Top 10（Web）：<https://owasp.org/www-project-top-ten/>
- XSS 防护备忘：<https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>
- CSP 介绍：<https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CSP>
- DOMPurify：<https://github.com/cure53/DOMPurify>
- OWASP CSRF 防护：<https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- OWASP 第三方 JavaScript：<https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html>
