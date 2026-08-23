---
group: 架构与设计
order: 28
---

# SSR / SSG / Nuxt 入门

> 首屏直出 HTML 能显著改善 SEO 与首屏性能。本文讲清 CSR/SSR/SSG 的区别、Nuxt 的核心约定，以及"服务端渲染 + 客户端水合"的正确姿势，适合需要 SEO 的内容站/官网。

## 一、三种渲染模式

| 模式                  | 渲染地             | 首屏               | SEO | 适用                         |
| --------------------- | ------------------ | ------------------ | --- | ---------------------------- |
| **CSR**（客户端渲染） | 浏览器             | 慢（先 JS 后内容） | 弱  | 后台管理系统、强交互 SPA     |
| **SSR**（服务端渲染） | 每次请求服务端直出 | 快                 | 好  | 内容站、电商详情、需实时数据 |
| **SSG**（静态生成）   | 构建时预渲染       | 极快（静态文件）   | 好  | 文档、博客、营销页           |

> VueChest 是纯客户端 SPA（文档中心走前端 `marked` 渲染），若要做 SEO 友好的公开文档站，可抽成 Nuxt 的 SSG 子站。

## 二、Nuxt 核心约定

当前 Nuxt 4 基于 Vue、Vite 与 Nitro，奉行“约定优于配置”。Nuxt 大版本会调整默认目录等约定，迁移时应阅读对应升级指南；以下采用 Nuxt 4 的 `app/` 目录结构：

- `app/pages/` 目录自动生成**约定式路由**（文件名即路由），`[id].vue` 为动态路由，`[...slug].vue` 为 catch-all。
- `app/app.vue` 是根组件；`app/layouts/` 提供布局切换。
- `app/composables/` 与 `app/utils/` 自动导入，无需手动 `import`。
- `server/` 目录写**服务端 API**（Nitro），与前端同仓同构。

## 三、数据获取

Nuxt 区分"仅在服务端"与"同构"：

```vue
<script setup>
// 首次渲染可在服务端请求，结果进入 payload 供水合复用
const { data } = await useFetch('/api/posts')

// 客户端交互用 useState 做跨组件共享状态
const counter = useState('counter', () => 0)
</script>
```

- `useFetch` / `useAsyncData`：处理服务端预取并把结果序列化进 payload，客户端水合时可复用，避免初始请求重复。
- `$fetch`：适合按钮提交等事件驱动请求；若在 setup 中直接 `$fetch`，通用渲染时可能服务端和客户端各请求一次。
- 不要在 `setup` 顶层写浏览器专属 API（`window`），会破坏 SSR；用 `onMounted` 或 `import.meta.client` 守卫。

## 四、水合（Hydration）与常见坑

服务端直出 HTML，客户端再用 JS "接管"同样的 DOM 并绑定事件，这叫**水合**。坑：

- **内容不匹配**：服务端和客户端渲染出不同 HTML（如依赖 `Date.now()`/随机值/未守卫的 `window`）→ 水合警告、重新渲染。解决办法：用 `useFetch` 同构数据，或 `ClientOnly` 包裹仅客户端的片段。
- **第三方脚本**：地图/广告等只在 `onMounted` 初始化，避免服务端执行。
- **状态不一致**：跨请求共享的模块级变量会串数据，改用 `useState`（每请求独立）。

## 五、SEO 与元信息

```vue
<script setup>
useHead({
  title: '我的文章',
  meta: [{ name: 'description', content: '...' }],
})
</script>
```

Nuxt 内置 `useHead` 管理 `<title>`/`<meta>`，配合 `useSeoMeta` 更结构化；SSR 直出让爬虫直接拿到完整 meta。

## 六、混合渲染与缓存

不是整站只能选一种模式。Nuxt 可通过 `routeRules` 为营销页预渲染、内容页使用 SWR/ISR、账号后台关闭 SSR，同时让 Nitro 部署到 Node、Serverless 或 Edge。缓存前必须先判断响应是否因 Cookie、用户权限或地区而变化，不能把私人页面作为公共 CDN 缓存。

```ts
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/blog/**': { swr: 3600 },
    '/dashboard/**': { ssr: false },
  },
})
```

SSG 的成本从请求时转移到构建时，页面量过大时要控制爬取范围和增量更新；SSR 保持实时但增加服务器成本与故障面；SWR/ISR 用短暂旧内容换取响应速度。选型应逐路由做，而不是只给项目贴一个标签。

## 七、什么时候选 Nuxt

- 需要 SEO + 首屏性能的内容型站点 → Nuxt（SSG/SSR）。
- 纯内部后台、强交互 SPA → 继续用 Vite SPA（见 `vite.md`），别强行 SSR。
- 已有 Vue SPA 想加 SEO → 评估抽离公开页为 Nuxt 子站，而非整体迁移。

## 八、常见坑与安全边界

- **模块级可变单例**：Node 进程会服务多个请求，单例状态可能跨用户泄漏。共享常量可以，用户状态使用 `useState` 或请求上下文。
- **水合时读随机值/本地存储**：服务端值与客户端首帧不同。先渲染确定占位，挂载后再读取，或把服务端决定序列化进 payload。
- **把 secrets 暴露到 public runtime config**：只有服务端配置可放凭证，public 配置会发送给浏览器。
- **无界 payload**：把大对象完整序列化进 HTML 会增加 TTFB、流量和解析成本；使用 `pick/transform` 只传水合所需字段。
- **缓存忽略身份**：带用户数据的 SSR 响应不得进入共享缓存；明确 Vary、cache key 和私有策略。
- **只看 HTML 不看可交互时间**：SSR 更早显示内容，但仍可能发送大量 JS。继续做组件懒加载、减少 hydration 和真实用户监控。

## 九、渲染方案决策清单

1. 按路由确认 SEO、实时性、个性化、更新频率和可缓存性。
2. 静态且有限页面优先 prerender；高频访问且允许短暂旧内容考虑 SWR/ISR。
3. 强个性化 SSR 先评估服务器成本、缓存隔离、超时与降级。
4. 数据获取用 `useFetch/useAsyncData` 传递首屏 payload，交互请求用 `$fetch`。
5. 保证每请求状态隔离、payload 安全序列化、浏览器 API 有 client guard。
6. 同时测 TTFB、LCP、发送 JS、hydration 和 INP，不能只凭“服务端直出”判断更快。

## 参考来源

- Nuxt 4 官方文档：<https://nuxt.com/docs/4.x/getting-started/introduction>
- Nuxt 渲染模式：<https://nuxt.com/docs/4.x/guide/concepts/rendering>
- Nuxt 数据获取：<https://nuxt.com/docs/4.x/getting-started/data-fetching>
- Vue SSR 指南：<https://vuejs.org/guide/scaling-up/ssr.html>
- Nitro（Nuxt 服务端引擎）：<https://nitro.build/>
