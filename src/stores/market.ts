import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage, removeStorage } from '@/lib/storage'
import { api } from '@/lib/request'
import { useAuthStore } from '@/stores/auth'
import { addedNetworkPermissions, sha256Hex, verifyBundleIntegrity } from '@/lib/bundle-integrity'

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
  releaseNotes?: string
  isOfficial: boolean
  downloads: number
  status?: string
  /** 允许访问的网络域名白名单（沙箱联网能力用，由上传/审核时声明） */
  allowNetwork?: string[]
  /** 经审核版本的应用包 SHA-256；旧版数据可能为空 */
  sha256?: string | null
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
  updatedAt?: number
  /** 允许访问的网络域名白名单，随详情写入，供沙箱 caps 读取 */
  allowNetwork?: string[]
  sha256?: string | null
}

export interface MarketAppVersion {
  id: number
  version: string
  size?: number
  releaseNotes?: string
  allowNetwork?: string[]
  sha256?: string | null
  status: 'active' | 'yanked'
  createdAt: string
  updatedAt: string
}

const INSTALLED_KEY = 'market_installed_apps'
const BUNDLE_KEY_PREFIX = 'market-bundle-'
const ROLLBACK_BUNDLE_KEY_PREFIX = 'market-rollback-bundle-'
const ROLLBACK_META_KEY_PREFIX = 'market-rollback-meta-'
const AUTO_UPDATE_KEY = 'market-auto-update'
const UPDATE_CHECK_INTERVAL = 60 * 1000

export interface AppUpdateInfo {
  installed: InstalledApp
  latest: MarketAppItem
}

export interface AppRollbackPoint {
  entry: InstalledApp
  savedAt: number
}

export interface MarketComment {
  id: number
  appId: number
  userId: number
  content: string
  rating?: number | null
  parentId?: number | null
  createdAt: string
  updatedAt?: string
  canDelete?: boolean
  author?: {
    id?: number
    username: string
    avatar?: string | null
  }
}

export type MarketReportReason =
  | 'malware'
  | 'privacy'
  | 'fraud'
  | 'offensive'
  | 'copyright'
  | 'other'

async function fetchVerifiedBundle(fileUrl: string, expectedSha256?: string | null) {
  const response = await fetch(fileUrl)
  if (!response.ok) throw new Error(`应用包下载失败 (${response.status})`)
  const content = await response.arrayBuffer()
  if (content.byteLength === 0) throw new Error('应用包内容为空')
  const sha256 = await verifyBundleIntegrity(content, expectedSha256)
  const code = new TextDecoder().decode(content)
  if (!code.trim()) throw new Error('应用包内容为空')
  return { code, sha256 }
}

function parseVersion(value: string) {
  const normalized = String(value || '0')
    .trim()
    .replace(/^v/i, '')
    .split('+')[0]
  const [main, prerelease = ''] = normalized.split('-', 2)
  return {
    parts: main.split('.').map((part) => Number.parseInt(part, 10) || 0),
    prerelease,
  }
}

export function compareVersions(left: string, right: string): number {
  if (left === right) return 0
  const a = parseVersion(left)
  const b = parseVersion(right)
  const length = Math.max(a.parts.length, b.parts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a.parts[index] || 0) - (b.parts[index] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  if (!a.prerelease && b.prerelease) return 1
  if (a.prerelease && !b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true })
}

// 绝不信任 bundle 自带的 def.route，杜绝其注册 /admin、/login 等核心路由实施劫持。
function installedRoutePath(appId: number | string): string {
  return `/market-installed/${appId}`
}

