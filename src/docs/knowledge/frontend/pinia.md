---
group: Vue 生态
order: 8
---

# Pinia 状态管理深入

> 适用场景：Vue 3 中大型应用的状态管理（替代 Vuex）。核心优势：TS 友好、无 mutations、支持 setup 风格、体积更小。
> 阅读前提：已掌握 Vue 3 组合式 API（`ref`/`reactive`/`computed`，见 `vue3-composition`）。

Pinia 是 Vue 官方推荐的状态库。它把 Vuex 的「state / getters / mutations / actions」精简为「state / getters / actions」——**mutations 被彻底去掉**，因为 `ref`/`reactive` 本来就是可变的，再包一层 mutation 纯属冗余。

## 一、定义 Store 的两种风格

### 1. Option Store（传统、直观，类似 Vuex）

```ts
// stores/counter.ts
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  // state：必须是个函数，返回初始对象（保证每个实例独立）
  state: () => ({
    count: 0,
    name: 'VueChest',
  }),
  // getters：相当于 computed，可访问其他 getter（this）
  getters: {
    double: (state) => state.count * 2,
    // 访问另一个 getter：用 this
    doublePlusOne() {
      return this.double + 1
    },
  },
  // actions：同步/异步都行，集中表达业务操作
  actions: {
    increment() {
      this.count++
    },
    async loadName() {
      const res = await fetch('/api/name')
      this.name = await res.text()
    },
  },
})
```

### 2. Setup Store（组合式，推荐 TS 项目）

把 `setup()` 的写法搬过来——`ref` 即 state、`computed` 即 getter、普通函数即 action，自由度最高：

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(null)
  const profile = ref<{ id: number; name: string } | null>(null)

  const isLogin = computed(() => !!token.value)

  function login(t: string) {
    token.value = t
  }
  async function fetchProfile() {
    profile.value = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token.value}` },
    }).then((r) => r.json())
  }

  // 必须 return 出去才会暴露给组件
  return { token, profile, isLogin, login, fetchProfile }
})
```

> 选型：纯数据 + 简单派生用 Option 更清晰；需要复杂逻辑、复用组合式函数、强 TS 推断时用 Setup。VueChest 的新 store 统一用 Setup 风格。

## 二、在组件中使用

```vue
<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'
import { storeToRefs } from 'pinia'

const store = useCounterStore()
// ⚠️ 解构会丢失响应式！state/ getter 必须用 storeToRefs
const { count, double } = storeToRefs(store)
// actions 可直接解构（它们是普通函数，不是响应式数据）
const { increment } = store

count.value++ // 直接改 state（Pinia 允许，无需 action）
store.increment() // 也可通过 action 改
</script>
```

**高频坑：`storeToRefs` vs 直接解构**

- `const { count } = store` → `count` 变成普通数字，**不会随 store 变化**。
- 正确：`storeToRefs(store)` 只挑 state/getters 变 ref；actions 用普通解构。

## 三、组件外使用 Store

在路由守卫、`axios` 拦截器、工具函数里用 store 时，必须先有「激活的 Pinia 实例」：

```ts
// stores/index.ts
import { createPinia } from 'pinia'
export const pinia = createPinia()

// router/guards.ts：复用应用安装的同一个实例
import { pinia } from '@/stores'
import { useUserStore } from '@/stores/user'
const user = useUserStore(pinia)
```

> 在 Vue 应用内（`app.use(pinia)` 之后）直接 `useXxxStore()` 即可。setup 外如果执行时机早于安装，显式传入应用使用的同一个 Pinia 实例；不要在请求模块里另建 `createPinia()`，否则会得到与页面不一致的第二棵状态树。SSR 中更要为每次请求创建实例，不能用跨请求单例。

## 四、状态持久化

可用社区插件 `pinia-plugin-persistedstate` 把 store 落本地存储，也可以用 `$subscribe` 自己实现白名单持久化：

```ts
// main.ts
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
```

```ts
export const useUserStore = defineStore(
  'user',
  () => {
    const token = ref<string | null>(null)
    return { token }
  },
  {
    persist: {
      key: 'vc-user', // localStorage key
      pick: ['token'], // 只持久化 token，不存 profile
      storage: localStorage, // 默认就是 localStorage
    },
  },
)
```

> 注意：只持久化必要字段并做版本迁移，不要把大对象或敏感信息整块写本地。高安全会话优先由服务端设置 HttpOnly Cookie；若产品架构确实使用可被 JS 读取的 token，必须正视 XSS 风险，而不能把持久化插件当成安全能力。

