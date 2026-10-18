import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getStorage, setStorage, applyStoragePatch } from '@/lib/storage'
import { api } from '@/lib/request'
import { createLatestOnly } from '@/utils/common'
import { useAuthStore } from '@/stores/auth'
import { addedNetworkPermissions, sha256Hex, verifyBundleIntegrity } from '@/lib/bundle-integrity'
import {
  addedPermissions,
  normalizePermissions,
  type SandboxPermission,
} from '@/lib/sandbox-permissions'

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
  /** 声明的能力权限（notify / clipboard / cloud / ai / files / profile），经用户安装确认后生效 */
  permissions?: string[]
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
  /** 已授权的能力权限，随详情写入，供沙箱 caps 读取 */
  permissions?: string[]
  sha256?: string | null
}

export interface MarketAppVersion {
  id: number
  version: string
  size?: number
  releaseNotes?: string
  allowNetwork?: string[]
  permissions?: string[]
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

export interface MarketRankingItem {
  id: number
  name: string
  icon: string
  description: string
  category: string
  version: string
  downloads: number
  isOfficial: boolean
  rating: { average: number | null; count: number }
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

/** 安装 / 更新所需的元数据（不含 bundle 本体）。 */
interface InstallMeta {
  fileUrl: string
  version: string
  sha256?: string | null
  name: string
  icon: string
  description: string
  /** 应用声明的联网域名白名单 */
  network: string[]
  /** 应用声明的能力权限 */
  capabilities: SandboxPermission[]
}

/** 安装时确认全部权限，更新时仅确认新增权限；无权限变更则无需确认。 */
export interface MarketPermissionConsent {
  appId: number
  appName: string
  icon: string
  action: 'install' | 'update'
  /** 目标版本号 */
  version?: string
  network: string[]
  capabilities: SandboxPermission[]
  /** 相对已安装版本新增的联网域名（仅更新时有值） */
  addedNetwork: string[]
  /** 相对已安装版本新增的能力权限（仅更新时有值） */
  addedCapabilities: SandboxPermission[]
}

/** 用户取消权限确认；调用方应与安装失败区分，不显示错误提示。 */
export class PermissionCancelledError extends Error {
  constructor(action: 'install' | 'update') {
    super(action === 'update' ? '已取消更新' : '已取消安装')
    this.name = 'PermissionCancelledError'
  }
}

export const useMarketStore = defineStore('market', () => {
  const availableApps = ref<MarketAppItem[]>([])
  const ranking = ref<MarketRankingItem[]>([])
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

  /** 每次加载独立校验时序，旧请求不得更新结果、错误或 loading。 */
  const beginAppsFetch = createLatestOnly()

  /** 权限确认由 store 统一控制，所有安装入口共用同一流程。 */
  const pendingPermissionConsent = ref<MarketPermissionConsent | null>(null)
  let consentResolver: ((approved: boolean) => void) | null = null
  const consentQueue: { details: MarketPermissionConsent; resolve: (ok: boolean) => void }[] = []

  /** 权限请求排队展示，避免并发安装覆盖已有 resolver。 */
  function requestPermissionConsent(details: MarketPermissionConsent): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (consentResolver) {
        consentQueue.push({ details, resolve })
        return
      }
      consentResolver = resolve
      pendingPermissionConsent.value = details
    })
  }

  /** 由弹窗组件调用：用户点了确认或取消。 */
  function resolvePermissionConsent(approved: boolean) {
    const resolve = consentResolver
    // 没有在等答复的请求就什么都不做：否则会把队列里下一个请求提前弹出来，
    // 而它的 Promise 仍然挂着 —— 变成永远等不到确认的安装。
    if (!resolve) return
    consentResolver = null
    resolve(approved)
    const next = consentQueue.shift()
    if (next) {
      consentResolver = next.resolve
      pendingPermissionConsent.value = next.details
    } else {
      pendingPermissionConsent.value = null
    }
  }

