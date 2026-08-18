---
group: 浏览器原理与网络
order: 19
---

# 前端路由原理

> SPA 没有服务端逐路径返回 HTML，路由在前端完成。本文讲清 `hash` 与 `history` 两种模式的原理、SPA 路由如何工作，以及和 Vue Router（见 `vue-router.md`）的衔接，补齐"路由怎么来的"这一环。

## 一、为什么需要前端路由

传统多页（MPA）每次跳转都向服务端请求新 HTML，整页刷新。SPA 只在首次加载一个 HTML 壳，后续"切页面"由 JS 动态替换视图、更新 URL——快、体验连贯，但 URL 变化不再触发整页请求，需要框架接管。

## 二、Hash 模式

```js
// 原理：监听 hashchange，解析 location.hash
window.addEventListener('hashchange', () => {
  const path = location.hash.slice(1) || '/'
  renderView(path) // 按 path 渲染对应组件
})
```

- URL 形如 `https://app.com/#/user/1`，`#` 后的部分**不发给服务器**。
- 优点：无需服务端配置，刷新不会 404（服务端永远返回同一个 HTML 壳）。
- 缺点：URL 带 `#` 不美观；SEO 弱（搜索引擎历史上忽略 hash）。

## 三、History 模式

```js
// 用 History API 改 URL 而不刷新
history.pushState({ }, '', '/user/1') // 压入新历史
window.addEventListener('popstate', () => renderView(location.pathname))
// 拦截 <a> 点击，改为 pushState 并渲染，阻止默认跳转
```

- URL 形如 `https://app.com/user/1`，干净、利于 SEO。
- **关键坑**：直接刷新 `/user/1` 时浏览器会真的向服务端请求该路径 → 服务端没有这个路由会 404。**必须在服务端把未知路径全部重写（fallback）到 `index.html`**（Nginx `try_files` / Vite `appType:'spa'` / 静态托管的通配）。

> Vue Router 的 `createWebHistory()` 即 history 模式；部署到任意静态服务器都要配 SPA fallback，否则深链接刷新 404。

## 四、SPA 路由核心流程

1. 用户点击链接 / 调用 `router.push`（拦截默认行为）。
2. 路由库匹配 `routes` 表，找到对应组件。
3. 执行**路由守卫**（见 `vue-router.md`：鉴权、数据预取）。
4. 解析异步组件（`import()` 懒加载分包）。
5. 渲染目标视图；可加 `<Transition>`（**切勿 `mode="out-in"`**，会与异步懒加载冲突导致白屏）。

## 五、懒加载与分包

路由级懒加载让每个页面单独成 chunk，首屏只加载当前页：

```js
const routes = [
  { path: '/home', component: () => import('@/views/Home.vue') },
  { path: '/admin', component: () => import('@/views/Admin.vue') },
]
```

配合 Vite 的 `manualChunks`（见 `vite.md`）可进一步把 vendor 拆出，控制单包体积。

## 六、404 与通配

```js
{ path: '/:pathMatch(.*)*', component: NotFound } // 兜底 404
```

放在 routes 末尾，捕获所有未匹配路径；history 模式下服务端也要兜底到 index.html（但 SPA 内部 404 由前端这条规则渲染）。

## 七、小结

- Hash：改 `location.hash` + `hashchange`，无需服务端配置，URL 带 `#`。
- History：用 `pushState` + `popstate`，URL 干净但**必须配服务端 fallback** 防刷新 404。
- SPA 路由 = 拦截跳转 → 匹配 → 守卫 → 懒加载 → 渲染。
- 404 用通配路由兜底；history 模式服务端同步兜底。

## 参考来源

- MDN History API：<https://developer.mozilla.org/zh-CN/docs/Web/API/History_API>
- Vue Router 工作原理：<https://router.vuejs.org/guide/essentials/history-mode.html>
- 单页应用部署（SPA fallback）：<https://developer.mozilla.org/zh-CN/docs/Web/API/History_API#%E6%B5%8F%E8%A7%88%E5%99%A8%E6%94%AF%E6%8C%81>
