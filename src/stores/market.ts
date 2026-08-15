import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage, removeStorage } from '@/lib/storage'
import { api } from '@/lib/request'
import { useAuthStore } from '@/stores/auth'

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
  /** 允许访问的网络域名白名单（沙箱联网能力用，由上传/审核时声明） */
  allowNetwork?: string[]
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
  /** 允许访问的网络域名白名单，随详情写入，供沙箱 caps 读取 */
  allowNetwork?: string[]
}

const INSTALLED_KEY = 'market_installed_apps'
const BUNDLE_KEY_PREFIX = 'market-bundle-'

// 绝不信任 bundle 自带的 def.route，杜绝其注册 /admin、/login 等核心路由实施劫持。
function installedRoutePath(appId: number | string): string {
  return `/market-installed/${appId}`
}

export const useMarketStore = defineStore('market', () => {
  const availableApps = ref<MarketAppItem[]>([])
  const isLoading = ref(false)

  const installedApps = ref<InstalledApp[]>([])

  function initInstalledApps() {
    const saved = getStorage<InstalledApp[]>(INSTALLED_KEY, [])
    installedApps.value = saved || []
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
        data: { items: MarketAppItem[] }
      }>(`/api/market/apps?${query}`, { auth: false })
      availableApps.value = data.items
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
        data: { fileUrl: string; name: string; version: string }
      }>(`/api/market/apps/${appId}/download`, { auth: false }),
      fetchAppDetail(appId),
    ])

    const code = await fetch(downloadRes.data.fileUrl).then((res) => res.text())
    if (!code) return null

    // 2. 缓存 bundle 到 IndexedDB（仅在沙箱 iframe 内执行）
    setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, code)

    // 3. 构建 InstalledApp 记录（元信息来自服务端，不再依赖父进程解析 bundle）
    return {
      id: appId,
      name: detail?.name || downloadRes.data.name,
      icon: detail?.icon || '🧩',
      // route 指向受控命名空间路径，供 Home 等导航使用（见 navigateToApp）
      route: installedRoutePath(appId),
      description: detail?.description || '',
      version: detail?.version || downloadRes.data.version,
      allowNetwork: detail?.allowNetwork || [],
      installedAt: Date.now(),
    }
  }

  // 确保指定 app 的 bundle 已缓存到本地；没有则先从服务端下载并缓存。
  // 供 MarketAppSandbox 在本地无缓存时（如跨设备 / 清过 storage）按需拉取，
  // 使 /market-installed/:id 深度链接始终可用。
  async function ensureBundle(appId: number): Promise<string | null> {
    const cached = getStorage<string>(`${BUNDLE_KEY_PREFIX}${appId}`, '')
    if (cached) return cached
    try {
      const downloadRes = await api.get<{
        data: { fileUrl: string }
      }>(`/api/market/apps/${appId}/download`, { auth: false })
      const code = await fetch(downloadRes.data.fileUrl).then((r) => r.text())
      if (!code) return null
      setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, code)
      return code
    } catch {
      return null
    }
  }

  // 安装/卸载会改变本地已安装列表，同步刷新 auth_user_info 里的 installedApps，
  // 否则下次启动 syncFromServer 会以陈旧的 auth_user_info 为准把已卸载应用拉回来。
  function syncAuthInstalled() {
    const auth = useAuthStore()
    auth.setInstalledApps(installedApps.value.map((a) => a.id))
  }

  async function installApp(appId: number) {
    if (installedApps.value.some((a) => a.id === appId)) return

    const entry = await downloadAndInstall(appId)
    if (!entry) throw new Error('无法加载应用')

    installedApps.value.push(entry)
    setStorage(INSTALLED_KEY, installedApps.value)
    syncAuthInstalled()
    syncToServer()
  }

  async function uninstallApp(appId: number) {
    const idx = installedApps.value.findIndex((a) => a.id === appId)
    if (idx !== -1) {
      installedApps.value.splice(idx, 1)
      setStorage(INSTALLED_KEY, installedApps.value)
    }

    removeStorage(`${BUNDLE_KEY_PREFIX}${appId}`)
    syncAuthInstalled()
    syncToServer()
  }

  async function uploadApp(formData: {
    name: string
    icon: string
    description: string
    version: string
    category: string
    file: File
    readme?: string
    /** 应用声明的联网域名白名单，经管理员审核后生效 */
    allowNetwork?: string[]
  }) {
    const { data: upload } = await api.post<{
      data: { key: string; uploadUrl: string }
    }>('/api/uploads/presign', {
      kind: 'app',
      contentType: 'application/javascript',
      size: formData.file.size,
      name: `${formData.name}-v${formData.version}`,
    })
    const uploaded = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/javascript' },
      body: formData.file,
    })
    if (!uploaded.ok) throw new Error('应用文件上传失败')
    await api.post('/api/uploads/complete', { kind: 'app', key: upload.key })

    const { data } = await api.post<{
      data: { id: number; name: string; version: string; status: string }
    }>('/api/market/apps', {
      name: formData.name,
      icon: formData.icon,
      description: formData.description,
      version: formData.version,
      category: formData.category,
      readme: formData.readme,
      allowNetwork: formData.allowNetwork || [],
      fileKey: upload.key,
      fileSize: formData.file.size,
    })
    return data
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
    syncAuthInstalled()
    syncToServer()
  }

  // 跨设备同步：以服务端实时列表（GET /api/auth/installed-apps）为唯一真源，
  // 补齐本地缺失 / 推送本地独有，不再信任 auth_user_info 里的 installedApps 缓存，
  // 从根上避免因缓存陈旧导致已卸载应用被反复拉回。失败则跳过，不阻塞启动 / 登录。
  async function syncWithServer() {
    const auth = useAuthStore()
    if (!auth.token || !auth.user) return
    try {
      const { data: serverIds } = await api.get<{ data: number[] }>('/api/auth/installed-apps')
      const localIds = installedApps.value.map((a) => a.id)
      const hasMissingOnLocal = serverIds.some((id) => !localIds.includes(id))
      const hasMissingOnServer = localIds.some((id) => !serverIds.includes(id))
      if (hasMissingOnLocal) await syncFromServer(serverIds)
      if (hasMissingOnServer) await syncToServer()
    } catch {
      // 拉取失败则跳过跨设备同步
    }
  }

  return {
    availableApps,
    isLoading,
    installedApps,
    initInstalledApps,
    fetchApps,
    fetchAppDetail,
    installApp,
    uninstallApp,
    ensureBundle,
    uploadApp,
    isInstalled,
    refreshInstalledMeta,
    syncFromServer,
    syncToServer,
    syncWithServer,
  }
})
