---
group: 架构与设计
order: 28
---

# SSR / SSG / Nuxt 入门

> 首屏直出 HTML 能显著改善 SEO 与首屏性能。本文讲清 CSR/SSR/SSG 的区别、Nuxt 的核心约定，以及"服务端渲染 + 客户端水合"的正确姿势，适合需要 SEO 的内容站/官网。

## 一、三种渲染模式

| 模式 | 渲染地 | 首屏 | SEO | 适用 |
| --- | --- | --- | --- | --- |
| **CSR**（客户端渲染） | 浏览器 | 慢（先 JS 后内容） | 弱 | 后台管理系统、强交互 SPA |
| **SSR**（服务端渲染） | 每次请求服务端直出 | 快 | 好 | 内容站、电商详情、需实时数据 |
| **SSG**（静态生成） | 构建时预渲染 | 极快（静态文件） | 好 | 文档、博客、营销页 |

> VueChest 是纯客户端 SPA（文档中心走前端 `marked` 渲染），若要做 SEO 友好的公开文档站，可抽成 Nuxt 的 SSG 子站。

## 二、Nuxt 核心约定

Nuxt 3（基于 Vue 3 + Vite + Nitro）奉行"约定优于配置"：

- `pages/` 目录自动生成**约定式路由**（文件名即路由），`[id].vue` 为动态路由，`[...slug].vue` 为 catch-all。
- `app.vue` 是根组件；`layouts/` 提供布局切换。
- `composables/` 与 `utils/` 自动导入，无需手动 `import`。
- `server/` 目录写**服务端 API**（Nitro），与前端同仓同构。

## 三、数据获取

Nuxt 区分"仅在服务端"与"同构"：

```vue
<script setup>
// 服务端获取（构建期或请求期，不进客户端 bundle）
const { data } = await useFetch('/api/posts')

// 客户端交互用 useState 做跨组件共享状态
const counter = useState('counter', () => 0)
</script>
```

- `useFetch` / `useAsyncData`：自动处理服务端预取 + 客户端缓存，避免"水合不匹配"。
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

## 六、流式 SSR（渐进式）

Nuxt 支持在组件级 `async setup` 配合 `<Suspense>`，让非关键区块延迟到客户端；或用 Nitro 的流式响应逐步吐出 HTML，缩短首字节（TTFB）。对长列表/富内容站体验提升明显。

## 七、什么时候选 Nuxt

- 需要 SEO + 首屏性能的内容型站点 → Nuxt（SSG/SSR）。
- 纯内部后台、强交互 SPA → 继续用 Vite SPA（见 `vite.md`），别强行 SSR。
- 已有 Vue SPA 想加 SEO → 评估抽离公开页为 Nuxt 子站，而非整体迁移。

## 参考来源

- Nuxt 官方文档：<https://nuxt.com/docs>
- Vue SSR 指南：<https://vuejs.org/guide/scaling-up/ssr.html>
- Nitro（Nuxt 服务端引擎）：<https://nitro.build/>
