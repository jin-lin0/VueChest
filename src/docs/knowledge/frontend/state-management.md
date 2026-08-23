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

状态还可以按“谁拥有最终事实”继续划分：URL 状态应尽量落在路由查询参数中，刷新和分享后仍可恢复；表单草稿由表单或页面拥有；服务端数据的权威副本在远端；全局 store 更适合用户身份、主题、跨路由工作流等客户端事实。这个归属判断比先选库更重要。

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

## 八、设计一个可维护 store

### 最小状态与派生状态

只存不可再推导的事实，数量、总价、过滤结果等用 getter/computed 计算。重复保存同一事实会产生同步责任，例如同时存 `items` 和 `itemCount`，删除条目却忘记更新数量。实体多且互相引用时，可按 ID 归一化，列表只存 ID，实体表存详情，更新一个实体时不必遍历所有列表。

```ts
interface EntityState<T> {
  byId: Record<string, T>
  allIds: string[]
}

const users = reactive<EntityState<User>>({ byId: {}, allIds: [] })

function upsertUser(user: User) {
  if (!users.byId[user.id]) users.allIds.push(user.id)
  users.byId[user.id] = user
}

const userList = computed(() => users.allIds.map((id) => users.byId[id]))
```

### Action 是业务入口，不是 setter 集合

组件应表达“结算购物车”“切换账号”这样的业务意图，action 内统一处理校验、请求、状态转移和错误。若组件到处直接改多个字段，规则会分散且难以测试。简单输入可以直接双向绑定，但跨字段不变量应由 action 维护。

异步 action 至少区分 idle/pending/success/error，并处理旧响应覆盖新请求。只用一个全局 `loading` 无法表达多个并发请求；可以按实体 ID 记录 pending，或给请求分配序号，只接受最新结果。

```ts
const query = ref('')
const result = ref<Item[]>([])
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
let requestVersion = 0

async function search(nextQuery: string) {
  const version = ++requestVersion
  query.value = nextQuery
  status.value = 'pending'
  try {
    const next = await api.search(nextQuery)
    if (version !== requestVersion) return
    result.value = next
    status.value = 'success'
  } catch (error) {
    if (version !== requestVersion) return
    status.value = 'error'
    throw error
  }
}
```

## 九、持久化、SSR 与账号切换

持久化不是给整个 store 加一次 `JSON.stringify`。令牌、临时错误、DOM/类实例和大体积服务端缓存通常不应落盘；要持久化的状态应带 schema 版本、默认值和迁移函数，并把不同用户的数据按账号命名空间隔离。退出登录时显式清理内存和敏感持久化数据。

SSR 必须为每次请求创建独立 store，不能让模块级单例在用户之间共享。服务端状态序列化进 HTML 时还要安全转义，客户端在创建依赖它的 store 之前完成 hydration，否则会出现首屏闪烁或 hydration mismatch。Pinia 官方也建议对可被用户影响的 SSR 状态使用安全序列化方案。

```ts
type PersistedV2 = { version: 2; theme: 'light' | 'dark'; locale: string }

function migrate(value: unknown): PersistedV2 {
  const raw = value as Partial<PersistedV2> | null
  return {
    version: 2,
    theme: raw?.theme === 'dark' ? 'dark' : 'light',
    locale: typeof raw?.locale === 'string' ? raw.locale : 'zh-CN',
  }
}
```

## 十、调试与测试策略

- getter 测派生边界，action 测状态转移和失败恢复，持久化测旧版本迁移。
- 用独立 store 实例隔离测试，网络和时间放在可替换的依赖层。
- DevTools 查看一次用户操作触发了哪些 action 和 mutation；若一次点击写入大量无关状态，通常意味着 store 边界过大。
- 性能问题先检查订阅粒度和选择器返回值稳定性，不要未经测量就拆成大量原子。

## 十一、常见误区

- **把服务端数据存进全局 store 当缓存**：重复造轮子还易过期 → 用查询库。
- **全局状态过度**：一个 `loading` 也进 Redux → 组件局部即可。
- **忽视不可变**：手写 reducer 改了原对象导致不更新（RTK/Pinia 已帮处理）。
- **一个巨型根 store**：所有模块互相读取，难以复用和测试 → 按业务能力拆分，只暴露必要 action/getter。
- **持久化敏感或短命状态**：登录退出后串号，schema 变化后页面崩溃 → 白名单持久化并做版本迁移。
- **把请求成功当成本地一定一致**：并发、重试和乱序仍可能覆盖状态 → 设计请求身份、幂等键或乐观更新回滚。

## 十二、状态方案决策流程

1. 这个值能否由 props、已有状态或 URL 推导？能则不要新增状态。
2. 谁是权威来源？组件、路由、浏览器、服务端还是跨页面业务流程？
3. 谁需要读写、生命周期多长、刷新后是否必须恢复？
4. 是否存在缓存失效、并发覆盖、乐观更新或账号隔离问题？
5. 先选最小工具验证；只有出现跨树共享、调试和插件需求时再引入全局库。
6. 上线前补齐失败、重试、退出登录、版本迁移和 SSR hydration 测试。

## 参考来源

- Pinia 文档：<https://pinia.vuejs.org/>
- Pinia SSR 与 hydration：<https://pinia.vuejs.org/ssr/>
- Redux Toolkit：<https://redux-toolkit.js.org/>
- Zustand：<https://github.com/pmndrs/zustand>
- Jotai：<https://jotai.org/>
- TanStack Vue Query：<https://tanstack.com/query/latest/docs/framework/vue>
