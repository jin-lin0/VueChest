---
group: 工程化与构建
order: 14
---

# 前端单元测试实战（Vitest + Testing Library）

> 测试不是"写完才补"，而是"先想清楚输入输出再写"。本文以 VueChest 实际栈（Vue 3 + TS + Vite + **Vitest**）为例，讲清组件、组合式函数、Pinia store 三类核心对象的测试套路，以及覆盖率、网络与定时器处理。

## 一、为什么用 Vitest

Vitest 与 Vite 共享同一套配置（`vite.config.ts`）和转换管道，无需额外 babel/webpack 胶水，启动与热更都极快；API 兼容 Jest（`describe/it/expect`），迁移成本几乎为零。

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom', // 或 'jsdom'；happy-dom 更快、内存占用更小
    globals: true, // 直接用 describe/it/expect，不必 import
    coverage: {
      provider: 'v8', // 或 'istanbul'
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.d.ts', 'src/main.ts'],
    },
  },
})
```

> 注：VueChest 运行器已是 Vitest，用例放 `*.spec.ts` 同层 `__tests__/`；勿用 `*.test.ts` / `node:test`。

## 二、测试组合式函数（composable）

组合式函数通常依赖组件实例生命周期，需用 `@vue/test-utils` 的 `mount` 或 Vitest 的 `withSetup` 提供上下文。

```ts
// useCounter.spec.ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useCounter } from '@/composables/useCounter'

describe('useCounter', () => {
  it('increments and decrements within bounds', () => {
    const { count, inc, dec } = useCounter(0, { min: 0, max: 5 })
    inc()
    inc()
    expect(count.value).toBe(2)
    dec()
    dec()
    dec()
    expect(count.value).toBe(0) // 触底不越界
  })

  it('resets to initial value', () => {
    const { count, inc, reset } = useCounter(3)
    inc()
    reset()
    expect(count.value).toBe(3)
  })
})
```

要点：`composable` 返回的是 `ref`/`computed`，断言直接读 `.value`；纯函数逻辑的 composable 可脱离组件直接测。

## 三、测试组件（Testing Library 思路）

优先测"行为"而非"实现细节"。用 `@testing-library/vue` 的 `render` + `fireEvent`，断言 DOM 与可访问性属性，而非去读内部 `data`。

```ts
// StarRating.spec.ts
import { render, fireEvent } from '@testing-library/vue'
import StarRating from '@/components/business/StarRating.vue'

it('emits rating on click', async () => {
  const { getByLabelText, emitted } = render(StarRating, { props: { modelValue: 0 } })
  await fireEvent.click(getByLabelText('第 4 星'))
  expect(emitted('update:modelValue')?.[0]).toEqual([4])
})
```

推荐查询优先级（Testing Library）：`getByRole` > `getByLabelText` > `getByText` > `getByTestId`。"找得到角色"的 DOM 天然可访问，测试与 a11y 双赢。

## 四、测试 Pinia store

store 是纯逻辑，最适合单元测试。组件外套一层 `setActivePinia(createPinia())` 即可。

```ts
// useAuth.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, it, expect } from 'vitest'
import { useAuthStore } from '@/stores/auth'

beforeEach(() => setActivePinia(createPinia()))

