// @vitest-environment happy-dom
/**
 * 应用市场搜索框的**请求次数**与**等待态**。
 *
 * 输入框是 `@input` 触发的，也就是每敲一个字符都要走一次。之前这个处理函数直接
 * 调 `loadApps()`，于是敲「周杰伦」会打出 3 个 HTTP + 3 条 SQL；更要命的是这 3 个
 * 请求的返回顺序不保证，旧响应后到时列表会和输入框自相矛盾（store 侧已用
 * `createLatestOnly` 兜住，测试见 stores/__tests__/market-race.spec.ts）。
 *
 * 这里钉住三件事：
 * 1. 连续敲字**不立刻**发请求（防抖生效），窗口过后只发**一次**，且用最后的关键字；
 * 2. 防抖窗口内界面必须仍在**等待态**，不能因为本地 `filteredApps` 用新关键字
 *    过滤旧结果而闪一下「暂无应用」；
 * 3. 类目切换、清空搜索这类离散动作仍然**立即**发请求，不能被防抖拖慢。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'

const mocks = vi.hoisted(() => ({
  fetchApps: vi.fn(),
  checkForUpdates: vi.fn(),
  fetchRanking: vi.fn(),
  apiGet: vi.fn(),
  // 由 mock 工厂填入；测试用它控制 store 的可见状态
  store: null as null | {
    availableApps: { value: unknown[] }
    ranking: { value: unknown[] }
    isLoading: { value: boolean }
    fetchError: { value: string }
  },
}))

vi.mock('@/lib/request', () => ({
  API_BASE: 'http://localhost:3000',
  api: { get: mocks.apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn() }),
}))

vi.mock('@/stores/market', async () => {
  const { ref, reactive, computed } = await import('vue')
  mocks.store = {
    availableApps: ref([]),
    ranking: ref([]),
    isLoading: ref(false),
    fetchError: ref(''),
  }
  // 必须用 reactive 包一层：pinia 的 store 会把内部 ref 解包成普通值，
  // 模板里读到的 `market.isLoading` 是布尔；若这里返回裸对象，
  // 它会是恒真的 Ref，骨架屏就再也去不掉了（夹具失真会直接骗过测试）。
  const state = reactive({
    ...mocks.store,
    availableUpdates: computed(() => []),
    fetchApps: mocks.fetchApps,
    checkForUpdates: mocks.checkForUpdates,
    fetchRanking: mocks.fetchRanking,
    isInstalled: () => false,
    hasUpdate: () => false,
    isUpdating: () => false,
    installApp: vi.fn(),
    updateApp: vi.fn(),
  })
  return {
    PermissionCancelledError: class PermissionCancelledError extends Error {},
    useMarketStore: () => state,
  }
})

import AppMarket from '../AppMarket.vue'

let app: App
let root: HTMLElement

function store() {
  if (!mocks.store) throw new Error('store mock 未初始化')
  return mocks.store
}

/** 铺开微任务队列：onMounted 里有一个 await 的分类请求。 */
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}

function searchInput(): HTMLInputElement {
  const el = document.querySelector('.search-input')
  if (!el) throw new Error('搜索框未渲染')
  return el as HTMLInputElement
}

function type(value: string) {
  const input = searchInput()
  input.value = value
  input.dispatchEvent(new Event('input'))
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.fetchApps.mockReset().mockResolvedValue(undefined)
  mocks.checkForUpdates.mockReset().mockResolvedValue([])
  mocks.fetchRanking.mockReset().mockResolvedValue(undefined)
  mocks.apiGet.mockReset().mockResolvedValue({ data: [] })

  root = document.createElement('div')
  document.body.append(root)
  app = createApp(AppMarket)
  app.mount(root)
})

afterEach(() => {
  app.unmount()
  root.remove()
  vi.useRealTimers()
})

describe('应用市场搜索框', () => {
  it('连续敲字不逐字符发请求，窗口过后只发一次且用最后的关键字', async () => {
    await flush()
    // 挂载时的一次列表请求
    expect(mocks.fetchApps).toHaveBeenCalledTimes(1)

    for (const value of ['周', '周杰', '周杰伦']) {
      type(value)
      await nextTick()
      // 每敲一下都等一小会儿，模拟真实打字速度（远小于防抖窗口）
      await vi.advanceTimersByTimeAsync(60)
    }

    // 还没到防抖窗口：一次都不该发
    expect(mocks.fetchApps).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)

    // 三次敲击只换来最后一次请求
    expect(mocks.fetchApps).toHaveBeenCalledTimes(2)
    expect(mocks.fetchApps.mock.calls[1][0]).toMatchObject({
      keyword: '周杰伦',
      page: 1,
      limit: 20,
    })
  })

  it('防抖窗口内维持等待态，不闪「暂无应用」', async () => {
    await flush()
    // 挂载后列表为空且没有请求在飞 —— 此时「暂无应用」是正确的
    expect(document.querySelector('.market-skel')).toBeNull()
    expect(document.body.textContent).toContain('暂无应用')

    type('周杰伦')
    await nextTick()

    // 请求尚未发出，但界面必须已进入等待态：
    // 否则 filteredApps 会拿「周杰伦」去过滤空列表，闪出「暂无应用」
    expect(mocks.fetchApps).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.market-skel')).not.toBeNull()
    expect(document.body.textContent).not.toContain('暂无应用')

    // 窗口过后请求发出、等待态交还给 store
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.fetchApps).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.market-skel')).toBeNull()
  })

  it('空白关键字不带到服务端（与原行为一致）', async () => {
    await flush()
    type('   ')
    await vi.advanceTimersByTimeAsync(1000)

    expect(mocks.fetchApps).toHaveBeenCalledTimes(2)
    expect(mocks.fetchApps.mock.calls[1][0].keyword).toBeUndefined()
  })

  it('切换类目是离散动作，必须立即发请求而不是等防抖', async () => {
    await flush()
    expect(mocks.fetchApps).toHaveBeenCalledTimes(1)

    const tabs = Array.from(document.querySelectorAll('.category-tab')) as HTMLElement[]
    const dev = tabs.find((el) => el.textContent?.includes('开发'))
    if (!dev) throw new Error('未找到「开发」类目')
    dev.click()
    await nextTick()

    // 一个 tick 内就该发出去，无需推进定时器
    expect(mocks.fetchApps).toHaveBeenCalledTimes(2)
    expect(mocks.fetchApps.mock.calls[1][0]).toMatchObject({ category: '开发', page: 1 })
  })

  it('清空搜索是离散动作，必须立即发请求', async () => {
    await flush()
    type('周杰伦')
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.fetchApps).toHaveBeenCalledTimes(2)

    const clear = document.querySelector('.search-clear') as HTMLElement | null
    if (!clear) throw new Error('清空按钮未渲染')
    clear.click()
    await nextTick()

    expect(mocks.fetchApps).toHaveBeenCalledTimes(3)
    expect(mocks.fetchApps.mock.calls[2][0].keyword).toBeUndefined()
  })

  it('store 在飞时的骨架屏仍然生效（新增条件没有把原条件顶掉）', async () => {
    store().isLoading.value = true
    await nextTick()
    expect(document.querySelector('.market-skel')).not.toBeNull()

    store().isLoading.value = false
    await nextTick()
    expect(document.querySelector('.market-skel')).toBeNull()
  })
})
