import { computed, ref, type Ref } from 'vue'
import { api } from '@/lib/request'
import type { PagedData } from '@/views/admin/daily/types'

interface PagedRunsOptions {
  /** 拉取失败时展示在 toast 里的兜底文案。 */
  errorMessage: string
  onError: (message: string) => void
  pageSize?: number
}

/**
 * 执行日志与操作记录共用分页逻辑：筛选条件、页码、总数、错误提示一套实现，
 * 页面只负责传 endpoint 和拼装筛选参数。
 */
export function usePagedRuns<T extends { id: number }>(
  endpoint: string,
  options: PagedRunsOptions,
) {
  const pageSize = options.pageSize ?? 20
  const items = ref([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const loading = ref(false)
  // 翻页沿用上一次的筛选条件，避免页码切换时丢掉筛选。
  let filters: Record<string, string> = {}

  const hasNext = computed(() => page.value * pageSize < total.value)
  const hasPrev = computed(() => page.value > 1)

  async function load(target: number, nextFilters?: Record<string, string>) {
    if (nextFilters) filters = nextFilters
    loading.value = true
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((target - 1) * pageSize),
      })
      for (const [key, value] of Object.entries(filters))
        if (value) params.set(key, value)
      const { data } = await api.get<{ data: PagedData<T> }>(`${endpoint}?${params}`)
      items.value = data.items
      total.value = data.total
      page.value = target
    } catch (error) {
      options.onError(error instanceof Error ? error.message : options.errorMessage)
    } finally {
      loading.value = false
    }
  }

  return { items, total, page, loading, hasNext, hasPrev, load }
}
