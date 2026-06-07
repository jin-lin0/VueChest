import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage, removeStorage } from '@/utils'
import { loadMarketApp } from '@/utils/app-loader'
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
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

      const res = await fetch(`${API_BASE}/api/market/apps?${query}`)
      const json = await res.json()

      if (json.success) {
        availableApps.value = json.data.items
        totalApps.value = json.data.total
        totalPages.value = json.data.totalPages
        currentPage.value = json.data.page
      }
    } catch (e) {
      console.error('Failed to fetch market apps:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchAppDetail(id: number): Promise<MarketAppItem | null> {
    try {
      const res = await fetch(`${API_BASE}/api/market/apps/${id}`)
      const json = await res.json()
      if (json.success) return json.data
      return null
    } catch (e) {
      console.error('Failed to fetch app detail:', e)
      return null
    }
  }

  async function installApp(appId: number) {
    if (installedApps.value.some((a) => a.id === appId)) return

    const res = await fetch(`${API_BASE}/api/market/apps/${appId}/download`)
    const json = await res.json()
    if (!json.success) throw new Error(json.error || '下载失败')

    const { fileContent, name, version } = json.data

    setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, fileContent)

    const def = loadMarketApp(fileContent)
    if (!def) throw new Error('无法加载应用')

    registerRoute(appId, def)

    const entry: InstalledApp = {
      id: appId,
      name: def.meta.name,
      icon: def.meta.icon,
      route: def.route,
      description: def.meta.description,
      version,
      installedAt: Date.now(),
    }
    installedApps.value.push(entry)
    setStorage(INSTALLED_KEY, installedApps.value)
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
    const token = localStorage.getItem('admin_auth_token')
    const res = await fetch(`${API_BASE}/api/market/apps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formData),
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error || '上传失败')
    return json.data
  }

  async function deleteApp(id: number) {
    const token = localStorage.getItem('admin_auth_token')
    const res = await fetch(`${API_BASE}/api/market/apps/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error || '删除失败')
    return json
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
    }
  ) {
    const token = localStorage.getItem('admin_auth_token')
    const res = await fetch(`${API_BASE}/api/market/apps/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error || '更新失败')
    return json
  }

  function isInstalled(appId: number): boolean {
    return installedApps.value.some((a) => a.id === appId)
  }

  async function syncFromServer(mergedIds: number[], serverAppIds: number[]) {
    const newApps: InstalledApp[] = []

    for (const appId of mergedIds) {
      const existing = installedApps.value.find((a) => a.id === appId)
      if (existing) {
        newApps.push(existing)
      } else if (serverAppIds.includes(appId)) {
        const detail = await fetchAppDetail(appId)
        if (detail) {
          newApps.push({
            id: detail.id,
            name: detail.name,
            icon: detail.icon,
            route: `/m/${detail.id}`,
            description: detail.description,
            version: detail.version,
            installedAt: Date.now(),
          })
        }
      }
    }

    installedApps.value = newApps
    setStorage(INSTALLED_KEY, installedApps.value)
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
    deleteApp,
    updateApp,
    isInstalled,
    syncFromServer,
  }
})
