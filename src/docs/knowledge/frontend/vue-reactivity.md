---
group: Vue 生态
order: 7
---

# Vue 3 响应式原理

> 适用场景：理解 `ref`/`reactive` 为什么「改了视图自动更新」、为何解构会丢响应、性能优化依据。本文讲 Proxy 拦截、依赖收集与派发更新。
> 阅读前提：Vue 3 组合式 API（见 `vue3-composition`）、JS Proxy（见 `js-modern`）。

Vue 3 的响应式不是「魔法」，而是 **Proxy + 依赖收集（track）/ 派发更新（trigger）** 的闭环。看懂它，才知道 `ref` vs `reactive` 怎么选、为什么解构会丢响应。

## 一、核心：Proxy 拦截

`reactive()` 用 `Proxy` 包裹对象，拦截「读（get）」和「写（set）」：

```js
const obj = { count: 0 }
const proxy = new Proxy(obj, {
  get(target, key, receiver) {
    track(target, key) // 读时：记录「谁在用我」
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    const r = Reflect.set(target, key, value, receiver)
    trigger(target, key) // 写时：通知「用我的人」重跑
    return r
  },
})
```

> Vue 用 `Proxy` 而非 Vue 2 的 `Object.defineProperty`：能拦截「新增属性 / 删除属性 / 数组索引」，且天然支持深层对象，无需 `$set`。

## 二、依赖收集（track）与派发更新（trigger）

- **track（读时）**：把「当前正在执行的副作用（effect）」和「(对象, key)」建立映射 ——「这个 effect 依赖这个字段」。
- **trigger（写时）**：字段变了，找到依赖它的所有 effect，重新执行（组件 re-render、computed 重算、watch 回调）。

```
effect(组件渲染) ──读─> state.count ──track──> 记录: 组件依赖 count
state.count = 1 ──set──trigger──> 找到依赖 count 的组件 ──> 重新渲染
```

> 这就是「改数据自动更新视图」的本质：读时登记、写时通知。

## 三、effect 与调度

- 组件的渲染函数、computed、watch 底层都是 `effect`（带调度器的副作用）。
- **computed**：懒计算 + 缓存，只有「被读取且依赖变了」才重算（带「脏标记」）。
- **watch**：显式监听，依赖变了执行回调（可异步、可拿到新旧值）。
- **调度器（scheduler）**：控制 effect 何时跑。组件更新用「异步队列 + 去重」——同一轮多次改 `count`，只触发一次重渲染（nextTick 后批量刷新），避免抖动。

## 四、ref 与 reactive 的实现差异

- **reactive**：直接 Proxy 一个对象（见上）。**只能用于对象/数组**，传原始值会报警。
- **ref**：包一层对象 `{ value: x }`，对 `.value` 做 get/set 拦截；模板里自动解包（不用写 `.value`）。原始值（`number/string/boolean`）必须用 ref。

```ts
import { ref, reactive } from 'vue'
const count = ref(0) // { value: 0 }，模板里 {{ count }} 自动解包
const state = reactive({ n: 0 }) // 直接 Proxy 对象，state.n
```

## 五、为什么「解构会丢响应」

```js
const state = reactive({ a: 1, b: 2 })
const { a, b } = state // ❌ a/b 是普通数字，脱离了 Proxy，不再被 track
```

解构把「Proxy 上的属性」拷成普通变量，丢失了 get/set 拦截 → 不再是响应式。
**解决**：`toRefs(state)` 把每个属性转成 ref，解构后仍是响应式的：

```js
const { a, b } = toRefs(state) // ✅ a/b 是 ref，.value 仍走 Proxy
```

> 同理：跨组件传 reactive 对象、或在 `storeToRefs`（见 `pinia`）里取 state/getters，本质都是「保持引用在 Proxy 上」。

## 六、深层响应与性能

- `reactive` 是**深层**的：嵌套对象也会被 Proxy（访问时才惰性代理）。
- 大列表 / 高频更新场景：
  - 用 `shallowRef` / `shallowReactive` 关掉深层代理，手动控制更新（性能好但需自己 trigger）。
  - 用 `markRaw` 标记「永远不代理」的对象（如第三方实例、大配置），避免无谓开销。
  - 与 `perf-frontend` / `browser-rendering` 协同：减少不必要的响应式开销 = 减少重渲染 = 更顺滑。

