# Vue 3 组合式 API 实战

组合式 API（Composition API）是 Vue 3 的核心编程范式。它用「函数」而非「选项对象」组织逻辑，让相关代码（状态、计算、副作用、生命周期）聚在一起，解决 Options API 在复杂组件中「关注点被切碎到 data / methods / computed / mounted 各处」的问题。本文聚焦**能直接落地的写法、响应式原理与高频坑**，配合 `<script setup>` 使用。

## 一、为什么用组合式 API

| 维度       | Options API            | 组合式 API（`<script setup>`）      |
| ---------- | ---------------------- | ----------------------------------- |
| 逻辑组织   | 按选项类型切分         | 按功能关注点聚拢                    |
| 复用       | mixins（来源不明、冲突）| 组合式函数 composables（显式导入）  |
| TS 支持    | 类型推导弱             | 类型推导好，与 TS 天然契合          |
| 代码压缩   | 属性名需保留           | 可被 tree-shake，命名更自由         |

经验法则：新项目一律 `<script setup>`；旧组件维持 Options API 不动，逐步迁移即可。

## 二、`<script setup>` 极简起步

`<script setup>` 是编译时语法糖：顶层绑定自动暴露给模板，无需 `return`。

```vue
<script setup lang="ts">
import { ref } from 'vue'

// 顶层声明即模板可用，无需 return
const count = ref(0)
function inc() {
  count.value++
}
</script>

<template>
  <button @click="inc">{{ count }}</button>
</template>
```

要点：`<script setup>` 中的 `ref` 在模板里**自动解包**，模板里写 `count` 而非 `count.value`；在 `<script>` 逻辑里仍需 `.value`。

## 三、响应式核心：ref / reactive

### ref：任意类型，含基本类型

```ts
import { ref } from 'vue'
const n = ref(0) // 基本类型必须用 ref
const user = ref({ name: '张三' }) // 对象也行，内部自动 deep reactive
n.value++ // 修改走 .value
```

### reactive：对象 / 数组专用

```ts
import { reactive } from 'vue'
const state = reactive({ count: 0, list: [] as number[] })
state.count++ // 直接改，无需 .value
```

**选型**：基本类型 / 需要整体替换 / 要传入函数用 `ref`；固定结构的对象用 `reactive`。两者都可被 `computed` / `watch` 追踪。

> 响应式的本质：Vue 3 用 `Proxy` 代理对象，在 `get` 时收集依赖（effect），在 `set` 时触发更新；`ref` 是对 `.value` 的 getter/setter 包装。相比 Vue 2 的 `Object.defineProperty`，Proxy 能监听新增/删除属性与数组索引。

### 解构丢失响应式的坑

```ts
const state = reactive({ a: 1, b: 2 })
const { a, b } = state // ❌ a/b 变成普通值，失去响应式
const { a, b } = toRefs(state) // ✅ 转成 ref，保留响应式
// 或只取一个：
const aRef = toRef(state, 'a')
```

`toRefs` / `toRef` 把 `reactive` 的每个属性包成 `ref`，解构后仍可追踪。

## 四、computed / watch / watchEffect

### computed：派生状态，带缓存

```ts
const list = ref([1, 2, 3])
const total = computed(() => list.value.reduce((s, i) => s + i, 0))
const double = computed({
  get: () => list.value.length,
  set: (v) => (list.value = Array(v).fill(0)),
})
```

依赖不变不重算；不要在计算属性里做副作用（用 `watch`）。

### watch：侦听特定源

```ts
import { watch, ref } from 'vue'
const keyword = ref('')

// 侦听单个 ref
watch(keyword, (newVal, oldVal) => {
  console.log(newVal, oldVal)
})

// 侦听多个源 / getter
watch(
  () => state.count,
  (v) => console.log('count', v),
)

// 深度侦听对象内部变化（开销大，谨慎）
watch(state, () => {}, { deep: true })
// 仅关心引用替换时不必 deep
```

### watchEffect：自动收集依赖

```ts
import { watchEffect, ref } from 'vue'
const a = ref(1)
const b = ref(2)
watchEffect(() => {
  console.log(a.value + b.value) // 自动追踪 a、b，任一变即重跑
})
```

