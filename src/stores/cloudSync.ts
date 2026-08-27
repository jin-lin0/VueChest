import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { STORAGE_KEYS } from '@/config'
import { api } from '@/lib/request'
import { getStorage, removeStorage, setStorage } from '@/lib/storage'
import { useWorkspaceStore } from './workspace'

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

function applyCategoryData(
  id: Exclude<CloudSyncCategoryId, 'workspace'>,
  payload: CloudCategoryPayload,
) {
  if (id === 'toolbox') {
    const allowed = new Set(TOOLBOX_LOCAL_STORAGE_KEYS)
    for (const [key, value] of Object.entries(payload.data.localStorage || {})) {
      if (!allowed.has(key)) continue
      if (typeof value === 'string') localStorage.setItem(key, value)
      else localStorage.removeItem(key)
    }
    return
  }

  const allowed = new Set(STORAGE_CATEGORY_KEYS[id])
  for (const [key, value] of Object.entries(payload.data.storage || {})) {
    if (!allowed.has(key)) continue
    if (value === null || value === undefined) removeStorage(key)
    else setStorage(key, value)
  }
}

export const useCloudSyncStore = defineStore('cloud-sync', () => {
  const workspace = useWorkspaceStore()
  const selection = ref<CloudSyncCategoryId[]>(
    normalizeSelection(getStorage<CloudSyncCategoryId[]>(SELECTION_KEY, DEFAULT_SELECTION)),
  )
  const remote = ref<SelectiveCloudSyncConfig | null>(null)
  const remoteUpdatedAt = ref<number | null>(null)
  const isLoading = ref(false)
  const isSyncing = ref(false)

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
    isLoading.value = true
    try {
      const { data } = await api.get<{
        data: { config: SelectiveCloudSyncConfig; updatedAt: string } | null
      }>('/api/auth/sync')
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
      isLoading.value = false
    }
  }

  async function uploadSelected() {
    if (!selection.value.length) throw new Error('请至少选择一类数据')
    isSyncing.value = true
    try {
      if (selectedSet.value.has('workspace')) {
        const uploaded = await workspace.pushToServer(true)
        if (!uploaded) throw new Error('工作区布局上传失败')
      }

      const categories = { ...(remote.value?.categories || {}) }
      for (const id of selection.value) {
        if (id === 'workspace') continue
        categories[id] = collectCategoryData(id)
      }
      const config: SelectiveCloudSyncConfig = {
        version: 1,
        selection: [...selection.value],
        categories,
        updatedAt: Date.now(),
      }
      const { data } = await api.put<{
        data: { config: SelectiveCloudSyncConfig; updatedAt: string }
      }>('/api/auth/sync', { config })
      remote.value = data.config
      remoteUpdatedAt.value = data.config.updatedAt || Date.parse(data.updatedAt) || Date.now()
      return selection.value.length
    } finally {
      isSyncing.value = false
    }
  }

  async function downloadSelected() {
    if (!selection.value.length) throw new Error('请至少选择一类数据')
    isSyncing.value = true
    try {
      const latest = await fetchRemote({ adoptSelection: false })
      const applied: CloudSyncCategoryId[] = []
      const missing: CloudSyncCategoryId[] = []

      for (const id of selection.value) {
        if (id === 'workspace') {
          try {
            await workspace.downloadCloudWorkspace()
            applied.push(id)
          } catch {
            missing.push(id)
          }
          continue
        }
        const payload = latest?.categories[id]
        if (!payload) {
          missing.push(id)
          continue
        }
        applyCategoryData(id, payload)
        applied.push(id)
      }
      return { applied, missing }
    } finally {
      isSyncing.value = false
    }
  }

  async function deleteSelectedCloudData() {
    if (!selection.value.length) throw new Error('请至少选择一类数据')
    isSyncing.value = true
    try {
      if (selectedSet.value.has('workspace')) await workspace.deleteCloudWorkspace()

      const categories = { ...(remote.value?.categories || {}) }
      for (const id of selection.value) {
        if (id !== 'workspace') delete categories[id]
      }

      if (Object.keys(categories).length) {
        const config: SelectiveCloudSyncConfig = {
          version: 1,
          selection: [...selection.value],
          categories,
          updatedAt: Date.now(),
        }
        const { data } = await api.put<{
          data: { config: SelectiveCloudSyncConfig; updatedAt: string }
        }>('/api/auth/sync', { config })
        remote.value = data.config
        remoteUpdatedAt.value = data.config.updatedAt || Date.parse(data.updatedAt) || Date.now()
      } else {
        await api.delete('/api/auth/sync')
        remote.value = null
        remoteUpdatedAt.value = null
      }
    } finally {
      isSyncing.value = false
    }
  }

  return {
    selection,
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
