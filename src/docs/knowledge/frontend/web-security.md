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

## 三、CSP（内容安全策略）

**原理**：用 HTTP 头白名单限定「能加载哪些脚本/资源」，即使有 XSS 漏洞也难执行外部脚本。

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-abc123'; img-src 'self' data:;
```

> 配合 `nonce`（一次性随机数）或 `hash` 给可信内联脚本放行；`unsafe-inline` 尽量别开。VueChest 生产可评估加 CSP。

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

> 前端虽不直接写 SQL，但要明白「为什么不能把用户输入裸传给后端」——配合 Agent 安全（见 `agent-security`）里「模型输出不直接执行」的原则一致。

## 六、依赖与供应链安全

- 定期 `npm audit` 查已知漏洞，及时升级。
- 锁文件（package-lock）保证依赖树可复现。
- 警惕「typosquatting」伪装包、安装前看下载量与维护情况。
- 对应 OWASP LLM 的 Supply Chain（LLM03）思路：第三方模型/库/插件也要审计。

## 七、速查清单（上线前过一遍）

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