`reactive(raw) !== raw`，但对同一个 raw 重复调用会返回同一个代理。不要同时把 raw 与 proxy 当作 Map key 或用 `===` 混合比较，否则会出现 identity hazard。`toRaw()` 只适合临时读取或与第三方库交互，不要长期持有后继续修改；`markRaw()` 也只跳过被标记对象本身，嵌套值仍可能被代理。

## 七、与组合式 API 的衔接

- `<script setup>` 里 `ref`/`reactive` 声明的状态，模板自动追踪依赖（effect 包裹渲染）。
- `computed` / `watch` / `watchEffect` 都是基于同一套 track/trigger（见 `vue3-composition`）。
- 理解原理后，「为什么这个改动没刷新」「为什么这个解构不响应」都能秒懂。

## 八、速记

| 现象               | 根因                            |
| ------------------ | ------------------------------- |
| 改数据视图自动更新 | set 触发 trigger 通知 effect    |
| 解构对象属性不响应 | 脱离 Proxy，用 `toRefs`         |
| 原始值要用 ref     | reactive 只接对象               |
| 同轮多次改只刷一次 | 异步调度队列去重                |
| 新增属性也响应     | Proxy 拦截动态 key（Vue2 不可） |

## 九、watch 的调度与清理

默认 watcher 在父组件更新后、当前组件 DOM 更新前执行；需要读取更新后的 DOM 时用 `flush: 'post'`，必须同步响应时才考虑 `flush: 'sync'`。同步 watcher 不会批量去重，对高频数组修改非常危险。

异步副作用要在 watcher 失效时清理，避免旧请求覆盖新结果：

```ts
watch(
  userId,
  async (id, _oldId, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())

    const response = await fetch(`/api/users/${id}`, {
      signal: controller.signal,
    })
    profile.value = await response.json()
  },
  { immediate: true, flush: 'post' },
)
```

组件同步创建的 watcher 会随组件卸载自动停止；异步回调里后来创建的 watcher 可能脱离组件作用域，应保留 stop handle，或用 `effectScope()` 把一组 computed/watch 统一回收。

## 十、常见坑与排障

- **computed 内修改其他状态**：会制造隐式循环和难预测顺序。computed 保持纯函数，副作用放 action/watch。
- **深度 watch 大对象**：遍历成本随数据增长，且嵌套修改时 new/old 可能是同一对象。优先监听具体 getter 或不可变版本号。
- **把整个第三方实例 reactive**：图表、编辑器、SDK 实例通常不需要代理，用 `shallowRef` 或 `markRaw`。
- **只改 shallowRef 内部属性却期待更新**：浅 ref 只追踪 `.value` 替换；选择整体替换或明确 `triggerRef()`。
- **模板反复调用重函数**：渲染 effect 每次都会执行它；稳定派生值用 computed，并检查依赖是否过宽。
- **响应式丢失却盲目加 deep**：先确认是否解构、替换了 reactive 变量或拿到了 raw 对象，再决定 watcher 深度。

调试时使用 Vue DevTools 和开发期的 `onRenderTracked/onRenderTriggered`，查看组件到底读取了哪个 key、哪次 set 触发了更新。性能优化应缩小依赖和更新范围，而不是把所有状态换成 shallow API。

## 十一、API 选型清单

1. 原始值、整体替换和 composable 返回值优先 `ref`；固定对象可用 `reactive`。
2. 大型不可变数据或外部实例用 `shallowRef/markRaw`，并明确更新方式。
3. 纯派生用 computed；外部副作用用 watch，并设计 cleanup 与 flush 时机。
4. 解构 reactive 使用 `toRefs/toRef`；store 解构使用 `storeToRefs`。
5. 遇到重复渲染先用调试钩子定位依赖，再做浅响应、拆组件或状态归一化。

## 参考来源

- Vue 响应式原理：<https://vuejs.org/guide/extras/reactivity-in-depth.html>
- 响应式基础：<https://vuejs.org/guide/essentials/reactivity-fundamentals.html>
- ref / reactive API：<https://vuejs.org/api/reactivity-core.html>
- 高级响应式 API：<https://vuejs.org/api/reactivity-advanced.html>
- MDN Proxy：<https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Proxy>