  /** 安装确认全部权限，更新仅确认新增权限；返回 null 表示无需确认。 */
  function buildPermissionConsent(input: {
    appId: number
    meta: InstallMeta
    action: 'install' | 'update'
    previous: InstalledApp | null
  }): MarketPermissionConsent | null {
    const { previous } = input
    const addedNetwork = previous
      ? addedNetworkPermissions(previous.allowNetwork, input.meta.network)
      : []
    const addedCapabilities = previous
      ? addedPermissions(previous.permissions, input.meta.capabilities)
      : []
    const needed = previous
      ? addedNetwork.length > 0 || addedCapabilities.length > 0
      : input.meta.network.length > 0 || input.meta.capabilities.length > 0
    if (!needed) return null
    return {
      appId: input.appId,
      appName: input.meta.name,
      icon: input.meta.icon,
      action: input.action,
      version: input.meta.version,
      network: input.meta.network,
      capabilities: input.meta.capabilities,
      addedNetwork,
      addedCapabilities,
    }
  }

  /** 下载前完成权限检查。ask 模式请求确认；skip 模式遇到新增权限直接失败。 */
  async function ensureConsent(
    appId: number,
    meta: InstallMeta,
    action: 'install' | 'update',
    previous: InstalledApp | null,
    consent: 'ask' | 'skip',
  ): Promise<void> {
    const request = buildPermissionConsent({ appId, meta, action, previous })
    if (!request) return
    if (consent === 'skip') {
      throw new Error('新版本新增权限，需手动确认后再更新')
    }
    const approved = await requestPermissionConsent(request)
    if (!approved) throw new PermissionCancelledError(action)
  }

