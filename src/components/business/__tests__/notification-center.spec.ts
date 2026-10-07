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

async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
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

describe('NotificationCenter session switching', () => {
  it('closes the panel on logout so it does not reappear after the next login', async () => {
    mockApi(() => Promise.resolve(page([])))

    await mount()
    await openPanel()
    expect(document.querySelector('.panel')).not.toBeNull()

    auth.token = null
    await flush()
    expect(document.querySelector('.panel')).toBeNull()

    auth.token = 'test-token'
    await flush()
    expect(document.querySelector('.bell-btn')).not.toBeNull()
    expect(document.querySelector('.panel')).toBeNull()
  })
})
