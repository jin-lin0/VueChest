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

## 七、常见误区

- **测实现细节**：断言 `wrapper.vm.xxx` 私有状态，重构即碎。改测用户可见行为。
- **单测依赖真实后端**：变慢且不稳定，一律 mock 网络层。
- **一个用例多断言混在一起**：拆小，失败信息才清晰。
- **忽略快照滥用**：`toMatchSnapshot()` 适合稳定 UI，对频繁变动的结构会制造噪声，谨慎用。

## 八、小结

- 组合式函数直接测 `.value`；组件用 Testing Library 测行为；store 用 `setActivePinia` 裸测。
- 网络/定时器一律 mock，单测要快、要 deterministic。
- 覆盖率服务"防回归"，不是 KPI——聚焦高风险分支。

## 参考来源

- Vitest 官方文档：<https://vitest.dev/>
- Vue Test Utils：<https://test-utils.vuejs.org/>
- Testing Library 查询优先级：<https://testing-library.com/docs/queries/about/>
- Vue 官方"测试"指南：<https://vuejs.org/guide/scaling-up/testing.html>