## 五、与组合式函数（Composables）协作

Store 不是万能容器，**局部 UI 状态应留在组件/composable，跨组件共享才进 store**：

```ts
// composables/useModal.ts —— 局部状态，不必进 store
export function useModal() {
  const open = ref(false)
  return { open }
}

// stores/cart.ts —— 跨页面共享，进 store
export const useCartStore = defineStore('cart', () => {
  const items = ref<Product[]>([])
  const total = computed(() => items.value.reduce((s, i) => s + i.price, 0))
  return { items, total }
})
```

经验法则：**一个状态被≥2 个不相关组件需要** → store；**仅单个组件/功能内循环** → `ref` 即可。

## 六、调试与 DevTools

Pinia 原生支持 Vue DevTools：可时间旅行、编辑 state、追踪 action 调用栈。开发期在 DevTools 的「Pinia」面板即可看到每个 store 的实时状态与 action 触发记录，无需额外配置。

## 七、完整示例（组合式 + 持久化 + 类型）

```ts
// stores/user.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore(
  'user',
  () => {
    const token = ref<string | null>(null)
    const profile = ref<{ id: number; name: string } | null>(null)
    const isLogin = computed(() => !!token.value)

    function setToken(t: string) {
      token.value = t
    }
    function logout() {
      token.value = null
      profile.value = null
    }
    return { token, profile, isLogin, setToken, logout }
  },
  {
    persist: { key: 'vc-user', pick: ['token'] },
  },
)
```

## 八、异步 action 与竞态

Pinia 不替你管理请求生命周期。同一个 action 并发执行时，旧响应可能覆盖新状态；组件卸载也不会自动取消 store 中的请求。搜索、切换账号等场景要使用 AbortController 或请求序号，并把 pending/error 按操作或实体建模，避免一个全局 loading 互相覆盖。

```ts
let profileRequest = 0

async function fetchProfile(userId: number) {
  const requestId = ++profileRequest
  status.value = 'pending'
  try {
    const next = await api.getProfile(userId)
    if (requestId !== profileRequest) return
    profile.value = next
    status.value = 'success'
  } catch (error) {
    if (requestId !== profileRequest) return
    status.value = 'error'
    throw error
  }
}
```

乐观更新要先保存最小回滚快照，请求失败恢复；服务端还需幂等或版本校验。不要在 getter 中发请求或修改状态，getter 应保持纯派生，副作用统一进入 action 或 service。

## 九、Store 组合、SSR 与测试

Store 可以调用另一个 store，但要避免在 setup 顶层形成循环读取。公共依赖可放在 action 内按需获取，或抽成纯 service。跨 store 操作若有不变量，定义一个编排 action 统一提交，不让组件分别调用半套流程。

SSR 每个请求创建新的 Pinia；服务端生成的状态要安全序列化并在客户端使用 store 前注入。持久化插件也必须检查是否处于浏览器环境。测试时 `setActivePinia(createPinia())` 为每个用例隔离实例；对组件可使用 `@pinia/testing`，但关键 action 应保留至少一组非 stub 行为测试。

## 十、Pinia 设计检查清单

1. 只把跨组件、跨路由的客户端事实放入 store，服务端缓存交给查询层。
2. state 保存最小事实，getter 纯派生，action 表达业务意图和失败恢复。
3. state/getter 解构使用 `storeToRefs`，action 可直接解构。
4. 组件外复用应用的同一个 Pinia 实例；SSR 则每请求独立创建。
5. 持久化使用字段白名单、账号命名空间、schema 版本和退出清理。
6. 异步 action 测试乱序、取消、重试、乐观回滚和重复提交。
7. store 过大时按业务能力拆分，限制跨 store 依赖方向。

## 参考来源

- Pinia 官方文档：<https://pinia.vuejs.org/>
- 对比 Vuex：<https://pinia.vuejs.org/introduction.html#comparison-with-vuex>
- Pinia actions：<https://pinia.vuejs.org/core-concepts/actions.html>
- Pinia SSR：<https://pinia.vuejs.org/ssr/>
- Pinia 测试：<https://pinia.vuejs.org/cookbook/testing.html>
- 持久化插件：<https://prazdevs.github.io/pinia-plugin-persistedstate/>
- Vue 官方状态管理指南：<https://vuejs.org/guide/scaling-up/state-management.html>