export const useMarketStore = defineStore('market', () => {
  const availableApps = ref<MarketAppItem[]>([])
  const isLoading = ref(false)
  const fetchError = ref('')

  const installedApps = ref<InstalledApp[]>([])
  const latestApps = ref<Record<number, MarketAppItem>>({})
  const isCheckingUpdates = ref(false)
  const updatingIds = ref<number[]>([])
  const isUpdatingAll = ref(false)
  const updateErrors = ref<Record<number, string>>({})
  const updateCheckError = ref('')
  const lastUpdateCheckAt = ref(0)
  const autoUpdateEnabled = ref(getStorage<boolean>(AUTO_UPDATE_KEY, false) === true)
  let updateCheckPromise: Promise<AppUpdateInfo[]> | null = null

  const availableUpdates = computed<AppUpdateInfo[]>(() =>
    installedApps.value
      .map((installed) => ({ installed, latest: latestApps.value[installed.id] }))
      .filter(
        (item): item is AppUpdateInfo =>
          !!item.latest && compareVersions(item.latest.version, item.installed.version) > 0,
      ),
  )

  const persistInstalledApps = () => setStorage(INSTALLED_KEY, installedApps.value)

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
    fetchError.value = ''
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
      fetchError.value = e instanceof Error ? e.message : '应用市场加载失败'
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
  async function downloadAndInstall(
    appId: number,
    versionId?: number,
  ): Promise<InstalledApp | null> {
    // 1. 下载 bundle + 详情（并发）
    const [downloadRes, detail] = await Promise.all([
      api.get<{
        data: {
          fileUrl: string
          name: string
          version: string
          allowNetwork?: string[]
          sha256?: string | null
        }
      }>(
        versionId
          ? `/api/market/apps/${appId}/versions/${versionId}/download`
          : `/api/market/apps/${appId}/download`,
        { auth: false },
      ),
      fetchAppDetail(appId),
    ])

    if (!downloadRes.data.fileUrl) throw new Error('应用下载地址无效')
    const bundle = await fetchVerifiedBundle(downloadRes.data.fileUrl, downloadRes.data.sha256)

    // 2. 缓存 bundle 到 IndexedDB（仅在沙箱 iframe 内执行）
    setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, bundle.code)

    // 3. 构建 InstalledApp 记录（元信息来自服务端，不再依赖父进程解析 bundle）
    return {
      id: appId,
      name: detail?.name || downloadRes.data.name,
      icon: detail?.icon || '🧩',
      // route 指向受控命名空间路径，供 Home 等导航使用（见 navigateToApp）
      route: installedRoutePath(appId),
      description: detail?.description || '',
      version: downloadRes.data.version,
      allowNetwork: downloadRes.data.allowNetwork || detail?.allowNetwork || [],
      sha256: downloadRes.data.sha256 || detail?.sha256 || null,
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
        data: { fileUrl: string; sha256?: string | null }
      }>(`/api/market/apps/${appId}/download`, { auth: false })
      if (!downloadRes.data.fileUrl) return null
      const bundle = await fetchVerifiedBundle(downloadRes.data.fileUrl, downloadRes.data.sha256)
      setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, bundle.code)
      return bundle.code
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
    if (isUpdating(appId)) throw new Error('应用正在更新，请稍后再卸载')
    const idx = installedApps.value.findIndex((a) => a.id === appId)
    if (idx !== -1) {
      installedApps.value.splice(idx, 1)
      persistInstalledApps()
    }

    removeStorage(`${BUNDLE_KEY_PREFIX}${appId}`)
    removeStorage(`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`)
    removeStorage(`${ROLLBACK_META_KEY_PREFIX}${appId}`)
    const nextLatest = { ...latestApps.value }
    delete nextLatest[appId]
    latestApps.value = nextLatest
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
    releaseNotes?: string
    /** 应用截图 URL 列表（由上传表单逐张上传后得到） */
    screenshots?: string[]
    /** 应用声明的联网域名白名单，经管理员审核后生效 */
    allowNetwork?: string[]
  }) {
    const sha256 = await sha256Hex(await formData.file.arrayBuffer())
    const { data: upload } = await api.post<{
      data: { key: string; uploadUrl: string; headers?: Record<string, string> }
    }>('/api/uploads/presign', {
      kind: 'app',
      contentType: 'application/javascript',
      size: formData.file.size,
      name: `${formData.name}-v${formData.version}`,
      sha256,
    })
    const uploaded = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/javascript', ...(upload.headers || {}) },
      body: formData.file,
    })
    if (!uploaded.ok) throw new Error('应用文件上传失败')
    await api.post('/api/uploads/complete', { kind: 'app', key: upload.key, sha256 })

    const { data } = await api.post<{
      data: { id: number; name: string; version: string; status: string }
    }>('/api/market/apps', {
      name: formData.name,
      icon: formData.icon,
      description: formData.description,
      version: formData.version,
      category: formData.category,
      readme: formData.readme,
      releaseNotes: formData.releaseNotes,
      screenshots: formData.screenshots || [],
      allowNetwork: formData.allowNetwork || [],
      sha256,
      fileKey: upload.key,
      fileSize: formData.file.size,
    })
    return data
  }

  function isInstalled(appId: number): boolean {
    return installedApps.value.some((a) => a.id === appId)
  }

  // ===== 应用评论相关（强绑定 appId） =====
  async function fetchComments(
    appId: number,
    params?: { page?: number; limit?: number },
  ): Promise<{
    items: MarketComment[]
    ratingSummary: { average: number | null; count: number }
  } | null> {
    try {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.limit) q.set('limit', String(params.limit))
      const { data } = await api.get<{
        data: {
          items: MarketComment[]
          ratingSummary: { average: number | null; count: number }
        }
      }>(`/api/market/apps/${appId}/comments?${q.toString()}`)
      return data
    } catch (e) {
      console.error('Failed to fetch comments:', e)
      return null
    }
  }

  async function postComment(
    appId: number,
    payload: { content: string; rating?: number; parentId?: number },
  ): Promise<MarketComment | null> {
    try {
      const { data } = await api.post<{ data: MarketComment }>(
        `/api/market/apps/${appId}/comments`,
        payload,
      )
      return data
    } catch (e) {
      console.error('Failed to post comment:', e)
      throw e
    }
  }

  async function deleteComment(commentId: number): Promise<void> {
    await api.delete(`/api/market/comments/${commentId}`)
  }

  async function reportApp(
    appId: number,
    payload: { reason: MarketReportReason; details: string },
  ): Promise<void> {
    await api.post(`/api/market/apps/${appId}/reports`, payload)
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
    await checkForUpdates({ force: true })
  }

  function hasUpdate(appId: number) {
    return availableUpdates.value.some((item) => item.installed.id === appId)
  }

  function isUpdating(appId: number) {
    return updatingIds.value.includes(appId)
  }

  function permissionExpansion(appId: number, nextPermissions?: string[]) {
    const current = installedApps.value.find((item) => item.id === appId)
    return addedNetworkPermissions(current?.allowNetwork, nextPermissions)
  }

  function saveRollbackPoint(appId: number, entry: InstalledApp, bundle: string | null) {
    if (!bundle) return
    setStorage(`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`, bundle)
    setStorage(`${ROLLBACK_META_KEY_PREFIX}${appId}`, {
      entry: { ...entry },
      savedAt: Date.now(),
    })
  }

  function hasRollback(appId: number) {
    return !!(
      getStorage<string>(`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`, '') &&
      getStorage<AppRollbackPoint | null>(`${ROLLBACK_META_KEY_PREFIX}${appId}`, null)?.entry
    )
  }

  async function rollbackApp(appId: number): Promise<InstalledApp> {
    if (isUpdating(appId)) throw new Error('应用正在更新，请稍后再回退')
    const currentIndex = installedApps.value.findIndex((item) => item.id === appId)
    if (currentIndex < 0) throw new Error('应用未安装')
    const rollbackBundle = getStorage<string>(`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`, '')
    const point = getStorage<AppRollbackPoint | null>(`${ROLLBACK_META_KEY_PREFIX}${appId}`, null)
    const currentBundle = getStorage<string>(`${BUNDLE_KEY_PREFIX}${appId}`, '')
    if (!rollbackBundle || !point?.entry || !currentBundle) throw new Error('没有可回退的版本')
    await verifyBundleIntegrity(new TextEncoder().encode(rollbackBundle), point.entry.sha256)

    const currentEntry = { ...installedApps.value[currentIndex] }
    const restored = {
      ...point.entry,
      installedAt: currentEntry.installedAt,
      updatedAt: Date.now(),
    }
    setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, rollbackBundle)
    installedApps.value.splice(currentIndex, 1, restored)
    persistInstalledApps()
    saveRollbackPoint(appId, currentEntry, currentBundle)
    await checkForUpdates({ force: true }).catch(() => [])
    return restored
  }

  function setAutoUpdate(enabled: boolean) {
    autoUpdateEnabled.value = enabled
    setStorage(AUTO_UPDATE_KEY, enabled)
    if (enabled) void checkForUpdates({ force: true, autoApply: true })
  }

  async function fetchAppVersions(appId: number): Promise<MarketAppVersion[]> {
    const { data } = await api.get<{ data: MarketAppVersion[] }>(
      `/api/market/apps/${appId}/versions`,
    )
    return data
  }

  async function checkAppUpdate(appId: number) {
    const detail = await fetchAppDetail(appId)
    if (!detail) throw new Error('暂时无法检查该应用更新')
    latestApps.value = { ...latestApps.value, [appId]: detail }
    return hasUpdate(appId)
  }

  async function setVersionStatus(appId: number, versionId: number, status: 'active' | 'yanked') {
    await api.put(`/api/market/apps/${appId}/versions/${versionId}/status`, { status })
  }

  async function installVersion(
    appId: number,
    versionId: number,
    options?: { approvePermissions?: boolean },
  ): Promise<InstalledApp> {
    if (isUpdating(appId)) {
      const current = installedApps.value.find((item) => item.id === appId)
      if (!current) throw new Error('应用正在安装')
      return current
    }

    updatingIds.value = [...updatingIds.value, appId]
    const currentIndex = installedApps.value.findIndex((item) => item.id === appId)
    const oldEntry = currentIndex >= 0 ? { ...installedApps.value[currentIndex] } : null
    const oldBundle = getStorage<string>(`${BUNDLE_KEY_PREFIX}${appId}`)
    updateErrors.value = { ...updateErrors.value, [appId]: '' }

    try {
      const nextEntry = await downloadAndInstall(appId, versionId)
      if (!nextEntry) throw new Error('应用版本下载失败')
      const addedPermissions = addedNetworkPermissions(
        oldEntry?.allowNetwork,
        nextEntry.allowNetwork,
      )
      if (oldEntry && addedPermissions.length && !options?.approvePermissions) {
        throw new Error(`新版本新增联网权限：${addedPermissions.join('、')}`)
      }
      if (oldEntry) {
        nextEntry.installedAt = oldEntry.installedAt
        nextEntry.updatedAt = Date.now()
        const replaceIndex = installedApps.value.findIndex((item) => item.id === appId)
        if (replaceIndex < 0) throw new Error('应用已被卸载，已取消安装')
        saveRollbackPoint(appId, oldEntry, oldBundle)
        installedApps.value.splice(replaceIndex, 1, nextEntry)
      } else {
        installedApps.value.push(nextEntry)
        syncAuthInstalled()
        void syncToServer()
      }
      persistInstalledApps()
      await checkForUpdates({ force: true })
      return nextEntry
    } catch (error) {
      if (oldBundle) setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, oldBundle)
      else removeStorage(`${BUNDLE_KEY_PREFIX}${appId}`)
      if (oldEntry) {
        const restoreIndex = installedApps.value.findIndex((item) => item.id === appId)
        if (restoreIndex >= 0) installedApps.value.splice(restoreIndex, 1, oldEntry)
      }
      persistInstalledApps()
      const message = error instanceof Error ? error.message : '版本安装失败'
      updateErrors.value = { ...updateErrors.value, [appId]: message }
      throw error
    } finally {
      updatingIds.value = updatingIds.value.filter((id) => id !== appId)
    }
  }

  async function updateApp(
    appId: number,
    options?: { approvePermissions?: boolean },
  ): Promise<InstalledApp> {
    if (isUpdating(appId)) {
      const current = installedApps.value.find((item) => item.id === appId)
      if (!current) throw new Error('应用未安装')
      return current
    }

    let latest: MarketAppItem | undefined = latestApps.value[appId]
    const currentIndex = installedApps.value.findIndex((item) => item.id === appId)
    if (currentIndex < 0) throw new Error('应用未安装')
    if (!latest) {
      latest = (await fetchAppDetail(appId)) || undefined
      if (latest) latestApps.value = { ...latestApps.value, [appId]: latest }
    }
    if (
      !latest ||
      compareVersions(latest.version, installedApps.value[currentIndex].version) <= 0
    ) {
      return installedApps.value[currentIndex]
    }

    updatingIds.value = [...updatingIds.value, appId]
    const oldEntry = { ...installedApps.value[currentIndex] }
    const oldBundle = getStorage<string>(`${BUNDLE_KEY_PREFIX}${appId}`)
    updateErrors.value = { ...updateErrors.value, [appId]: '' }

    try {
      const nextEntry = await downloadAndInstall(appId)
      if (!nextEntry) throw new Error('新版本下载失败')
      const addedPermissions = addedNetworkPermissions(
        oldEntry.allowNetwork,
        nextEntry.allowNetwork,
      )
      if (addedPermissions.length && !options?.approvePermissions) {
        throw new Error(`新版本新增联网权限：${addedPermissions.join('、')}`)
      }
      if (compareVersions(nextEntry.version, oldEntry.version) <= 0) {
        if (oldBundle) setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, oldBundle)
        else removeStorage(`${BUNDLE_KEY_PREFIX}${appId}`)
        const nextLatest = { ...latestApps.value }
        delete nextLatest[appId]
        latestApps.value = nextLatest
        return oldEntry
      }
      nextEntry.installedAt = oldEntry.installedAt
      nextEntry.updatedAt = Date.now()
      const replaceIndex = installedApps.value.findIndex((item) => item.id === appId)
      if (replaceIndex < 0) throw new Error('应用已被卸载，已取消更新')
      saveRollbackPoint(appId, oldEntry, oldBundle)
      installedApps.value.splice(replaceIndex, 1, nextEntry)
      persistInstalledApps()
      return nextEntry
    } catch (error) {
      if (oldBundle) setStorage(`${BUNDLE_KEY_PREFIX}${appId}`, oldBundle)
      else removeStorage(`${BUNDLE_KEY_PREFIX}${appId}`)
      const restoreIndex = installedApps.value.findIndex((item) => item.id === appId)
      if (restoreIndex >= 0) {
        installedApps.value.splice(restoreIndex, 1, oldEntry)
        persistInstalledApps()
      }
      const message = error instanceof Error ? error.message : '更新失败'
      updateErrors.value = { ...updateErrors.value, [appId]: message }
      throw error
    } finally {
      updatingIds.value = updatingIds.value.filter((id) => id !== appId)
    }
  }

  async function updateAll() {
    if (isUpdatingAll.value || availableUpdates.value.length === 0) return
    isUpdatingAll.value = true
    const ids = availableUpdates.value.map((item) => item.installed.id)
    try {
      for (const id of ids) {
        try {
          await updateApp(id)
        } catch {
          // 单个应用失败不阻塞其余更新，错误会记录到 updateErrors
        }
      }
    } finally {
      isUpdatingAll.value = false
    }
  }

  async function runUpdateCheck(force = false): Promise<AppUpdateInfo[]> {
    if (installedApps.value.length === 0) {
      latestApps.value = {}
      updateCheckError.value = ''
      return []
    }

    const now = Date.now()
    if (!force && now - lastUpdateCheckAt.value < UPDATE_CHECK_INTERVAL) {
      return availableUpdates.value
    }

    isCheckingUpdates.value = true
    updateCheckError.value = ''
    try {
      const requestedIds = installedApps.value.map((item) => item.id)
      const results = await Promise.allSettled(requestedIds.map((id) => fetchAppDetail(id)))
      const nextLatest: Record<number, MarketAppItem> = { ...latestApps.value }
      let metadataChanged = false
      let successCount = 0

      results.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value) return
        const detail = result.value
        const installed = installedApps.value.find((item) => item.id === requestedIds[index])
        successCount += 1
        nextLatest[detail.id] = detail
        if (
          installed &&
          (installed.icon !== detail.icon ||
            installed.name !== detail.name ||
            installed.description !== detail.description)
        ) {
          installed.icon = detail.icon
          installed.name = detail.name
          installed.description = detail.description
          metadataChanged = true
        }
      })

      if (successCount === 0) {
        updateCheckError.value = '检查更新失败，请确认网络或服务状态后重试'
        return availableUpdates.value
      }
      if (successCount < requestedIds.length) {
        updateCheckError.value = `有 ${requestedIds.length - successCount} 个应用暂时无法检查更新`
      }

      latestApps.value = nextLatest
      lastUpdateCheckAt.value = now
      if (metadataChanged) persistInstalledApps()
      return availableUpdates.value
    } finally {
      isCheckingUpdates.value = false
    }
  }

  async function checkForUpdates(options?: { force?: boolean; autoApply?: boolean }) {
    if (!updateCheckPromise) {
      updateCheckPromise = runUpdateCheck(options?.force).finally(() => {
        updateCheckPromise = null
      })
    }
    const updates = await updateCheckPromise
    if (options?.autoApply && autoUpdateEnabled.value) await updateAll()
    return updates
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
    fetchError,
    installedApps,
    latestApps,
    availableUpdates,
    initInstalledApps,
    fetchApps,
    fetchAppDetail,
    installApp,
    uninstallApp,
    ensureBundle,
    uploadApp,
    isInstalled,
    hasUpdate,
    isUpdating,
    permissionExpansion,
    hasRollback,
    rollbackApp,
    isCheckingUpdates,
    isUpdatingAll,
    autoUpdateEnabled,
    updateErrors,
    updateCheckError,
    lastUpdateCheckAt,
    checkForUpdates,
    updateApp,
    updateAll,
    setAutoUpdate,
    fetchAppVersions,
    checkAppUpdate,
    installVersion,
    setVersionStatus,
    fetchComments,
    postComment,
    deleteComment,
    reportApp,
    refreshInstalledMeta,
    syncFromServer,
    syncToServer,
    syncWithServer,
  }
})
