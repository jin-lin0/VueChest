import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AppNotification } from '@/lib/notification-format'

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

import { useNotificationStore } from '../notifications'

function makeNotification(id: number, overrides: Partial<AppNotification> = {}): AppNotification {
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
    ...overrides,
  }
}

function listResponse(items: AppNotification[], page = 1, total = items.length) {
  return {
    data: items,
    pagination: { page, limit: 20, total, hasMore: page * 20 < total },
  }
}

interface ApiHandlers {
  items?: AppNotification[]
  total?: number
  pages?: Record<number, AppNotification[]>
  unread?: number
}

function mockApi(handlers: ApiHandlers = {}) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/notifications/unread-count')) {
      return Promise.resolve({ data: { count: handlers.unread ?? 0 } })
    }
    const page = Number(new URLSearchParams(path.split('?')[1] ?? '').get('page') ?? 1)
    const items = handlers.pages?.[page] ?? handlers.items ?? []
    return Promise.resolve(listResponse(items, page, handlers.total ?? items.length))
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  // reset 而非 clear：实现也要回到干净状态，避免上一个用例的 mockImplementation 泄漏
  vi.resetAllMocks()
})

describe('unread badge', () => {
  it('writes the server count into state and the document badge', async () => {
    mockApi({ unread: 5 })
    const store = useNotificationStore()

    await store.refreshUnread()

    expect(store.unreadCount).toBe(5)
    expect(store.hasUnread).toBe(true)
    expect(mocks.syncBadge).toHaveBeenLastCalledWith(5)
  })

  it('keeps the previous count when the request fails', async () => {
    mockApi({ unread: 5 })
    const store = useNotificationStore()
    await store.refreshUnread()

    mocks.apiGet.mockRejectedValueOnce(new Error('network down'))
    await expect(store.refreshUnread()).resolves.toBeUndefined()
    expect(store.unreadCount).toBe(5)
  })
})

describe('list loading', () => {
  it('loads the first page and refreshes the unread count', async () => {
    mockApi({ items: [makeNotification(1), makeNotification(2)], unread: 2 })
    const store = useNotificationStore()

    await store.load()

    expect(store.items.map((item) => item.id)).toEqual([1, 2])
    expect(store.isInitialized).toBe(true)
    expect(store.unreadCount).toBe(2)
    expect(mocks.apiGet).toHaveBeenCalledWith(expect.stringContaining('page=1'))
  })

  it('records a readable error instead of throwing', async () => {
    mocks.apiGet.mockRejectedValue(new Error('服务不可用'))
    const store = useNotificationStore()

    await store.load()

    expect(store.loadError).toBe('服务不可用')
    expect(store.isInitialized).toBe(false)
  })

  it('appends the next page and de-duplicates overlapping ids', async () => {
    mockApi({
      pages: {
        1: [makeNotification(1), makeNotification(2)],
        2: [makeNotification(2), makeNotification(3)],
      },
      total: 45,
    })
    const store = useNotificationStore()
    await store.load()

    await store.loadMore()

    expect(store.items.map((item) => item.id)).toEqual([1, 2, 3])
    expect(store.pagination.page).toBe(2)
  })

  it('does not fetch more when the server says there is nothing left', async () => {
    mockApi({ items: [makeNotification(1)] })
    const store = useNotificationStore()
    await store.load()
    mocks.apiGet.mockClear()

    await store.loadMore()

    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('restarts from page 1 when switching the unread-only filter', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    const store = useNotificationStore()
    await store.load()
    mocks.apiGet.mockClear()

    await store.setUnreadOnly(true)

    expect(store.unreadOnly).toBe(true)
    expect(mocks.apiGet).toHaveBeenCalledWith(expect.stringContaining('unread=true'))
    expect(mocks.apiGet).toHaveBeenCalledWith(expect.stringContaining('page=1'))
  })

  it('discards an in-flight loadMore when the filter changes mid-request', async () => {
    // 复现：点「加载更多」后立刻切「只看未读」。
    // 若不过滤过期响应，旧筛选的第 2 页会被 append 进新列表，
    // 且 pagination.page 前进到 2，导致新筛选的第 2 页被永久跳过。
    let release!: (value: unknown) => void
    const gate = new Promise((resolve) => {
      release = resolve
    })

    mockApi({ pages: { 1: [makeNotification(1), makeNotification(2)] }, total: 45 })
    const store = useNotificationStore()
    await store.load()

    // 挂起「加载更多」的响应，制造在途状态
    mocks.apiGet.mockImplementationOnce(() => gate)
    const pendingLoadMore = store.loadMore()
    expect(store.isLoadingMore).toBe(true)

    // 请求还没回来就切换筛选
    await store.setUnreadOnly(true)

    // 现在才放行那个过期请求
    release({
      data: [makeNotification(3)],
      pagination: { page: 2, limit: 20, total: 45, hasMore: true },
    })
    await pendingLoadMore

    expect(store.items.map((item) => item.id)).toEqual([1, 2])
    expect(store.pagination.page).toBe(1)
    // 锁必须已经释放，否则按钮会一直卡在加载态
    expect(store.isLoadingMore).toBe(false)
  })
})

describe('marking read', () => {
  it('updates optimistically and posts the affected ids', async () => {
    mockApi({ items: [makeNotification(1), makeNotification(2)], unread: 2 })
    mocks.apiPost.mockResolvedValue({ success: true })
    const store = useNotificationStore()
    await store.load()

    await store.markRead([1])

    expect(store.items[0].read).toBe(true)
    expect(store.unreadCount).toBe(1)
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/notifications/read', { ids: [1] })
  })

  it('drops the row from the list when the unread-only filter is on', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    mocks.apiPost.mockResolvedValue({ success: true })
    const store = useNotificationStore()
    await store.load()
    await store.setUnreadOnly(true)

    await store.markRead([1])

    expect(store.items).toHaveLength(0)
    // 页面标题读的是 pagination.total，必须一起归零，否则会出现「空列表 + 1 条未读」的矛盾
    expect(store.pagination.total).toBe(0)
  })

  it('rolls back to the server state when the request fails', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    const store = useNotificationStore()
    await store.load()

    mocks.apiPost.mockRejectedValueOnce(new Error('写入失败'))
    mockApi({ items: [makeNotification(1)], unread: 1 })
    await store.markRead([1])

    expect(store.items[0].read).toBe(false)
    expect(store.unreadCount).toBe(1)
  })

  it('ignores empty or invalid id lists so a stray call cannot mark everything read', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    const store = useNotificationStore()
    await store.load()

    await store.markRead([])
    await store.markRead([Number.NaN])

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(store.unreadCount).toBe(1)
  })

  it('keeps the full total when marking read outside the unread-only filter', async () => {
    // 「全部通知」视图里的 total 是全部条数，标已读只影响未读数，不该动它。
    mockApi({ items: [makeNotification(1), makeNotification(2)], unread: 2 })
    mocks.apiPost.mockResolvedValue({ success: true })
    const store = useNotificationStore()
    await store.load()

    await store.markRead([1])

    expect(store.items[0].read).toBe(true)
    expect(store.pagination.total).toBe(2)
  })
})

