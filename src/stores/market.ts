import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage, removeStorage } from '@/utils'
import { loadMarketApp } from '@/utils/app-loader'
import { api } from '@/utils/request'
import router from '@/router'
import type { MarketAppDefinition } from '@/utils/app-loader'

export interface MarketAppItem {
  id: number
  name: string
  icon: string
  description: string
  version: string
  author: string
  category: string
  size: number
  screenshots?: string[]
  readme?: string
  isOfficial: boolean
  downloads: number
  status?: string
  createdAt: string
  updatedAt: string
}

export interface InstalledApp {
  id: number
  name: string
  icon: string
  route: string
  description: string
  version: string
  installedAt: number
}

export interface MarketAppListData {
  items: MarketAppItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}
const INSTALLED_KEY = 'market_installed_apps'
const BUNDLE_KEY_PREFIX = 'market-bundle-'

const installedRoutePrefix = 'market-installed-'

export const useMarketStore = defineStore('market', () => {
  const availableApps = ref<MarketAppItem[]>([])
  const totalApps = ref(0)
  const totalPages = ref(0)
  const currentPage = ref(1)
  const isLoading = ref(false)

  const installedApps = ref<InstalledApp[]>([])

  function initInstalledApps() {
    const saved = getStorage<InstalledApp[]>(INSTALLED_KEY, [])
    installedApps.value = saved || []
    for (const app of installedApps.value) {
      restoreApp(app)
    }
  }

  function restoreApp(app: InstalledApp) {
    const code = getStorage<string>(`${BUNDLE_KEY_PREFIX}${app.id}`, '')
    if (!code) return

    const def = loadMarketApp(code)
    if (!def) {
      console.warn(`Failed to restore app: ${app.name}`)
      return
    }

    registerRoute(app.id, def)
  }

  function registerRoute(appId: number | string, def: MarketAppDefinition) {
    const routeName = `${installedRoutePrefix}${appId}`
    if (router.hasRoute(routeName)) return

    router.addRoute({
      path: def.route,
      name: routeName,
      // @ts-ignore - dynamic component reference
      component: () => Promise.resolve(def.component),
    })
  }

  async function fetchApps(params?: {
    category?: string
    keyword?: string
    page?: number
    limit?: number
  }) {
    isLoading.value = true
    try {
      const query = new URLSearchParams()
      if (params?.category) query.set('category', params.category)
      if (params?.keyword) query.set('keyword', params.keyword)
      if (params?.page) query.set('page', String(params.page))
      if (params?.limit) query.set('limit', String(params.limit))

      const { data } = await api.get<{
        data: {
          items: MarketAppItem[]
          total: number
          page: number
          totalPages: number
        }
      }>(`/api/market/apps?${query}`, { auth: false })
      availableApps.value = data.items
      totalApps.value = data.total
      totalPages.value = data.totalPages
      currentPage.value = data.page
    } catch (e) {
      console.error('Failed to fetch market apps:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchAppDetail(id: number): Promise<MarketAppItem | null> {
    try {
      const res = await api.get<{ data: MarketAppItem }>(`/api/market/apps/${id}`, { auth: false })
      return res.data
    } catch (e) {
      console.error('Failed to fetch app detail:', e)
      return null
    }
  }

  /**
   * 从服务端下载并安装单个 App（核心安装逻辑）
   * 供 installApp / syncFromServer 共用
   */
  async function downloadAndInstall(appId: number): Promise<InstalledApp | null> {
    // 1. 下载 bundle + 详情（并发）
    const [downloadRes, detail] = await Promise.all([
      api.get<{
        data: { fileContent: string; name: string; version: string }
      }>(`/api/market/apps/${appId}/download`, { auth: false }),
      fetchAppDetail(appId),
    ])

    const { fileContent } = downloadRes.data
    if (!fileContent) return null

    // 2. 缓存 bundle 到 IndexedDB
    setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, fileContent)

    // 3. 解析 + 注册路由
    const def = loadMarketApp(fileContent)
    if (!def) return null
    registerRoute(appId, def)

    // 4. 构建 InstalledApp 记录
    return {
      id: appId,
      name: detail?.name || downloadRes.data.name,
      icon: detail?.icon || def.meta.icon,
      route: def.route,
      description: detail?.description || def.meta.description,
      version: detail?.version || downloadRes.data.version,
      installedAt: Date.now(),
    }
  }

  async function installApp(appId: number) {
    if (installedApps.value.some((a) => a.id === appId)) return

    const entry = await downloadAndInstall(appId)
    if (!entry) throw new Error('无法加载应用')

    installedApps.value.push(entry)
    setStorage(INSTALLED_KEY, installedApps.value)
    syncToServer()
  }

  async function uninstallApp(appId: number) {
    const routeName = `${installedRoutePrefix}${appId}`
    if (router.hasRoute(routeName)) {
      router.removeRoute(routeName)
    }

    const idx = installedApps.value.findIndex((a) => a.id === appId)
    if (idx !== -1) {
      installedApps.value.splice(idx, 1)
      setStorage(INSTALLED_KEY, installedApps.value)
    }

    removeStorage(`${BUNDLE_KEY_PREFIX}${appId}`)
    syncToServer()
  }

  async function uploadApp(formData: {
    name: string
    icon: string
    description: string
    version: string
    category: string
    fileContent: string
    readme?: string
  }) {
    const { data } = await api.post<{
      data: { id: number; name: string; version: string; status: string }
    }>('/api/market/apps', formData)
    return data
  }

  async function approveApp(id: number) {
    return api.post(`/api/market/apps/${id}/approve`)
  }

  async function rejectApp(id: number) {
    return api.post(`/api/market/apps/${id}/reject`)
  }

  async function deleteApp(id: number) {
    return api.delete(`/api/market/apps/${id}`)
  }

  async function updateApp(
    id: number,
    data: {
      name?: string
      icon?: string
      description?: string
      version?: string
      category?: string
      fileContent?: string
      readme?: string
    },
  ) {
    return api.put(`/api/market/apps/${id}`, data)
  }

  function isInstalled(appId: number): boolean {
    return installedApps.value.some((a) => a.id === appId)
  }

  // 将已安装的 App ID 列表同步到服务端
  async function syncToServer() {
    const ids = installedApps.value.map((a) => a.id)
    try {
      await api.put('/api/auth/installed-apps', { installedApps: ids })
    } catch {
      // ignore sync errors silently
    }
  }

  async function refreshInstalledMeta() {
    if (installedApps.value.length === 0) return
    let changed = false
    for (const app of installedApps.value) {
      const detail = await fetchAppDetail(app.id)
      if (
        detail &&
        (detail.icon !== app.icon ||
          detail.name !== app.name ||
          detail.description !== app.description)
      ) {
        app.icon = detail.icon
        app.name = detail.name
        app.description = detail.description
        app.version = detail.version
        changed = true
      }
    }
    if (changed) {
      setStorage(INSTALLED_KEY, installedApps.value)
    }
  }

  /**
   * 跨设备同步：根据服务端的 App ID 列表，下载本地缺失的 App
   * 并发下载，比串行快很多
   */
  async function syncFromServer(serverAppIds: number[]) {
    // 找出本地没有的
    const missing = serverAppIds.filter((id) => !installedApps.value.some((a) => a.id === id))
    if (missing.length === 0) return

    // 并发下载
    const results = await Promise.allSettled(missing.map((id) => downloadAndInstall(id)))
    const newApps = results
      .filter(
        (r): r is PromiseFulfilledResult<InstalledApp> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value)

    if (newApps.length === 0) return

    installedApps.value.push(...newApps)
    setStorage(INSTALLED_KEY, installedApps.value)
    syncToServer()
  }

  return {
    availableApps,
    totalApps,
    totalPages,
    currentPage,
    isLoading,
    installedApps,
    initInstalledApps,
    fetchApps,
    fetchAppDetail,
    installApp,
    uninstallApp,
    uploadApp,
    approveApp,
    rejectApp,
    deleteApp,
    updateApp,
    isInstalled,
    refreshInstalledMeta,
    syncFromServer,
    syncToServer,
  }
})
