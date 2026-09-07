import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { STORAGE_KEYS } from '@/config'
import { api } from '@/lib/request'
import { getStorage, setStorage, applyStoragePatch } from '@/lib/storage'
import { useWorkspaceStore, type WorkspaceCloudConfig, type WorkspaceConfig } from './workspace'

export type CloudSyncCategoryId =
  | 'workspace'
  | 'toolbox'
  | 'interview'
  | 'api-manager'
  | 'music'
  | 'stock'

export interface CloudSyncCategoryDefinition {
  id: CloudSyncCategoryId
  title: string
  description: string
  icon: string
  sensitive?: boolean
}

interface CloudCategoryPayload {
  updatedAt: number
  data: {
    storage?: Record<string, unknown>
    localStorage?: Record<string, string | null>
  }
}

export interface SelectiveCloudSyncConfig {
  version: 1
  selection: CloudSyncCategoryId[]
  categories: Partial<Record<Exclude<CloudSyncCategoryId, 'workspace'>, CloudCategoryPayload>>
  updatedAt: number
}

export const CLOUD_SYNC_CATEGORIES: CloudSyncCategoryDefinition[] = [
  {
    id: 'workspace',
    title: '工作区布局',
    description: '工作区、应用顺序和名称，不包含最近使用记录',
    icon: '⌂',
  },
  {
    id: 'toolbox',
    title: '开发工具箱',
    description: '置顶工具、流水线预设和文本转换规则，不同步输入与历史',
    icon: '🧰',
  },
  {
    id: 'interview',
    title: '面试学习进度',
    description: '掌握度、收藏题目和上次练习位置',
    icon: '📚',
  },
  {
    id: 'api-manager',
    title: 'API 工作台',
    description: '集合、保存的请求、自定义 API 和环境变量',
    icon: '🔗',
    sensitive: true,
  },
  {
    id: 'music',
    title: '音乐播放设置',
    description: '播放队列、音量、播放模式和搜索记录；收藏已单独同步',
    icon: '🎵',
  },
  {
    id: 'stock',
    title: '股票本地数据',
    description: '自选、提醒、研究笔记和本地持仓',
    icon: '📈',
    sensitive: true,
  },
]

const SELECTION_KEY = 'cloud-sync:selection'
const DEFAULT_SELECTION: CloudSyncCategoryId[] = ['workspace', 'toolbox', 'interview']

const STORAGE_CATEGORY_KEYS: Record<
  Exclude<CloudSyncCategoryId, 'workspace' | 'toolbox'>,
  string[]
> = {
  interview: [STORAGE_KEYS.INTERVIEW_PRACTICED, STORAGE_KEYS.INTERVIEW_LEARNING],
  'api-manager': [
    STORAGE_KEYS.API_MANAGER_USER_APIS,
    STORAGE_KEYS.API_MANAGER_PINNED_IDS,
    STORAGE_KEYS.API_MANAGER_ENVIRONMENTS,
    STORAGE_KEYS.API_MANAGER_ACTIVE_ENVIRONMENT,
    STORAGE_KEYS.API_MANAGER_COLLECTIONS,
    STORAGE_KEYS.API_MANAGER_ACTIVE_COLLECTION,
    STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS,
  ],
  music: [
    STORAGE_KEYS.MUSIC_VOLUME,
    STORAGE_KEYS.MUSIC_SEARCH_HISTORY,
    STORAGE_KEYS.MUSIC_QUEUE,
    STORAGE_KEYS.MUSIC_PLAY_MODE,
  ],
  stock: [
    STORAGE_KEYS.STOCK_FAVORITES,
    STORAGE_KEYS.STOCK_ALERTS,
    STORAGE_KEYS.STOCK_NOTES,
    STORAGE_KEYS.STOCK_POSITIONS,
  ],
}

const TOOLBOX_LOCAL_STORAGE_KEYS = [
  'dev-toolbox:realtime',
  'dev-toolbox:pinned',
  'dev-toolbox:collapsed',
  'dev-toolbox:pipeline:presets',
  'dev-toolbox:tt:rules',
]

const isCategoryId = (value: unknown): value is CloudSyncCategoryId =>
  CLOUD_SYNC_CATEGORIES.some((category) => category.id === value)

function normalizeSelection(value: unknown): CloudSyncCategoryId[] {
  if (!Array.isArray(value)) return [...DEFAULT_SELECTION]
  return [...new Set(value.filter(isCategoryId))]
}