describe('markAllRead', () => {
  it('zeroes the badge and clears the list under the unread-only filter', async () => {
    mockApi({ items: [makeNotification(1), makeNotification(2)], unread: 2 })
    mocks.apiPost.mockResolvedValue({ success: true })
    const store = useNotificationStore()
    await store.load()
    await store.setUnreadOnly(true)

    const result = await store.markAllRead()

    expect(result.ok).toBe(true)
    expect(store.unreadCount).toBe(0)
    expect(store.items).toHaveLength(0)
    expect(store.pagination.total).toBe(0)
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/notifications/read-all')
  })

  it('restores the previous flags when the request fails', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    mocks.apiPost.mockRejectedValueOnce(new Error('boom'))
    const store = useNotificationStore()
    await store.load()

    const result = await store.markAllRead()

    expect(result.ok).toBe(false)
    expect(store.unreadCount).toBe(1)
    expect(store.items[0].read).toBe(false)
  })

  it('short-circuits when there is nothing unread', async () => {
    mockApi({ items: [makeNotification(1, { read: true })], unread: 0 })
    const store = useNotificationStore()
    await store.load()

    const result = await store.markAllRead()

    expect(result).toEqual({ ok: true, message: '没有未读通知' })
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })
})

describe('remove', () => {
  it('removes the row, decrements the total and clears the badge for unread rows', async () => {
    mockApi({ items: [makeNotification(1), makeNotification(2)], unread: 2 })
    mocks.apiDelete.mockResolvedValue({ success: true })
    const store = useNotificationStore()
    await store.load()

    const result = await store.remove(1)

    expect(result.ok).toBe(true)
    expect(store.items.map((item) => item.id)).toEqual([2])
    expect(store.unreadCount).toBe(1)
    expect(store.pagination.total).toBe(1)
  })

  it('reports a failure and reloads when the server rejects the delete', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    const store = useNotificationStore()
    await store.load()

    mocks.apiDelete.mockRejectedValueOnce(new Error('删除失败'))
    mockApi({ items: [makeNotification(1)], unread: 1 })
    const result = await store.remove(1)

    expect(result.ok).toBe(false)
    expect(store.items.map((item) => item.id)).toEqual([1])
  })
})

describe('lifecycle', () => {
  it('init polls the unread count and skips hidden documents', async () => {
    vi.useFakeTimers()
    try {
      mockApi({ unread: 3 })
      const store = useNotificationStore()

      await store.init()
      expect(store.unreadCount).toBe(3)

      mocks.apiGet.mockClear()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.apiGet).toHaveBeenCalledTimes(1)

      store.stopPolling()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reset clears every piece of state and the badge', async () => {
    mockApi({ items: [makeNotification(1)], unread: 1 })
    const store = useNotificationStore()
    await store.load()
    await store.setUnreadOnly(true)

    store.reset()

    expect(store.items).toHaveLength(0)
    expect(store.unreadCount).toBe(0)
    expect(store.isInitialized).toBe(false)
    expect(store.unreadOnly).toBe(false)
    expect(store.pagination.total).toBe(0)
    expect(mocks.syncBadge).toHaveBeenLastCalledWith(0)
  })
})
