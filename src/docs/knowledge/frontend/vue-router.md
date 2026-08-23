---
group: Vue 生态
order: 9
---

# Vue Router 实战

> 适用场景：Vue 3 单页应用的路由管理。本文聚焦工程落地高频点：懒加载、路由守卫、动态路由、嵌套路由、过渡动画坑。
> 阅读前提：Vue 3 组合式 API（见 `vue3-composition`）。

VueChest 当前使用 Vue Router 4.5.1。它把路由拆成「创建 Router → 定义 routes → `app.use(router)` → 模板 `<router-view>`/`<router-link>`」四步；官方已发布向后兼容的 v5 过渡版本，升级时要关注后续移除的 deprecated API。下面直接讲工程实战。

## 一、创建 Router 与 History 模式

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // 干净 URL，需服务端兜底
  routes: [{ path: '/', name: 'home', component: () => import('@/views/Home.vue') }],
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 } // 浏览器前进/后退恢复位置，否则回顶
  },
})
```

> `createWebHistory` 需要服务器把所有路径回退到 `index.html`（SPA 兜底）。若部署在子路径或静态托管不支持兜底，用 `createWebHashHistory`（带 `#`，无需服务端配置）。VueChest 生产用 history 模式。

## 二、路由懒加载（分包核心）

组件用 `() => import()` 动态导入，构建时会**自动切出独立 chunk**，首屏只加载当前路由需要的代码：

```ts
const routes = [
  { path: '/docs', name: 'docs', component: () => import('@/views/Docs.vue') },
  { path: '/market', name: 'market', component: () => import('@/views/Market.vue') },
]
```

> 这是前端性能优化（见 `perf-frontend`）在路由层最直接的体现：按路由分包 = 按需加载。配合 Vite（见 `vite`）的 `manualChunks` 可进一步把 `node_modules` 的大库（如 echarts、three）单独拆包。

## 三、路由守卫

### 1. 全局前置守卫（鉴权最常见）

```ts
import { useUserStore } from '@/stores/user'

router.beforeEach((to) => {
  const user = useUserStore()
  // 需要登录但没 token → 重定向登录页
  if (to.meta.requiresAuth && !user.isLogin) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 已登录还想进登录页 → 回首页（返回 falsy 表示放行也可用）
  if (to.name === 'login' && user.isLogin) {
    return { name: 'home' }
  }
  // 其余放行
})
```

> `next` 第三个参数仍被兼容支持，但 API 已标记 deprecated，且分支中多调/漏调容易让导航挂起。新代码用返回值控制：`return false` 取消、`return { name }` 重定向、不返回或 `return true` 放行。

### 2. 路由级与组件级守卫

```ts
// 路由配置里
{
  path: '/edit',
  component: () => import('@/views/Edit.vue'),
  // 进入前
  beforeEnter: (to, from) => { /* ... */ },
}

// 组件内（<script setup> 用组合式 API）
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges.value) return confirm('有未保存内容，确定离开？')
})
```

> `onBeforeRouteLeave` 适合「表单未保存拦截」这类组件级逻辑，比全局守卫更精准。

## 四、动态路由与参数

```ts
// :id 动态段
{ path: '/user/:id', name: 'user', component: () => import('@/views/User.vue'), props: true }

// 组件中
import { useRoute } from 'vue-router'
const route = useRoute()
route.params.id        // 字符串，注意类型
// 监听参数变化（同一组件复用、只改 id 时）
watch(() => route.params.id, (id) => { /* 重新拉数据 */ })
```

> 加 `props: true` 后，`id` 会作为 prop 传入组件，比直接读 `route.params` 更解耦、更易测试。
> **坑**：同一路由切换参数（如 `/user/1` → `/user/2`）组件**不会重建**，必须 `watch` 或 `onBeforeRouteUpdate` 重新拉数据，否则页面不刷新。

## 五、嵌套路由

```ts
{
  path: '/panel',
  component: () => import('@/views/Panel.vue'), // 该组件内要有 <router-view>
  children: [
    { path: '', name: 'panel', component: () => import('@/views/PanelHome.vue') },
    { path: 'settings', name: 'panel-settings', component: () => import('@/views/PanelSettings.vue') },
  ],
}
```

> 父路由组件必须包含 `<router-view>` 才能渲染 children。`.vue` 文件里的 `RouterView` 组件就是它。