  /** 先读取元数据进行权限确认，确认通过后再下载应用包。 */
  async function fetchInstallMeta(appId: number, versionId?: number): Promise<InstallMeta> {
    const [downloadRes, detail] = await Promise.all([
      api.get<{
        data: {
          fileUrl: string
          name: string
          version: string
          allowNetwork?: string[]
          permissions?: string[]
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
    return {
      fileUrl: downloadRes.data.fileUrl,
      version: downloadRes.data.version,
      sha256: downloadRes.data.sha256,
      name: detail?.name || downloadRes.data.name,
      icon: detail?.icon || '🧩',
      description: detail?.description || '',
      // 两份元数据都以服务端记录为准（上传 / 审核时声明），不信任 bundle 自声明
      network: downloadRes.data.allowNetwork || detail?.allowNetwork || [],
      capabilities: normalizePermissions(downloadRes.data.permissions || detail?.permissions || []),
    }
  }

  /** 校验并下载 bundle，拼出待提交的安装记录。不涉及权限判断。 */
  async function fetchBundleAndEntry(
    appId: number,
    meta: InstallMeta,
  ): Promise<{ entry: InstalledApp; code: string }> {
    const bundle = await fetchVerifiedBundle(meta.fileUrl, meta.sha256)
    return {
      code: bundle.code,
      entry: {
        id: appId,
        name: meta.name,
        icon: meta.icon,
        // route 指向受控命名空间路径，供 Home 等导航使用（见 navigateToApp）
        route: installedRoutePath(appId),
        description: meta.description,
        version: meta.version,
        allowNetwork: meta.network,
        permissions: meta.capabilities,
        sha256: bundle.sha256,
        installedAt: Date.now(),
      },
    }
  }

  const availableUpdates = computed<AppUpdateInfo[]>(() =>
    installedApps.value
      .map((installed) => ({ installed, latest: latestApps.value[installed.id] }))
      .filter(
        (item): item is AppUpdateInfo =>
          !!item.latest && compareVersions(item.latest.version, item.installed.version) > 0,
      ),
  )

  // 所有安装信息和包缓存按顺序提交；一次失败不能阻塞后续操作。
  let commitQueue = Promise.resolve()
  function commit<T>(operation: () => Promise<T>): Promise<T> {
    const next = commitQueue.then(operation)
    commitQueue = next.then(
      () => {},
      () => {},
    )
    return next
  }

  async function commitDownload(
    download: { entry: InstalledApp; code: string },
    previous: InstalledApp | null,
  ) {
    return commit(async () => {
      const index = installedApps.value.findIndex((item) => item.id === download.entry.id)
      if (previous && index < 0) throw new Error('应用已被卸载，已取消更新')
      if (!previous && index >= 0) return installedApps.value[index]
      const entry = {
        ...download.entry,
        ...(previous ? { installedAt: previous.installedAt, updatedAt: Date.now() } : {}),
      }
      const next = [...installedApps.value]
      if (index >= 0) next.splice(index, 1, entry)
      else next.push(entry)
      const patch: Record<string, unknown> = {
        [INSTALLED_KEY]: next,
        [`${BUNDLE_KEY_PREFIX}${entry.id}`]: download.code,
      }
      const oldBundle = getStorage<string>(`${BUNDLE_KEY_PREFIX}${entry.id}`, '')
      if (previous && oldBundle) {
        patch[`${ROLLBACK_BUNDLE_KEY_PREFIX}${entry.id}`] = oldBundle
        patch[`${ROLLBACK_META_KEY_PREFIX}${entry.id}`] = { entry: previous, savedAt: Date.now() }
      }
      await applyStoragePatch(patch)
      installedApps.value = next
      return entry
    })
  }

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
    const isCurrent = beginAppsFetch()
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
      if (!isCurrent()) return
      availableApps.value = data.items
    } catch (e) {
      console.error('Failed to fetch market apps:', e)
      if (!isCurrent()) return
      fetchError.value = e instanceof Error ? e.message : '应用市场加载失败'
    } finally {
      if (isCurrent()) isLoading.value = false
    }
  }

  /** 热门榜：按下载量排序的已上架应用，附带评分聚合。 */
  async function fetchRanking(limit = 8) {
    try {
      const res = await api.get<{ data: { items: MarketRankingItem[] } }>(
        `/api/market/ranking?limit=${limit}`,
        { auth: false },
      )
      ranking.value = res.data.items || []
    } catch (e) {
      console.error('Failed to fetch market ranking:', e)
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

  /** 批量查询已安装应用的更新元信息，避免逐个请求完整详情。 */
  async function fetchAppsByIds(ids: number[]): Promise<MarketAppItem[]> {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
    const items: MarketAppItem[] = []
    // 服务端每次最多接受 100 个 ID，不能把更多已装应用静默截掉。
    for (let offset = 0; offset < unique.length; offset += 100) {
      const batch = unique.slice(offset, offset + 100)
      const res = await api.get<{ data: { items: MarketAppItem[] } }>(
        `/api/market/apps?ids=${batch.join(',')}`,
        { auth: false },
      )
      items.push(...(res.data.items || []))
    }
    return items
  }

  // 按需补齐本地应用包缓存，支持跨设备恢复和已安装应用深度链接。
  async function ensureBundle(appId: number): Promise<string | null> {
    const cached = getStorage<string>(`${BUNDLE_KEY_PREFIX}${appId}`, '')
    if (cached) return cached
    const installed = installedApps.value.find((item) => item.id === appId)
    try {
      let path = `/api/market/apps/${appId}/download`
      if (installed) {
        const versions = await fetchAppVersions(appId)
        const pinned = versions.find(
          (item) => item.version === installed.version && item.status === 'active',
        )
        if (!pinned) return null
        path = `/api/market/apps/${appId}/versions/${pinned.id}/download`
      }
      const downloadRes = await api.get<{
        data: { fileUrl: string; sha256?: string | null }
      }>(path, { auth: false })
      if (!downloadRes.data.fileUrl) return null
      const bundle = await fetchVerifiedBundle(downloadRes.data.fileUrl, downloadRes.data.sha256)
      return await commit(async () => {
        // 下载期间可能发生更新或卸载，不能把过期下载重新写回缓存。
        const current = installedApps.value.find((item) => item.id === appId)
        if (installed && !current) return null
        const newer = getStorage<string>(`${BUNDLE_KEY_PREFIX}${appId}`, '')
        if (newer) return newer
        if (current?.sha256 && current.sha256 !== bundle.sha256) return null
        await applyStoragePatch({ [`${BUNDLE_KEY_PREFIX}${appId}`]: bundle.code })
        return bundle.code
      })
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

  const pendingInstalls = new Map<number, Promise<void>>()
  function installApp(appId: number): Promise<void> {
    const active = pendingInstalls.get(appId)
    if (active) return active
    const pending = performInstall(appId).finally(() => pendingInstalls.delete(appId))
    pendingInstalls.set(appId, pending)
    return pending
  }

  async function performInstall(appId: number) {
    if (installedApps.value.some((item) => item.id === appId) || isUpdating(appId)) return
    const auth = useAuthStore()
    const ownerToken = auth.token
    updatingIds.value = [...updatingIds.value, appId]
    try {
      // 权限确认通过后再下载应用包。
      const meta = await fetchInstallMeta(appId)
      await ensureConsent(appId, meta, 'install', null, 'ask')
      const download = await fetchBundleAndEntry(appId, meta)
      await commitDownload(download, null)
      if (auth.token === ownerToken) {
        syncAuthInstalled()
        void syncToServer()
      }
    } finally {
      updatingIds.value = updatingIds.value.filter((id) => id !== appId)
    }
  }

  async function uninstallApp(appId: number) {
    if (isUpdating(appId)) throw new Error('应用正在安装或更新，请稍后再卸载')
    const auth = useAuthStore()
    const ownerToken = auth.token
    updatingIds.value = [...updatingIds.value, appId]
    try {
      await commit(async () => {
        const next = installedApps.value.filter((item) => item.id !== appId)
        await applyStoragePatch({
          [INSTALLED_KEY]: next,
          [`${BUNDLE_KEY_PREFIX}${appId}`]: null,
          [`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`]: null,
          [`${ROLLBACK_META_KEY_PREFIX}${appId}`]: null,
        })
        installedApps.value = next
      })
      const nextLatest = { ...latestApps.value }
      delete nextLatest[appId]
      latestApps.value = nextLatest
      if (auth.token === ownerToken) {
        syncAuthInstalled()
        void syncToServer()
      }
    } finally {
      updatingIds.value = updatingIds.value.filter((id) => id !== appId)
    }
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
    /** 应用声明的能力权限，经用户安装确认后生效 */
    permissions?: SandboxPermission[]
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
      permissions: normalizePermissions(formData.permissions),
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

  let serverSyncQueue = Promise.resolve()

  // 按提交顺序上传，防止较早的安装列表最后到达服务端。
  function syncToServer(ids = installedApps.value.map((app) => app.id)): Promise<void> {
    const auth = useAuthStore()
    const ownerToken = auth.token
    if (!ownerToken || !auth.user) return Promise.resolve()
    const snapshot = [...ids]
    serverSyncQueue = serverSyncQueue.then(async () => {
      if (auth.token !== ownerToken) return
      try {
        await api.put('/api/auth/installed-apps', { installedApps: snapshot })
      } catch {
        if (auth.token === ownerToken)
          updateCheckError.value = '本机改动已保存，安装列表暂未同步到云端'
      }
    })
    return serverSyncQueue
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

  function hasRollback(appId: number) {
    return !!(
      getStorage<string>(`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`, '') &&
      getStorage<AppRollbackPoint | null>(`${ROLLBACK_META_KEY_PREFIX}${appId}`, null)?.entry
    )
  }

  async function rollbackApp(appId: number): Promise<InstalledApp> {
    if (isUpdating(appId)) throw new Error('应用正在更新，请稍后再回退')
    updatingIds.value = [...updatingIds.value, appId]
    try {
      const previous = installedApps.value.find((item) => item.id === appId)
      if (!previous) throw new Error('应用未安装')
      const code = getStorage<string>(`${ROLLBACK_BUNDLE_KEY_PREFIX}${appId}`, '')
      const point = getStorage<AppRollbackPoint | null>(`${ROLLBACK_META_KEY_PREFIX}${appId}`, null)
      if (!code || !point?.entry) throw new Error('没有可回退的版本')
      await verifyBundleIntegrity(new TextEncoder().encode(code), point.entry.sha256)
      const restored = await commitDownload({ entry: point.entry, code }, { ...previous })
      await checkForUpdates({ force: true }).catch(() => [])
      return restored
    } finally {
      updatingIds.value = updatingIds.value.filter((id) => id !== appId)
    }
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

  /** 安装或更新版本。ask 模式确认新增权限；skip 模式不弹窗，需确认时失败。 */
  async function replaceVersion(
    appId: number,
    versionId: number | undefined,
    options?: { consent?: 'ask' | 'skip' },
  ) {
    if (isUpdating(appId)) throw new Error('应用正在安装或更新')
    const previous = installedApps.value.find((item) => item.id === appId)
    if (!versionId && !previous) throw new Error('应用未安装')
    const oldEntry = previous ? { ...previous } : null
    updatingIds.value = [...updatingIds.value, appId]
    updateErrors.value = { ...updateErrors.value, [appId]: '' }
    const auth = useAuthStore()
    const ownerToken = auth.token
    try {
      const meta = await fetchInstallMeta(appId, versionId)
      await ensureConsent(
        appId,
        meta,
        oldEntry ? 'update' : 'install',
        oldEntry,
        options?.consent ?? 'ask',
      )
      if (!versionId && oldEntry && compareVersions(meta.version, oldEntry.version) <= 0)
        return oldEntry
      const download = await fetchBundleAndEntry(appId, meta)
      const entry = await commitDownload(download, oldEntry)
      if (!oldEntry && auth.token === ownerToken) {
        syncAuthInstalled()
        void syncToServer()
      }
      return entry
    } catch (error) {
      // 用户主动取消不算失败：不留下错误条，否则「应用更新」页会红一片。
      updateErrors.value = {
        ...updateErrors.value,
        [appId]:
          error instanceof PermissionCancelledError
            ? ''
            : error instanceof Error
              ? error.message
              : '版本安装失败',
      }
      throw error
    } finally {
      updatingIds.value = updatingIds.value.filter((id) => id !== appId)
    }
  }

  async function installVersion(
    appId: number,
    versionId: number,
    options?: { consent?: 'ask' | 'skip' },
  ): Promise<InstalledApp> {
    const entry = await replaceVersion(appId, versionId, options)
    await checkForUpdates({ force: true })
    return entry
  }

  function updateApp(appId: number, options?: { consent?: 'ask' | 'skip' }): Promise<InstalledApp> {
    return replaceVersion(appId, undefined, options)
  }

  async function updateAll() {
    if (isUpdatingAll.value || availableUpdates.value.length === 0) return
    isUpdatingAll.value = true
    const ids = availableUpdates.value.map((item) => item.installed.id)
    try {
      for (const id of ids) {
        try {
          // 后台自动更新无人值守，不能弹窗；若新版本新增了权限就跳过该应用，
          // 由 updateErrors 提示用户手动更新。
          await updateApp(id, { consent: 'skip' })
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

      let details: MarketAppItem[]
      try {
        // 一次批量查询代替「每个应用一个请求」，见 fetchAppsByIds 的注释
        details = await fetchAppsByIds(requestedIds)
      } catch {
        // 批量查询失败时保留已有更新列表和应用元信息。
        updateCheckError.value = '检查更新失败，请确认网络或服务状态后重试'
        return availableUpdates.value
      }

      const installedIds = new Set(installedApps.value.map((item) => item.id))
      const nextLatest: Record<number, MarketAppItem> = { ...latestApps.value }
      let successCount = 0

      for (const detail of details) {
        // 等待期间应用可能已被卸载：只认仍在本地的那些（与改动前一致的防重入）
        if (!detail || !installedIds.has(detail.id)) continue
        successCount += 1
        nextLatest[detail.id] = detail
      }

      if (successCount === 0) {
        updateCheckError.value = '检查更新失败，请确认网络或服务状态后重试'
        return availableUpdates.value
      }
      if (successCount < requestedIds.length) {
        updateCheckError.value = `有 ${requestedIds.length - successCount} 个应用暂时无法检查更新`
      }

      latestApps.value = nextLatest
      lastUpdateCheckAt.value = now
      try {
        await commit(async () => {
          const next = installedApps.value.map((installed) => {
            const detail = nextLatest[installed.id]
            if (
              !detail ||
              (installed.icon === detail.icon &&
                installed.name === detail.name &&
                installed.description === detail.description)
            )
              return installed
            return {
              ...installed,
              icon: detail.icon,
              name: detail.name,
              description: detail.description,
            }
          })
          if (next.every((item, index) => item === installedApps.value[index])) return
          await applyStoragePatch({ [INSTALLED_KEY]: next })
          installedApps.value = next
        })
      } catch (error) {
        updateCheckError.value = error instanceof Error ? error.message : '应用信息保存失败'
      }
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

  /** 并发恢复缺失应用；仍需在当前设备逐个确认权限。 */
  async function syncFromServer(serverAppIds: number[]) {
    const auth = useAuthStore()
    const ownerToken = auth.token
    const missing = [...new Set(serverAppIds)].filter(
      (id) => !installedApps.value.some((item) => item.id === id) && !isUpdating(id),
    )
    const results = await Promise.allSettled(
      missing.map(async (id) => {
        updatingIds.value = [...updatingIds.value, id]
        try {
          const meta = await fetchInstallMeta(id)
          await ensureConsent(id, meta, 'install', null, 'ask')
          if (auth.token !== ownerToken) return
          const download = await fetchBundleAndEntry(id, meta)
          if (auth.token !== ownerToken) return
          await commitDownload(download, null)
        } finally {
          updatingIds.value = updatingIds.value.filter((item) => item !== id)
        }
      }),
    )
    const failed = results.filter((item) => item.status === 'rejected').length
    if (failed) updateCheckError.value = `有 ${failed} 个应用未能恢复到本机，请稍后重试同步`
    if (auth.token === ownerToken) syncAuthInstalled()
  }

  // 以服务端安装列表为准同步差异；失败时跳过，避免阻塞启动。
  async function syncWithServer() {
    const auth = useAuthStore()
    if (!auth.token || !auth.user) return
    try {
      const ownerToken = auth.token
      const { data: serverIds } = await api.get<{ data: number[] }>('/api/auth/installed-apps')
      if (auth.token !== ownerToken) return
      const localIds = installedApps.value.map((a) => a.id)
      const hasMissingOnLocal = serverIds.some((id) => !localIds.includes(id))
      const hasMissingOnServer = localIds.some((id) => !serverIds.includes(id))
      if (hasMissingOnLocal) await syncFromServer(serverIds)
      if (hasMissingOnServer && auth.token === ownerToken) {
        const merged = [...new Set([...serverIds, ...installedApps.value.map((item) => item.id)])]
        await syncToServer(merged)
      }
    } catch {
      // 拉取失败则跳过跨设备同步
    }
  }

  return {
    availableApps,
    ranking,
    isLoading,
    fetchError,
    installedApps,
    latestApps,
    availableUpdates,
    initInstalledApps,
    fetchApps,
    fetchRanking,
    fetchAppDetail,
    installApp,
    uninstallApp,
    ensureBundle,
    uploadApp,
    isInstalled,
    hasUpdate,
    isUpdating,
    hasRollback,
    rollbackApp,
    isCheckingUpdates,
    isUpdatingAll,
    autoUpdateEnabled,
    updateErrors,
    updateCheckError,
    lastUpdateCheckAt,
    pendingPermissionConsent,
    resolvePermissionConsent,
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
