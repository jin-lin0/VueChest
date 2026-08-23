---
group: 架构与设计
order: 26
---

# 前端状态管理对比

> 状态管理不是"越多越好"，而是按作用域选对工具。本文横向对比 Redux / Zustand / Pinia / Jotai / Signals，给出选型清单，避免小项目硬上重武器（配合 `pinia.md` / `vue-reactivity.md`）。

## 一、先分状态类型

| 类型             | 例子               | 建议方案                                 |
| ---------------- | ------------------ | ---------------------------------------- |
| **局部 UI 状态** | 弹窗开关、表单输入 | 组件内 `ref`/`useState`                  |
| **跨组件共享**   | 主题、登录用户     | 轻量 store / Context                     |
| **服务端缓存**   | 接口数据           | React Query / TanStack Query / Vue Query |
| **全局复杂状态** | 购物车、权限       | Pinia / Redux / Zustand                  |

> 黄金法则：**能局部就别全局**；服务端数据交给查询库缓存，别塞进 Redux/Pinia 当缓存。

## 二、主流方案对比

| 方案                 | 范式                          | 心智负担 | 生态   | 适合                       |
| -------------------- | ----------------------------- | -------- | ------ | -------------------------- |
| **Redux（Toolkit）** | 单一 store + reducer + 中间件 | 高       | 极大   | 大型 React、需时间旅行调试 |
| **Zustand**          | 极简 hook store               | 低       | 中     | React 轻量全局状态         |
| **Pinia**            | Composition 风格 store        | 低       | Vue    | Vue 3 官方推荐             |
| **Jotai**            | 原子化（Atom）                | 中       | React  | 细粒度派生状态             |
| **Signals**          | 细粒度响应式原语              | 低       | 跨框架 | 精细更新、框架底层         |

## 三、Redux Toolkit（现代 Redux）

```ts
import { createSlice } from '@reduxjs/toolkit'
const cart = createSlice({
  name: 'cart',
  initialState: [] as Item[],
  reducers: {
    add: (s, a) => {
      s.push(a.payload)
    }, // 内置 Immer，可直接"改"
  },
})
```

- RTK 用 Immer 让你"看起来改状态"；`createAsyncThunk` 管异步；DevTools 时间旅行调试强。
- 代价：样板多、概念多，小项目嫌重。

## 四、Zustand（React 轻量）

```ts
import { create } from 'zustand'
const useStore = create((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}))
const n = useStore((s) => s.count) // 选择性订阅，精准更新
```

- 无 Provider、无样板；选择性订阅避免无关重渲染。React 项目的"默认轻量解"。

## 五、Pinia（Vue 3）

```ts
export const useCart = defineStore('cart', () => {
  const items = ref<Item[]>([])
  const count = computed(() => items.value.length)
  function add(i: Item) {
    items.value.push(i)
  }
  return { items, count, add }
})
```

- Composition 风格，TS 推断好；无 mutation 概念（比 Vuex 简）；DevTools 支持（见 `pinia.md`）。

## 六、Jotai / Signals

- **Jotai**：原子化，每个 state 是独立 atom，组件只订阅用到的 atom，天然细粒度。
- **Signals**（SolidJS/Angular/Vue `ref` 思想）：细粒度响应式原语，更新精确到依赖节点，性能好、跨框架趋同。

## 七、选型清单

- Vue 项目 → **Pinia**（官方、顺手）。
- React 小/中项目 → **Zustand** 或 **Jotai**。
- React 大型/需强约束调试 → **Redux Toolkit**。
- 服务端数据 → **TanStack Query**（别自己写缓存）。
- 精细派生/性能敏感 → 原子化或 Signals。

## 八、常见误区

- **把服务端数据存进全局 store 当缓存**：重复造轮子还易过期 → 用查询库。
- **全局状态过度**：一个 `loading` 也进 Redux → 组件局部即可。
- **忽视不可变**：手写 reducer 改了原对象导致不更新（RTK/Pinia 已帮处理）。

## 参考来源

- Pinia 文档：<https://pinia.vuejs.org/>
- Redux Toolkit：<https://redux-toolkit.js.org/>
- Zustand：<https://github.com/pmndrs/zustand>
- Jotai：<https://jotai.org/>