**什么时候用**：`watch` 拿新旧值、需要「变化才执行」；`watchEffect` 立即执行且依赖自动收集，适合「派生副作用」（如根据状态发请求、同步 DOM）。

## 五、生命周期

`<script setup>` 中直接用 `onXxx` 函数注册：

```ts
import { onMounted, onUpdated, onUnmounted } from 'vue'

onMounted(() => {
  console.log('挂载完成')
})
onUnmounted(() => {
  // 清理定时器 / 事件监听 / 订阅，避免内存泄漏
})
```

对应关系：Options 的 `mounted` → `onMounted`，`beforeUnmount` → `onBeforeUnmount`，其余同理。同一钩子可注册多次，按注册顺序执行。

## 六、组合式函数 composables

把「状态 + 逻辑」抽成可复用函数，是组合式 API 的精髓。`useXxx` 约定以 `use` 开头，内部用 `ref`/`reactive` 持有状态，返回供组件使用。

```ts
// composables/useCounter.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useCounter(initial = 0) {
  const count = ref(initial)
  const inc = () => count.value++
  const dec = () => count.value--

  // 组合式函数内也能挂生命周期
  let timer: number
  onMounted(() => {
    timer = window.setInterval(inc, 1000)
  })
  onUnmounted(() => clearInterval(timer))

  return { count, inc, dec }
}
```

```vue
<!-- 组件内 -->
<script setup lang="ts">
import { useCounter } from '@/composables/useCounter'
const { count, inc } = useCounter(10)
</script>
```

相比 mixins：来源显式、无命名冲突、参数可传入、TS 推导完整。

## 七、异步与 Suspense

`<script setup>` 顶层可用 `await`（被编译为 `async setup`）；配合 `<Suspense>` 展示加载态：

```vue
<script setup lang="ts">
const res = await fetch('/api/profile').then((r) => r.json())
const profile = ref(res)
</script>
```

```vue
<template>
  <Suspense>
    <template #default><Profile /></template>
    <template #fallback><Spinner /></template>
  </Suspense>
</template>
```

注意：顶层 `await` 会让组件变为异步，父级需 `<Suspense>` 包裹（或自行处理加载态）。

## 八、状态管理（Pinia 简述）

跨组件共享状态用 [Pinia](https://pinia.vuejs.org/)（Vue 官方推荐，取代 Vuex）：

```ts
// stores/counter.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const double = computed(() => count.value * 2)
  function inc() {
    count.value++
  }
  return { count, double, inc }
})
```

```vue
<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'
const store = useCounterStore()
store.inc() // 直接调用 action
</script>
```

组合式风格定义 store（`setup` 语法）与组件写法一致，类型推导完整。

## 九、高频坑速记

| 坑                                  | 正确做法                                          |
| ----------------------------------- | ------------------------------------------------- |
| 解构 `reactive` 丢失响应            | 用 `toRefs` / `toRef`                             |
| 在 `computed` 里写副作用            | 改用 `watch` / `watchEffect`                     |
| `watch` 对象不生效                  | 加 `{ deep: true }` 或 watch getter              |
| `v-for` 用 `ref` 数组拿 DOM        | 用函数 ref：`ref={(el) => (els[i] = el)}`        |
| 异步 setup 没加载态                | 外层包 `<Suspense>`                               |
| `reactive` 整体替换变普通对象      | 用 `Object.assign(state, newObj)` 而非 `state =` |

## 参考来源

- Vue 官方文档（组合式 API）：[vuejs.org/guide/extras/composition-api-faq](https://vuejs.org/guide/extras/composition-api-faq.html)
- Vue `<script setup>`：[vuejs.org/api/sfc-sfc-script-setup](https://vuejs.org/api/sfc-sfc-script-setup.html)
- Vue 响应式基础：[vuejs.org/guide/essentials/reactivity-fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- Pinia 官方文档：[pinia.vuejs.org](https://pinia.vuejs.org/)
- Vue 中文文档：[cn.vuejs.org](https://cn.vuejs.org/)
