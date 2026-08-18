# Vue Router 实战

> 适用场景：Vue 3 单页应用的路由管理。本文聚焦工程落地高频点：懒加载、路由守卫、动态路由、嵌套路由、过渡动画坑。
> 阅读前提：Vue 3 组合式 API（见 `vue3-composition`）。

Vue Router 4（对应 Vue 3）把路由拆成「创建 Router → 定义 routes → `app.use(router)` → 模板 `<router-view>`/`<router-link>`」四步。下面跳过 hello-world，直接讲实战坑位。

## 一、创建 Router 与 History 模式

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // 干净 URL，需服务端兜底
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/Home.vue') },
  ],
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

> **Vue Router 4 已弃用 `next` 回调**，改为「返回值控制」：`return false` 取消导航、`return { name }` 重定向、不返回或 `return true` 放行。新代码不要再写 `next()`。

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

## 六、过渡动画坑（VueChest 实测）

给 `<router-view>` 包 `<transition>` 做切页动画是常规操作，但有一个**致命坑**：

```vue
<!-- ❌ 错误：mode="out-in" + 异步懒加载路由 = 返回白屏 -->
<router-view v-slot="{ Component }">
  <transition name="fade" mode="out-in">
    <component :is="Component" />
  </transition>
</router-view>
```

原因：`mode="out-in"` 要求「旧组件完全离场后再挂载新组件」，但路由组件是 `() => import()` 异步加载的，离场动画期间新组件还没 ready，调度会卡死 → **返回时整页白屏**。

```vue
<!-- ✅ 正确：用默认模式（同时进出），不加 mode="out-in" -->
<router-view v-slot="{ Component }">
  <transition name="fade">
    <component :is="Component" />
  </transition>
</router-view>
```

> 这是 VueChest 在文档中心切页时踩过的真实坑，已记录进项目约定。结论：**RouterView 过渡严禁 `mode="out-in"`**，用默认模式即可。

## 七、滚动容器与滚动监听

VueChest 的外壳滚动容器是 `.app-main`（不是 `window`）。涉及滚动监听 / scroll-spy（如文档目录高亮）要挂到该容器，而非 `window`：

```ts
const main = document.querySelector('.app-main')!
main.addEventListener('scroll', onScroll)
// 滚动行为 scrollBehavior 返回的是 window 滚动，若外壳是 .app-main 需自行处理
```

> 路由级 `scrollBehavior` 只管 `window` 滚动；当主滚动发生在内部容器时，需自己监听该容器并 `scrollTo`。

## 参考来源

- Vue Router 官方文档：<https://router.vuejs.org/>
- 路由懒加载：<https://router.vuejs.org/guide/advanced/lazy-loading.html>
- 导航守卫：<https://router.vuejs.org/guide/advanced/navigation-guards.html>
- 过渡动效：<https://router.vuejs.org/guide/advanced/transitions.html>