## 六、过渡动画与异步路由（VueChest 实测）

给 `<router-view>` 包 `<transition>` 做切页动画是常规操作，但有一个**致命坑**：

```vue
<!-- VueChest 曾在该组合下出现返回白屏 -->
<router-view v-slot="{ Component }">
  <transition name="fade" mode="out-in">
    <component :is="Component" />
  </transition>
</router-view>
```

`mode="out-in"` 会先等待旧视图离场，再挂载新视图；如果异步组件加载、key、KeepAlive 或嵌套 Transition 的处理不完整，中间可能出现空白。它不是 Vue Router 对所有异步路由的通用禁令，但 VueChest 在当前外壳组合中曾复现白屏，因此项目选择默认同时进出模式，并通过路由 loading/error 状态处理 chunk 加载。

```vue
<!-- ✅ 正确：用默认模式（同时进出），不加 mode="out-in" -->
<router-view v-slot="{ Component }">
  <transition name="fade">
    <component :is="Component" />
  </transition>
</router-view>
```

> 通用排查要检查 `<component :is>` 的 key、异步组件错误、KeepAlive 顺序和 CSS 动画是否确实结束；项目约定可以比框架规则更严格，但面试时应区分“项目决策”和“框架必然行为”。

## 七、滚动容器与滚动监听

VueChest 的外壳滚动容器是 `.app-main`（不是 `window`）。涉及滚动监听 / scroll-spy（如文档目录高亮）要挂到该容器，而非 `window`：

```ts
const main = document.querySelector('.app-main')!
main.addEventListener('scroll', onScroll)
// 滚动行为 scrollBehavior 返回的是 window 滚动，若外壳是 .app-main 需自行处理
```

> 路由级 `scrollBehavior` 只管 `window` 滚动；当主滚动发生在内部容器时，需自己监听该容器并 `scrollTo`。

## 八、数据加载、失败与权限边界

守卫适合判断能否进入和准备全局前置条件，不应塞入所有页面请求。关键数据可在 `beforeResolve` 阻塞导航，普通数据进入页面后加载并显示骨架；任何异步加载都要处理新导航取消旧导航。`router.push()` 返回 Promise，菜单关闭、埋点等后续动作需要检查 navigation failure。

前端 meta/守卫只控制界面入口，不能替代后端授权。用户能直接调用 API，也能修改客户端状态；服务端必须检查身份与对象级权限。重定向参数只允许站内安全路径，避免登录后跳转成为开放重定向。

## 九、常见坑与排障

- 守卫无条件重定向到当前目标，造成无限循环；重定向前排除登录页并检查目标是否已满足。
- 监听整个 reactive route，任何 query/hash 变化都重复请求；只 watch 需要的 param/query。
- 动态添加路由后忘记重新导航或移除旧路由，权限切换后残留入口。
- chunk 新版本部署后旧页面加载异步文件 404；捕获 `router.onError`，提示刷新并保证部署/CDN 原子性。
- 组件内用原生 `confirm` 阻塞且不可主题化；复用项目 ConfirmDialog，并把确认结果转换为 guard 返回值。
- 内部滚动容器仍依赖 `scrollBehavior`，导致返回位置无法恢复；按 route key 自己保存容器 scrollTop。

## 十、路由设计检查清单

1. history base 与服务器 fallback 匹配，真实深链接和刷新能打开。
2. 路由名、params/query 类型和编码明确，不用字符串手拼 URL。
3. 守卫返回路径无循环，异步失败、取消和 navigation failure 有处理。
4. 前端只做入口控制，API 继续做服务端认证和授权。
5. 懒加载有 loading/error/重试，部署保留旧 chunk 或提供刷新恢复。
6. 参数复用、滚动恢复、标题/焦点播报和 404 页面都有测试。

## 参考来源

- Vue Router 官方文档：<https://router.vuejs.org/>
- 路由懒加载：<https://router.vuejs.org/guide/advanced/lazy-loading.html>
- 导航守卫：<https://router.vuejs.org/guide/advanced/navigation-guards.html>
- 过渡动效：<https://router.vuejs.org/guide/advanced/transitions.html>
- 导航失败：<https://router.vuejs.org/guide/advanced/navigation-failures.html>
- Vue Router 5 迁移：<https://router.vuejs.org/guide/migration/v4-to-v5>
