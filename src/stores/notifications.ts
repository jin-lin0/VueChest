import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/request'
import { syncDocumentBadge } from '@/lib/app-badge'
import type { AppNotification, NotificationPagination } from '@/lib/notification-format'

/** 与服务端 notificationService.js 的 DEFAULT_PAGE_SIZE 保持一致 */
const PAGE_SIZE = 20
/** 顶栏未读数轮询间隔：够快发现新消息，又不会给服务端造成压力 */
const POLL_INTERVAL_MS = 60_000

const EMPTY_PAGINATION: NotificationPagination = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  hasMore: false,
}

export interface ActionResult {
  ok: boolean
  message: string
}

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const unreadCount = ref(0)
  const pagination = ref<NotificationPagination>({ ...EMPTY_PAGINATION })
  const isLoading = ref(false)
  const isLoadingMore = ref(false)
  const loadError = ref<string | null>(null)
  /** 首次成功拉取过列表才置位；顶栏下拉据此决定要不要显示骨架 */
  const isInitialized = ref(false)
  const unreadOnly = ref(false)

  const hasUnread = computed(() => unreadCount.value > 0)
  const isEmpty = computed(() => isInitialized.value && items.value.length === 0)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  /** 列表请求的代数：筛选/重载会自增，用于丢弃在途的过期响应（见 load / loadMore） */
  let listGeneration = 0

  /** 未读数的唯一写入口：state 与 favicon 角标始终同步，不会各自漂移 */
  function applyUnread(count: number) {
    unreadCount.value = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    syncDocumentBadge(unreadCount.value)
  }

  function buildListPath(page: number): string {
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (unreadOnly.value) query.set('unread', 'true')
    return `/api/notifications?${query.toString()}`
  }

  async function load(): Promise<void> {
    // 每次重新加载都推进代数，让在途的旧请求（含 loadMore）作废。
    // 没有它就会出现：点「加载更多」后立刻切「只看未读」，旧筛选的第 2 页
    // 被 append 进新列表，且 pagination.page 前进到 2，导致新筛选的第 2 页被永久跳过。
    const generation = ++listGeneration
    // 作废在途的「加载更多」并立刻释放它的锁：否则那次请求返回前，
    // 用户点「加载更多」会被 isLoadingMore 挡住，表现为按钮点了没反应。
    isLoadingMore.value = false
    isLoading.value = true
    loadError.value = null
    try {
      const res = await api.get<{
        data: AppNotification[]
        pagination: NotificationPagination
      }>(buildListPath(1))
      if (generation !== listGeneration) return
      items.value = res.data
      pagination.value = res.pagination
      isInitialized.value = true
      await refreshUnread()
    } catch (error) {
      if (generation !== listGeneration) return
      loadError.value = error instanceof Error ? error.message : '通知加载失败'
    } finally {
      // 只有最新一代才有权清掉 loading，否则会把后发请求的 loading 提前关掉
      if (generation === listGeneration) isLoading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (isLoading.value || isLoadingMore.value || !pagination.value.hasMore) return
    const generation = listGeneration
    isLoadingMore.value = true
    try {
      const res = await api.get<{
        data: AppNotification[]
        pagination: NotificationPagination
      }>(buildListPath(pagination.value.page + 1))
      // 期间筛选条件变了（load 已推进代数）→ 这一页属于旧列表，直接丢弃
      if (generation !== listGeneration) return
      // 期间可能已有新通知插到前面，按 id 去重防止重复渲染
      const seen = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...res.data.filter((item) => !seen.has(item.id))]
      pagination.value = res.pagination
    } catch (error) {
      if (generation !== listGeneration) return
      loadError.value = error instanceof Error ? error.message : '加载更多失败'
    } finally {
      if (generation === listGeneration) isLoadingMore.value = false
    }
  }

  /** 切换「只看未读」后必须重置分页，否则 page 会指向筛选后不存在的页码 */
  async function setUnreadOnly(value: boolean): Promise<void> {
    if (unreadOnly.value === value) return
    unreadOnly.value = value
    pagination.value = { ...EMPTY_PAGINATION }
    isInitialized.value = false
    await load()
  }

  /**
   * 顶栏角标只需要一个数字，单独走轻量端点。
   * 失败时静默保留旧值：网络抖动不应该把角标清成 0 骗用户。
   */
  async function refreshUnread(): Promise<void> {
    try {
      const res = await api.get<{ data: { count: number } }>('/api/notifications/unread-count')
      applyUnread(res.data.count)
    } catch {
      /* 角标失败不打扰用户 */
    }
  }

  async function markRead(ids: number[]): Promise<void> {
    const list = ids.filter((id) => Number.isFinite(id))
    if (!list.length) return
    const targets = items.value.filter((item) => list.includes(item.id) && !item.read)
    if (!targets.length) return

    const previousUnread = unreadCount.value
    targets.forEach((item) => {
      item.read = true
    })
    applyUnread(unreadCount.value - targets.length)

    try {
      await api.post('/api/notifications/read', { ids: list })
      // 「只看未读」下这几条会从当前视图消失，总数必须同步扣减，
      // 否则页面标题仍写「N 条未读通知」而列表已经空了。
      if (unreadOnly.value) {
        items.value = items.value.filter((item) => !item.read)
        pagination.value = {
          ...pagination.value,
          total: Math.max(0, pagination.value.total - targets.length),
        }
      }
    } catch {
      // 乐观更新失败就回到服务端的真实状态，而不是留一个假的「已读」
      applyUnread(previousUnread)
      await load()
    }
  }

  async function markAllRead(): Promise<ActionResult> {
    if (!unreadCount.value) return { ok: true, message: '没有未读通知' }

    const previousUnread = unreadCount.value
    const previousItems = items.value.map((item) => ({ id: item.id, read: item.read }))
    items.value.forEach((item) => {
      item.read = true
    })
    applyUnread(0)

    try {
      await api.post('/api/notifications/read-all')
      // 全部已读后「只看未读」视图必然为空，分页也要一并归零，
      // 否则标题会继续显示「N 条未读」而列表已是空态。
      if (unreadOnly.value) {
        items.value = []
        pagination.value = { ...pagination.value, total: 0, hasMore: false }
      }
      return { ok: true, message: '已全部标记为已读' }
    } catch (error) {
      applyUnread(previousUnread)
      const reads = new Map(previousItems.map((item) => [item.id, item.read]))
      items.value.forEach((item) => {
        item.read = reads.get(item.id) ?? item.read
      })
      return { ok: false, message: error instanceof Error ? error.message : '操作失败' }
    }
  }

  async function remove(id: number): Promise<ActionResult> {
    const target = items.value.find((item) => item.id === id)
    if (!target) return { ok: false, message: '通知不存在' }

    const previousUnread = unreadCount.value
    const wasUnread = !target.read
    items.value = items.value.filter((item) => item.id !== id)
    if (wasUnread) applyUnread(unreadCount.value - 1)

    try {
      await api.delete(`/api/notifications/${id}`)
      pagination.value = {
        ...pagination.value,
        total: Math.max(0, pagination.value.total - 1),
      }
      return { ok: true, message: '已删除' }
    } catch (error) {
      applyUnread(previousUnread)
      await load()
      return { ok: false, message: error instanceof Error ? error.message : '删除失败' }
    }
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /**
   * 轮询未读数。后台标签页直接跳过，避免用户开着十个标签页时产生十倍请求。
   */
  function startPolling(intervalMs: number = POLL_INTERVAL_MS) {
    stopPolling()
    pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void refreshUnread()
    }, intervalMs)
  }

  /** 登录后调用：只拉角标，不预加载列表（面板首次打开时再拉，省一次请求） */
  async function init(): Promise<void> {
    await refreshUnread()
    startPolling()
  }

  /** 退出登录 / 切换账号时调用，确保角标不会残留上一个账号的未读数 */
  function reset() {
    stopPolling()
    // 作废在途的列表请求：否则上一个账号的响应或报错会在状态清空之后又写回来
    listGeneration++
    items.value = []
    pagination.value = { ...EMPTY_PAGINATION }
    loadError.value = null
    isInitialized.value = false
    unreadOnly.value = false
    isLoading.value = false
    isLoadingMore.value = false
    applyUnread(0)
  }

  return {
    items,
    unreadCount,
    pagination,
    isLoading,
    isLoadingMore,
    loadError,
    isInitialized,
    unreadOnly,
    hasUnread,
    isEmpty,
    load,
    loadMore,
    setUnreadOnly,
    refreshUnread,
    markRead,
    markAllRead,
    remove,
    startPolling,
    stopPolling,
    init,
    reset,
  }
})

/**
 * 应用启动时的唯一入口，由 App.vue 在登录态就绪后调用。
 *
 * 之所以做成「一个函数」而不是让 App.vue 自己拼装：App.vue 属于首屏入口 chunk，
 * 每多写一个 `import()` 就多一份预加载依赖清单（约 200 字节 gzip），
 * 而入口 gzip 预算只剩几百字节余量。收敛成一个入口 = 一次动态导入 = 一次体积开销。
 */
export function bootstrapNotifications(userId: number | null | undefined): void {
  const store = useNotificationStore()
  if (userId) void store.init()
  else store.reset()
}
