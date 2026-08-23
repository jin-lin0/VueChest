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
- 缺点：URL 带 `#`，服务端和 CDN 看不到 fragment，难以按页面做服务端渲染、日志和缓存。SEO 主要取决于是否输出可索引内容，不能仅凭 hash/history 判断。

## 三、History 模式

```js
// 用 History API 改 URL 而不刷新
history.pushState({}, '', '/user/1') // 压入新历史
window.addEventListener('popstate', () => renderView(location.pathname))
// 拦截 <a> 点击，改为 pushState 并渲染，阻止默认跳转
renderView(location.pathname) // pushState 本身不会触发 popstate，要主动渲染
```

- URL 形如 `https://app.com/user/1`，可让服务端、CDN 和分析系统直接识别路径；SEO 仍取决于 SSR/SSG、meta 与内容质量，History API 本身不会生成可索引 HTML。
- **关键坑**：直接刷新 `/user/1` 时浏览器会真的向服务端请求该路径 → 服务端没有这个路由会 404。**必须在服务端把未知路径全部重写（fallback）到 `index.html`**（Nginx `try_files` / Vite `appType:'spa'` / 静态托管的通配）。

> Vue Router 的 `createWebHistory()` 即 history 模式；部署到任意静态服务器都要配 SPA fallback，否则深链接刷新 404。

## 四、SPA 路由核心流程

1. 用户点击链接 / 调用 `router.push`（拦截默认行为）。
2. 路由库匹配 `routes` 表，找到对应组件。
3. 执行**路由守卫**（见 `vue-router.md`：鉴权、数据预取）。
4. 解析异步组件（`import()` 懒加载分包）。
5. 渲染目标视图；过渡动画与异步 loading/error 要协同。VueChest 的当前外壳避免 `mode="out-in"`，这是项目兼容决策，不是所有 RouterView 的框架禁令。

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

## 七、一个最小 History Router

真正的路由器还要处理 base、URL 编码、query/hash、嵌套路由、守卫、异步失败和滚动；下面只展示 History API 的关键闭环：

```js
const routes = new Map([
  ['/', () => '<h1>首页</h1>'],
  ['/about', () => '<h1>关于</h1>'],
])

function render() {
  const view = routes.get(location.pathname)
  document.querySelector('#app').innerHTML = view ? view() : '<h1>404</h1>'
}

function navigate(url) {
  const target = new URL(url, location.href)
  if (target.origin !== location.origin) {
    location.assign(target.href)
    return
  }
  history.pushState(null, '', target)
  render()
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return
  const link = event.target.closest('a[href]')
  if (!link || event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = new URL(link.href, location.href)
  if (target.origin !== location.origin || link.target === '_blank' || link.download) return
  event.preventDefault()
  navigate(target.href)
})

window.addEventListener('popstate', render)
render()
```

## 八、生命周期、滚动与 BFCache

后退/前进由 `popstate` 驱动，但浏览器还可能从 back-forward cache 恢复整页，此时 `pageshow` 的 `persisted` 可用于恢复易失连接或重新校验数据。不要用 `unload` 做关键保存，它会影响 BFCache 且不可靠；草稿应持续本地保存。

浏览器拥有 history entry 的滚动恢复。框架接管后，需要区分新导航回顶和 pop 导航恢复，并处理页面主滚动容器不是 window 的情况。锚点跳转还要等待异步内容完成，再定位目标元素。

## 九、常见坑与设计检查清单

- `pushState/replaceState` 不触发 `popstate`，调用后要主动更新视图。
- 不解析 URL 就字符串拼接，导致 query/hash 编码错误或开放重定向。
- 全拦截 `<a>`，破坏新标签、下载、外链、修饰键和无 JS 降级。
- 前端有 404 路由但服务器没有 fallback，刷新仍返回服务器 404。
- fallback 把 `/api/*` 和静态文件错误改写成 HTML，接口解析出现迷惑错误。

上线前验证 base 子路径、Unicode/保留字符、深链接刷新、前进后退、重复导航、滚动恢复、异步 chunk 404、外链和无权限重定向。需要 SEO 时再决定 CSR、SSR 或 SSG，路由模式只是 URL 与服务器协作的一部分。

## 十、小结

- Hash：改 `location.hash` + `hashchange`，无需服务端配置，URL 带 `#`。
- History：用 `pushState` + `popstate`，URL 干净但**必须配服务端 fallback** 防刷新 404。
- SPA 路由 = 拦截跳转 → 匹配 → 守卫 → 懒加载 → 渲染。
- 404 用通配路由兜底；history 模式服务端同步兜底。

## 参考来源

- MDN History API：<https://developer.mozilla.org/zh-CN/docs/Web/API/History_API>
- Vue Router 工作原理：<https://router.vuejs.org/guide/essentials/history-mode.html>
- 单页应用部署（SPA fallback）：<https://developer.mozilla.org/zh-CN/docs/Web/API/History_API#%E6%B5%8F%E8%A7%88%E5%99%A8%E6%94%AF%E6%8C%81>
- MDN `popstate`：<https://developer.mozilla.org/docs/Web/API/Window/popstate_event>
- MDN `pageshow`：<https://developer.mozilla.org/docs/Web/API/Window/pageshow_event>