function collectCategoryData(id: Exclude<CloudSyncCategoryId, 'workspace'>): CloudCategoryPayload {
  if (id === 'toolbox') {
    return {
      updatedAt: Date.now(),
      data: {
        localStorage: Object.fromEntries(
          TOOLBOX_LOCAL_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]),
        ),
      },
    }
  }

  return {
    updatedAt: Date.now(),
    data: {
      storage: Object.fromEntries(
        STORAGE_CATEGORY_KEYS[id].map((key) => [key, getStorage<unknown>(key, null)]),
      ),
    },
  }
}

async function applyCategoryData(
  id: Exclude<CloudSyncCategoryId, 'workspace'>,
  payload: CloudCategoryPayload,
) {
  if (!payload?.data || typeof payload.data !== 'object') throw new Error('云端数据格式无效')
  if (id === 'toolbox') {
    const values = payload.data.localStorage
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new Error('工具箱数据格式无效')
    const before = collectCategoryData('toolbox').data.localStorage!
    try {
      for (const key of TOOLBOX_LOCAL_STORAGE_KEYS) {
        if (!(key in values)) continue
        const value = values[key]
        if (value !== null && typeof value !== 'string') throw new Error('工具箱数据格式无效')
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      }
    } catch (error) {
      // localStorage 没有事务，写入失败时尽量恢复该类别原有数据。
      for (const [key, value] of Object.entries(before)) {
        try {
          if (value === null) localStorage.removeItem(key)
          else localStorage.setItem(key, value)
        } catch {}
      }
      throw error
    }
    return
  }
  const values = payload.data.storage
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('云端数据格式无效')
  const allowed = new Set(STORAGE_CATEGORY_KEYS[id])
  await applyStoragePatch(
    Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key))),
  )
}

export interface CloudSyncBackup {
  version: 1
  createdAt: number
  ownerId: number | null
  selection: CloudSyncCategoryId[]
  workspace?: WorkspaceConfig
  categories: SelectiveCloudSyncConfig['categories']
}

export interface CloudSyncDownloadPreview {
  ownerId: number | null
  selection: CloudSyncCategoryId[]
  workspace: WorkspaceCloudConfig | null
  categories: SelectiveCloudSyncConfig['categories']
  entries: Array<{
    id: CloudSyncCategoryId
    title: string
    available: boolean
    localCount: number
    remoteCount: number
  }>
}

const cloneSnapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const categoryCount = (payload?: CloudCategoryPayload) =>
  Object.values(payload?.data?.storage || payload?.data?.localStorage || {}).filter(
    (value) => value !== null,
  ).length

