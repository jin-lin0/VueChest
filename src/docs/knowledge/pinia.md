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
  // actions：同步/异步都行，是唯一改 state 的地方
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

count.value++          // 直接改 state（Pinia 允许，无需 action）
store.increment()      // 也可通过 action 改
</script>
```

**高频坑：`storeToRefs` vs 直接解构**
- `const { count } = store` → `count` 变成普通数字，**不会随 store 变化**。
- 正确：`storeToRefs(store)` 只挑 state/getters 变 ref；actions 用普通解构。

## 三、组件外使用 Store

在路由守卫、`axios` 拦截器、工具函数里用 store 时，必须先有「激活的 Pinia 实例」：

```ts
// utils/request.ts
import { useUserStore } from '@/stores/user'
import { createPinia } from 'pinia'

// 若当前上下文尚未激活 pinia（如纯模块导入阶段），手动挂一个
const pinia = createPinia()
const user = useUserStore(pinia) // 传入 pinia 实例
```

> 在 Vue 应用内（`app.use(pinia)` 之后）直接 `useXxxStore()` 即可，无需传参；**只有「在 setup 之外、pinia 未激活处」才需要手动传实例**。VueChest 的 `request.ts` 拦截器就踩过这个坑。

## 四、状态持久化

用官方插件 `pinia-plugin-persistedstate`，把 store 落本地存储：

```ts
// main.ts
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
```

```ts
export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(null)
  return { token }
}, {
  persist: {
    key: 'vc-user',          // localStorage key
    pick: ['token'],         // 只持久化 token，不存 profile
    storage: localStorage,   // 默认就是 localStorage
  },
})
```

> 注意：只持久化「必要的、可重建的」字段（如 token、主题偏好），**不要把大对象/敏感信息整块写本地**。VueChest 的用户会话与主题开关就是这么落的。

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

export const useUserStore = defineStore('user', () => {
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
}, {
  persist: { key: 'vc-user', pick: ['token'] },
})
```

## 参考来源

- Pinia 官方文档：<https://pinia.vuejs.org/>
- 对比 Vuex：<https://pinia.vuejs.org/introduction.html#comparison-with-vuex>
- 持久化插件：<https://prazdevs.github.io/pinia-plugin-persistedstate/>
- Vue 官方状态管理指南：<https://vuejs.org/guide/scaling-up/state-management.html>