it('login sets token and user', async () => {
  const store = useAuthStore()
  await store.login('alice', 'pw')
  expect(store.isLoggedIn).toBe(true)
  expect(store.token).toBeTruthy()
})
```

> 若 store 调了真实接口，用 `vi.mock('@/lib/request')` 把网络层替成桩，保证单测不依赖后端。

## 五、处理异步、定时器与网络

| 场景                | 做法                                                       |
| ------------------- | ---------------------------------------------------------- |
| `await nextTick()`  | 状态变更后等 DOM 刷新                                      |
| 定时器 `setTimeout` | `vi.useFakeTimers()` + `vi.advanceTimersByTime`            |
| fetch / axios       | `vi.mock` 接口层，或 `msw`（`mockServiceWorker`）模拟 HTTP |
| 流式/SSE            | 用 `vi.fn()` 替 `EventSource`/reader，手动 push 分片       |

```ts
import { vi } from 'vitest'
vi.mock('@/lib/request', () => ({
  request: vi.fn(async () => ({ success: true, data: { id: 1 } })),
}))
```

## 六、覆盖率与门禁

```bash
npm run test -- --coverage
```

CI 里设门禁（如 `v8` 的 `100% lines` 太严，建议分支覆盖 ≥70%），只对"易错分支"要求高覆盖。不要为覆盖率而写无意义的测试。

覆盖率只能说明哪些语句被执行过，不能证明断言有效。门禁阈值应基于当前基线逐步提高，并单独关注权限、金额、数据迁移、竞态与错误恢复等高风险分支。Vitest 的 V8 与 Istanbul provider 都可用；具体选择要根据运行环境、性能和 source map 准确性实测，而不是默认认为二者结果完全相同。

## 七、常见误区

- **测实现细节**：断言 `wrapper.vm.xxx` 私有状态，重构即碎。改测用户可见行为。
- **单测依赖真实后端**：变慢且不稳定，一律 mock 网络层。
- **一个用例多断言混在一起**：拆小，失败信息才清晰。
- **忽略快照滥用**：`toMatchSnapshot()` 适合稳定 UI，对频繁变动的结构会制造噪声，谨慎用。

## 八、测试分层与边界

单元测试适合纯函数、composable、store 状态转移；组件测试验证用户能看到和操作的行为；E2E 覆盖登录、支付、发布等跨页面关键路径。不要试图用一种测试解决全部问题：单元测试无法发现路由、CSS 和真实浏览器集成问题，E2E 又不适合穷举算法边界。

对第三方组件可以浅替换，但自己的业务子组件不要无条件 stub，否则父子事件契约坏了也会通过。网络层测试按目标选择：只关心 action 分支时 mock API 模块；要验证请求路径、方法和序列化时用 MSW 在协议层拦截；真正的 CORS、Cookie 和流式传输仍需浏览器集成测试。

### 异步断言怎么选

- 状态已经同步变化，只等 Vue 刷新 DOM：`await nextTick()`。
- 元素会在请求后出现：使用 `findByRole` 等异步查询。
- 等待无法直接查询的副作用：`waitFor`，回调里必须有会失败的断言。
- 断言元素消失：`waitForElementToBeRemoved`。

不要用固定 `setTimeout` “等一下”，它会让测试又慢又抖。使用 fake timer 后在 `afterEach` 恢复 real timer，并清理 mock；微任务、Vue 更新队列和 timer 是不同队列，必要时分别推进。

```ts
import { afterEach, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('debounce 后只搜索最后一次输入', async () => {
  vi.useFakeTimers()
  const search = vi.fn()
  searchDebounced('v')
  searchDebounced('vue')

  await vi.advanceTimersByTimeAsync(300)
  await waitFor(() => expect(search).toHaveBeenCalledWith('vue'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
```

> 示例中的 `searchDebounced` 应在测试夹具中注入 `search`；关键点是展示 timer 推进、异步断言与清理顺序，而不是依赖真实时间。

## 九、提交前检查清单

1. 测试名称是否描述“条件—行为—结果”，失败时能否直接看懂？
2. 查询是否优先使用 role/name/label，而不是 CSS 类和组件私有字段？
3. 成功、空数据、权限拒绝、超时、异常和重试是否覆盖关键分支？
4. mock 是否停在系统边界，还是把被测逻辑本身也 mock 掉了？
5. timer、全局对象、localStorage、Pinia 和 DOM 是否在用例间隔离？
6. 竞态用例是否能控制响应顺序，而不是依赖偶然的执行时机？
7. CI 是否固定时区、locale、随机种子或系统时间，失败时是否保留报告？

## 十、小结

- 组合式函数直接测 `.value`；组件用 Testing Library 测行为；store 用 `setActivePinia` 裸测。
- 网络/定时器一律 mock，单测要快、要 deterministic。
- 覆盖率服务"防回归"，不是 KPI——聚焦高风险分支。

## 参考来源

- Vitest 官方文档：<https://vitest.dev/>
- Vitest 覆盖率指南：<https://vitest.dev/guide/coverage.html>
- Vitest `vi` API：<https://vitest.dev/api/vi>
- Vue Test Utils：<https://test-utils.vuejs.org/>
- Testing Library 查询优先级：<https://testing-library.com/docs/queries/about/>
- Vue 官方"测试"指南：<https://vuejs.org/guide/scaling-up/testing.html>