export const useCloudSyncStore = defineStore('cloud-sync', () => {
  const workspace = useWorkspaceStore()
  const selection = ref<CloudSyncCategoryId[]>(
    normalizeSelection(getStorage<CloudSyncCategoryId[]>(SELECTION_KEY, DEFAULT_SELECTION)),
  )
  const remote = ref<SelectiveCloudSyncConfig | null>(null)
  const remoteUpdatedAt = ref<number | null>(null)
  const isLoading = ref(false)
  const isSyncing = ref(false)
  let remoteRevision = 0
  let activePreview: CloudSyncDownloadPreview | null = null
  const backupKey = (owner = workspace.ownerId) => `cloud-sync:backup:${owner ?? 'guest'}`
  const localBackup = ref<CloudSyncBackup | null>(getStorage(backupKey()))
  watch(
    () => workspace.ownerId,
    () => {
      remoteRevision++
      activePreview = null
      remote.value = null
      remoteUpdatedAt.value = null
      isLoading.value = false
      localBackup.value = getStorage(backupKey())
    },
    { flush: 'sync' },
  )
  const assertOwner = (owner: number | null) => {
    if (workspace.ownerId !== owner) throw new Error('账号已切换，请重新操作')
  }
  const checkIdle = () => {
    if (isSyncing.value) throw new Error('已有同步操作正在进行，请稍后重试')
  }
  async function saveBackup(ids: CloudSyncCategoryId[]) {
    const snapshot: CloudSyncBackup = {
      version: 1,
      createdAt: Date.now(),
      ownerId: workspace.ownerId,
      selection: [...ids],
      categories: {},
    }
    for (const id of ids) {
      if (id === 'workspace') snapshot.workspace = cloneSnapshot(workspace.config)
      else snapshot.categories[id] = cloneSnapshot(collectCategoryData(id))
    }
    await applyStoragePatch({ [backupKey(snapshot.ownerId)]: snapshot })
    assertOwner(snapshot.ownerId)
    localBackup.value = snapshot
  }

  const selectedSet = computed(() => new Set(selection.value))
  const hasRemoteData = (id: CloudSyncCategoryId) =>
    id === 'workspace'
      ? workspace.lastSyncedAt !== null
      : Boolean(remote.value?.categories[id as Exclude<CloudSyncCategoryId, 'workspace'>])

  function persistSelection() {
    setStorage(SELECTION_KEY, [...selection.value])
    workspace.setCloudSyncEnabled(selection.value.includes('workspace'))
  }

  function setCategoryEnabled(id: CloudSyncCategoryId, enabled: boolean) {
    const next = new Set(selection.value)
    if (enabled) next.add(id)
    else next.delete(id)
    selection.value = CLOUD_SYNC_CATEGORIES.map((category) => category.id).filter((categoryId) =>
      next.has(categoryId),
    )
    persistSelection()
  }

  async function fetchRemote(options: { adoptSelection?: boolean } = {}) {
    const owner = workspace.ownerId
    const revision = ++remoteRevision
    isLoading.value = true
    try {
      const { data } = await api.get<{
        data: { config: SelectiveCloudSyncConfig; updatedAt: string } | null
      }>('/api/auth/sync')
      assertOwner(owner)
      if (revision !== remoteRevision) throw new Error('云端检查已被新的操作替代，请重试')
      remote.value = data?.config || null
      remoteUpdatedAt.value = data
        ? data.config.updatedAt || Date.parse(data.updatedAt) || Date.now()
        : null
      if (data?.config && options.adoptSelection !== false) {
        selection.value = normalizeSelection(data.config.selection)
        persistSelection()
      }
      return remote.value
    } finally {
      if (revision === remoteRevision) isLoading.value = false
    }
  }

  async function uploadSelected() {
    checkIdle()
    if (!selection.value.length) throw new Error('请至少选择一类数据')
    isSyncing.value = true
    const owner = workspace.ownerId
    const ids = [...selection.value]
    try {
      await fetchRemote({ adoptSelection: false })
      assertOwner(owner)
      if (ids.includes('workspace')) {
        const uploaded = await workspace.pushToServer(true)
        if (!uploaded) throw new Error('工作区布局上传失败')
      }
      assertOwner(owner)

      const categories = { ...(remote.value?.categories || {}) }
      for (const id of ids) {
        if (id === 'workspace') continue
        categories[id] = collectCategoryData(id)
      }
      const config: SelectiveCloudSyncConfig = {
        version: 1,
        selection: ids,
        categories,
        updatedAt: Date.now(),
      }
      const { data } = await api.put<{
        data: { config: SelectiveCloudSyncConfig; updatedAt: string }
      }>('/api/auth/sync', { config })
      assertOwner(owner)
      remote.value = data.config
      remoteUpdatedAt.value = data.config.updatedAt || Date.parse(data.updatedAt) || Date.now()
      return ids.length
    } finally {
      isSyncing.value = false
    }
  }

  async function prepareDownload(): Promise<CloudSyncDownloadPreview> {
    checkIdle()
    if (!selection.value.length) throw new Error('请至少选择一类数据')
    const ids = [...selection.value]
    const ownerId = workspace.ownerId
    isSyncing.value = true
    try {
      const [latest, remoteWorkspace] = await Promise.all([
        fetchRemote({ adoptSelection: false }),
        ids.includes('workspace') ? workspace.fetchCloudWorkspace() : Promise.resolve(null),
      ])
      assertOwner(ownerId)
      const preview: CloudSyncDownloadPreview = cloneSnapshot({
        ownerId,
        selection: ids,
        workspace: remoteWorkspace,
        categories: latest?.categories || {},
        entries: ids.map((id) => ({
          id,
          title: CLOUD_SYNC_CATEGORIES.find((category) => category.id === id)!.title,
          available:
            id === 'workspace' ? Boolean(remoteWorkspace) : Boolean(latest?.categories[id]),
          localCount:
            id === 'workspace'
              ? workspace.config.workspaces.length
              : categoryCount(collectCategoryData(id)),
          remoteCount:
            id === 'workspace'
              ? remoteWorkspace?.workspaces.length || 0
              : categoryCount(latest?.categories[id]),
        })),
      })
      activePreview = preview
      return preview
    } finally {
      isSyncing.value = false
    }
  }

  async function downloadSelected(prepared?: CloudSyncDownloadPreview) {
    checkIdle()
    const preview = prepared || (await prepareDownload())
    checkIdle()
    assertOwner(preview.ownerId)
    if (activePreview !== preview) throw new Error('请重新预览云端数据')
    activePreview = null
    isSyncing.value = true
    try {
      const available = preview.entries.filter((entry) => entry.available).map((entry) => entry.id)
      const missing = preview.entries.filter((entry) => !entry.available).map((entry) => entry.id)
      const applied: CloudSyncCategoryId[] = []
      const failed: Array<{ id: CloudSyncCategoryId; message: string }> = []
      if (available.length) await saveBackup(available)
      for (const id of available) {
        assertOwner(preview.ownerId)
        try {
          if (id === 'workspace') await workspace.applyCloudWorkspace(preview.workspace!)
          else await applyCategoryData(id, preview.categories[id]!)
          applied.push(id)
        } catch (error) {
          failed.push({ id, message: error instanceof Error ? error.message : '本地写入失败' })
        }
        assertOwner(preview.ownerId)
      }
      return { applied, missing, failed }
    } finally {
      isSyncing.value = false
    }
  }

  async function restoreBackup() {
    checkIdle()
    const backup = cloneSnapshot(localBackup.value)
    if (!backup) throw new Error('本机还没有同步备份')
    assertOwner(backup.ownerId)
    isSyncing.value = true
    try {
      // 先保存当前数据，使本次恢复也可以撤销。
      await saveBackup(backup.selection)
      const applied: CloudSyncCategoryId[] = []
      const failed: Array<{ id: CloudSyncCategoryId; message: string }> = []
      for (const id of backup.selection) {
        assertOwner(backup.ownerId)
        try {
          if (id === 'workspace') {
            if (!backup.workspace) throw new Error('备份缺少工作区数据')
            await workspace.restoreLocalConfig(backup.workspace)
          } else {
            if (!backup.categories[id]) throw new Error('备份缺少数据')
            await applyCategoryData(id, backup.categories[id]!)
          }
          applied.push(id)
        } catch (error) {
          failed.push({ id, message: error instanceof Error ? error.message : '恢复失败' })
        }
        assertOwner(backup.ownerId)
      }
      if (failed.length) {
        // 部分类别恢复失败时保留原恢复点，供重试使用。
        await applyStoragePatch({ [backupKey(backup.ownerId)]: backup })
        assertOwner(backup.ownerId)
        localBackup.value = backup
      }
      return { applied, failed }
    } finally {
      isSyncing.value = false
    }
  }

  async function deleteSelectedCloudData() {
    checkIdle()
    if (!selection.value.length) throw new Error('请至少选择一类数据')
    isSyncing.value = true
    const owner = workspace.ownerId
    const ids = [...selection.value]
    try {
      await fetchRemote({ adoptSelection: false })
      assertOwner(owner)
      if (ids.includes('workspace')) await workspace.deleteCloudWorkspace()
      assertOwner(owner)

      const categories = { ...(remote.value?.categories || {}) }
      for (const id of ids) {
        if (id !== 'workspace') delete categories[id]
      }

      if (Object.keys(categories).length) {
        const config: SelectiveCloudSyncConfig = {
          version: 1,
          selection: ids,
          categories,
          updatedAt: Date.now(),
        }
        const { data } = await api.put<{
          data: { config: SelectiveCloudSyncConfig; updatedAt: string }
        }>('/api/auth/sync', { config })
        assertOwner(owner)
        remote.value = data.config
        remoteUpdatedAt.value = data.config.updatedAt || Date.parse(data.updatedAt) || Date.now()
      } else {
        await api.delete('/api/auth/sync')
        assertOwner(owner)
        remote.value = null
        remoteUpdatedAt.value = null
      }
    } finally {
      isSyncing.value = false
    }
  }

  return {
    selection,
    localBackup,
    prepareDownload,
    restoreBackup,
    remote,
    remoteUpdatedAt,
    isLoading,
    isSyncing,
    selectedSet,
    hasRemoteData,
    setCategoryEnabled,
    fetchRemote,
    uploadSelected,
    downloadSelected,
    deleteSelectedCloudData,
  }
})
