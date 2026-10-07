// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  syncBadge: vi.fn(),
}))

vi.mock('@/lib/request', () => ({
  api: { get: mocks.apiGet, post: mocks.apiPost, put: vi.fn(), delete: mocks.apiDelete },
}))

vi.mock('@/lib/app-badge', () => ({ syncDocumentBadge: mocks.syncBadge }))

import NotificationCenter from '../NotificationCenter.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import type { AppNotification } from '@/lib/notification-format'

let app: App
let root: HTMLElement
let router: Router
let pinia: Pinia
let auth: ReturnType<typeof useAuthStore>
let media: ReturnType<typeof installMatchMedia>

type MediaListener = (event: MediaQueryListEvent) => void

async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}

/**
 * matchMedia 替身。容器按视口二选一（宽屏下拉浮层 / 窄屏贴底抽屉），
 * 所以测试既要能设定当前断点，也要能模拟运行中跨过断点。
 */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<MediaListener>()
  const state = { matches: initial }
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return state.matches
    },
    addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
  }))
  return {
    async cross(next: boolean) {
      state.matches = next
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent))
      await flush()
    },
    listenerCount: () => listeners.size,
  }
}

function makeNotification(id: number): AppNotification {
  return {
    id,
    type: 'market.comment.created',
    title: `通知 ${id}`,
    body: '',
    link: `/market/${id}`,
    appId: id,
    meta: null,
    read: false,
    createdAt: 1_700_000_000_000 + id,
  }
}

function page(items: AppNotification[], total = items.length, pageNo = 1) {
  return {
    data: items,
    pagination: { page: pageNo, limit: 20, total, hasMore: pageNo * 20 < total },
  }
}

/** 未读数请求默认成功（角标是旁路），列表请求由各用例自己定义 */
function mockApi(list: (path: string) => Promise<unknown>, unread = 0) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path.includes('unread-count')) return Promise.resolve({ data: { count: unread } })
    return list(path)
  })
}

async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(NotificationCenter)
  app.use(pinia)
  app.use(router)
  await router.push('/')
  await router.isReady()
  app.mount(root)
  await flush()
}

async function openPanel() {
  document.querySelector<HTMLButtonElement>('.bell-btn')!.click()
  await flush()
}

beforeEach(() => {
  vi.resetAllMocks()
  // 默认宽屏（下拉浮层分支），既有用例都基于这个形态
  media = installMatchMedia(false)
  pinia = createPinia()
  setActivePinia(pinia)
  // 用真实 auth store 驱动登录态：isAuthenticated 是 computed，
  // 只有真实响应式对象才能在测试里模拟「登出 → 重新登录」的切换。
  auth = useAuthStore()
  auth.token = 'test-token'
  auth.user = { id: 1, username: 'tester', role: 'user', isActive: true, installedApps: [] }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/notifications', component: { render: () => null } },
    ],
  })
})

afterEach(() => {
  app?.unmount()
  root?.remove()
  // Drawer 是 Teleport 到 body 的。上一条用例若在 <Transition> 离场途中被卸载，
  // 残留节点会污染下一条用例的全局查询（querySelector 只看 document），这里兜底清掉。
  document.querySelectorAll('.vc-drawer-overlay, .vc-drawer').forEach((node) => node.remove())
  // 抽屉打开时会锁页面滚动（useOverlay），卸载后仍兜底复位
  document.body.style.overflow = ''
  vi.unstubAllGlobals()
})

describe('NotificationCenter visibility', () => {
  it('renders nothing for guests and fires no request when the tab regains focus', async () => {
    auth.token = null
    mockApi(() => Promise.resolve(page([])))

    await mount()
    expect(document.querySelector('.bell-btn')).toBeNull()
    // 前提：标签页是「可见」的，确保下面拦下请求的是登录态而不是 hidden
    expect(document.hidden).toBe(false)

    // 未登录时组件整块不渲染，标签页「重新可见」也不该触发一次必然 401 的请求
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('renders the bell once authenticated', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()

    expect(document.querySelector('.bell-btn')).not.toBeNull()
  })

  /**
   * 上面那条游客用例的 `not.toHaveBeenCalled()` 在组件根本不渲染时恒真，
   * 拦不住「监听被删掉」这类回归——这条才是它的对偶。
   */
  it('refreshes the unread badge when the tab becomes visible again', async () => {
    mockApi(() => Promise.resolve(page([])), 3)

    await mount()
    mocks.apiGet.mockClear()

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.apiGet.mock.calls[0][0]).toContain('unread-count')
  })
})

