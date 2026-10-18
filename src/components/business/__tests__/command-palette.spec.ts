// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

/**
 * 命令面板在入口 chunk 里被拆成了两层：
 *   - CommandPalette.vue（热键壳，留在入口）：常驻监听 Cmd/Ctrl+K 与 openCommandPalette() 事件；
 *   - CommandPalettePanel.vue（面板，独立 chunk）：命令目录、键盘导航、结果渲染。
 *
 * 这组用例锁住拆分后必须成立的行为契约 —— 尤其是「面板 chunk 还没到达时，热键不能失灵」，
 * 这正是「直接用 defineAsyncComponent 包整个面板」会踩的坑。
 *
 * store 全部替换成最小桩：这里要验的是两层的协作与时序，不是 store 行为。
 */
const mocks = vi.hoisted(() => ({
  fetchApps: vi.fn(),
  installState: {
    installedApps: [] as Array<{
      id: number
      name: string
      description: string
      icon: string
      route: string
    }>,
    availableApps: [] as Array<{ id: number; name: string; description: string; icon: string }>,
  },
  storage: new Map<string, unknown>(),
}))

vi.mock('@/stores/market', () => ({
  useMarketStore: () => ({
    get installedApps() {
      return mocks.installState.installedApps
    },
    get availableApps() {
      return mocks.installState.availableApps
    },
    isInstalled: () => false,
    fetchApps: mocks.fetchApps,
    fetchAppDetail: async () => null,
    ensureBundle: async () => '',
  }),
}))

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({
    config: { workspaces: [{ id: 'default', name: '我的工作台', icon: '⌂' }], recentApps: [] },
    recordRecent: vi.fn(),
    setActiveWorkspace: vi.fn(),
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAdmin: false, isAuthenticated: false }),
}))

vi.mock('@/apps/app-commands', () => ({
  loadBuiltinAppCommandProviders: async () => [],
}))

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    mocks.storage.has(key) ? mocks.storage.get(key) : (fallback ?? null),
  setStorage: (key: string, value: unknown) => {
    mocks.storage.set(key, value)
  },
  removeStorage: (key: string) => {
    mocks.storage.delete(key)
  },
  initStorage: async () => {},
  applyStoragePatch: async () => {},
}))

import CommandPalette from '../CommandPalette.vue'
import { openCommandPalette } from '@/lib/command-palette'

let app: App
let root: HTMLElement
let router: Router
let pinia: Pinia

const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
// 面板是 defineAsyncComponent + 动态 import，解析要跨若干轮微任务，用轮询等待最稳。
const waitForPanel = () => vi.waitFor(() => expect(backdrop()).not.toBeNull())
const waitForPanelClosed = () => vi.waitFor(() => expect(backdrop()).toBeNull())
const backdrop = () => document.querySelector('.palette-backdrop')
const searchInput = () => document.querySelector<HTMLInputElement>('.palette-search input')
const pressCommandK = () =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
  )

async function mountPalette() {
  app = createApp(CommandPalette)
  app.use(pinia)
  app.use(router)
  app.mount(root)
}

beforeEach(async () => {
  mocks.installState.installedApps = [
    {
      id: 1,
      name: '示例应用',
      description: '一个测试用应用',
      icon: '🧪',
      route: '/market-installed/1',
    },
  ]
  mocks.installState.availableApps = []
  mocks.storage.clear()
  mocks.fetchApps.mockClear()

  root = document.createElement('div')
  document.body.appendChild(root)
  pinia = createPinia()
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { render: () => null } }],
  })
  await router.push('/')
  await router.isReady()
})

afterEach(() => {
  app?.unmount()
  root.remove()
  document.body.innerHTML = ''
})

describe('CommandPalette 拆分后的协作契约', () => {
  it('面板 chunk 到达前按下 Cmd+K，chunk 到达后立即打开（热键不被懒加载推迟）', async () => {
    await mountPalette()

    // mount 返回时壳已挂载、监听已注册，而面板的 chunk 仍在飞行中
    expect(backdrop()).toBeNull()
    pressCommandK()

    // 面板到位后应当已经处于打开态，不需要用户再按一次
    await waitForPanel()
    expect(document.querySelectorAll('.palette-item').length).toBeGreaterThan(0)
  })

  it('未唤起时不渲染任何面板内容（面板常驻但不可见）', async () => {
    await mountPalette()
    await flush()
    expect(backdrop()).toBeNull()
  })

  it('Cmd/Ctrl+K 是开关：再次按下关闭', async () => {
    await mountPalette()
    await flush()

    pressCommandK()
    await waitForPanel()

    pressCommandK()
    await waitForPanelClosed()
  })

  it('openCommandPalette() 事件能带初值唤起并回填搜索框', async () => {
    await mountPalette()
    await flush()

    openCommandPalette('股票')
    await waitForPanel()
    expect(searchInput()?.value).toBe('股票')
  })

  it('Esc 关闭面板，且不清空 store 之外的持久化内容', async () => {
    await mountPalette()
    await flush()

    pressCommandK()
    await waitForPanel()

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await waitForPanelClosed()

    // 再次打开不应残留上一次的关键词
    pressCommandK()
    await waitForPanel()
    expect(searchInput()?.value).toBe('')
  })

  it('带初值打开再关闭后，热键重新打开应清空旧的初值', async () => {
    await mountPalette()
    openCommandPalette('股票')
    await waitForPanel()
    pressCommandK()
    await waitForPanelClosed()
    pressCommandK()
    await waitForPanel()
    expect(searchInput()?.value).toBe('')
  })
})