describe('NotificationCenter list states', () => {
  it('shows an inline error with retry instead of the empty state when loading fails', async () => {
    mockApi(() => Promise.reject(new Error('服务不可用')))

    await mount()
    await openPanel()

    expect(document.querySelector('.panel-error-text')?.textContent).toBe('服务不可用')
    expect(document.querySelector('.retry-btn')?.textContent).toBe('重试')
    // 关键回归点：请求失败绝不能伪装成「暂无通知」
    expect(document.querySelector('.empty-title')).toBeNull()
  })

  it('still shows the empty state when the request succeeds with no rows', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()

    expect(document.querySelector('.panel-error')).toBeNull()
    expect(document.querySelector('.empty-title')?.textContent).toBe('暂无通知')
  })

  it('recovers from the error state after clicking retry', async () => {
    let failing = true
    mockApi(() => (failing ? Promise.reject(new Error('服务不可用')) : Promise.resolve(page([]))))

    await mount()
    await openPanel()
    expect(document.querySelector('.retry-btn')).not.toBeNull()

    failing = false
    document.querySelector<HTMLButtonElement>('.retry-btn')!.click()
    await flush()

    expect(document.querySelector('.panel-error')).toBeNull()
    expect(document.querySelector('.empty-title')?.textContent).toBe('暂无通知')
  })

  it('does not let a stale load-more error hijack the empty state', async () => {
    // loadError 长在共享 store 上：通知中心页的「加载更多」失败也会写它。
    // 面板只该在「首屏从没成功过」时报错，不能被这种陈旧错误顶掉本来正确的空态。
    mockApi((path) => {
      if (path.includes('page=2')) return Promise.reject(new Error('加载更多失败'))
      return Promise.resolve(page([makeNotification(1), makeNotification(2)], 45))
    }, 2)
    mocks.apiPost.mockResolvedValue({ success: true })

    await mount()
    const store = useNotificationStore()
    await store.load()
    await store.setUnreadOnly(true)
    await store.loadMore()
    expect(store.loadError).toBe('加载更多失败')

    await store.markAllRead()
    expect(store.items).toHaveLength(0)

    await openPanel()

    expect(document.querySelector('.panel-error')).toBeNull()
    expect(document.querySelector('.empty-title')?.textContent).toBe('暂无通知')
  })
})

describe('NotificationCenter dismissal', () => {
  it('keeps the panel open when pressing inside it', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()
    const head = document.querySelector('.panel-head')
    expect(head).not.toBeNull()

    head!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()

    expect(document.querySelector('.panel')).not.toBeNull()
  })

  it('closes the panel when pressing outside of it', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()

    expect(document.querySelector('.panel')).toBeNull()
  })
})

describe('NotificationCenter 窄屏容器', () => {
  it('窄屏渲染为贴底抽屉，而不是下拉浮层', async () => {
    media = installMatchMedia(true)
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()

    expect(document.querySelector('.vc-drawer.bottom')).not.toBeNull()
    expect(document.querySelector('.vc-popover__panel')).toBeNull()
    // 钉住 kebab 形式 aria-label 的传递：单测里用 camelCase 传参并不能证明生产代码
    // 那句 `aria-label="通知中心"` 生效，一旦 prop 解析出问题会静默退化成默认文案
    expect(document.querySelector('.vc-drawer.bottom')?.getAttribute('aria-label')).toBe('通知中心')
  })

  it('点抽屉遮罩收起（遮罩改由 Drawer 提供，组件内不再有 .panel-backdrop）', async () => {
    media = installMatchMedia(true)
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()
    expect(document.querySelector('.vc-drawer')).not.toBeNull()

    document
      .querySelector('.vc-drawer-overlay')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // <Transition> 要等 rAF / transitionend 才真正摘掉节点。固定等待在冷启动
    // （首次 transform 未缓存）时会不够，导致偶发失败，这里改为轮询。
    await vi.waitFor(() => {
      expect(document.querySelector('.vc-drawer')).toBeNull()
    })
  })

  it('运行中跨过断点时容器随之切换，且开关状态延续', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()
    expect(document.querySelector('.vc-popover__panel')).not.toBeNull()

    await media.cross(true)

    expect(document.querySelector('.vc-drawer.bottom')).not.toBeNull()
    expect(document.querySelector('.vc-popover__panel')).toBeNull()
  })
})

describe('NotificationCenter session switching', () => {
  it('closes the panel on logout so it does not reappear after the next login', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()
    expect(document.querySelector('.panel')).not.toBeNull()

    auth.token = null
    await vi.waitFor(() => {
      expect(document.querySelector('.panel')).toBeNull()
    })

    auth.token = 'test-token'
    await flush()
    expect(document.querySelector('.bell-btn')).not.toBeNull()
    expect(document.querySelector('.panel')).toBeNull()
  })
})
