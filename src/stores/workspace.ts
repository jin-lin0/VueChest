import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { APP_MODULES, STORAGE_KEYS } from '@/config'
import { getStorage, setStorage, applyStoragePatch } from '@/lib/storage'
import { api } from '@/lib/request'

export interface WorkspaceItem {
  appKey: string
}

export interface WorkspaceDefinition {
  id: string
  name: string
  icon: string
  items: WorkspaceItem[]
}

export interface RecentWorkspaceApp {
  appKey: string
  openedAt: number
}

export interface WorkspacePreferences {
  showWorkspaceBar: boolean
  showAppDescriptions: boolean
  cardDensity: 'standard' | 'compact'
}

export interface WorkspaceConfig {
  version: 1
  activeWorkspaceId: string
  workspaces: WorkspaceDefinition[]
  recentApps: RecentWorkspaceApp[]
  knownApps: string[]
  preferences: WorkspacePreferences
  layoutUpdatedAt: number
}

export interface WorkspaceCloudConfig {
  version: 1
  workspaces: WorkspaceDefinition[]
  updatedAt: number
}

export interface WorkspaceTemplateData {
  version: 1
  name: string
  icon: string
  description?: string
  appKeys: string[]
}

export type WorkspaceSyncState = 'local' | 'syncing' | 'synced' | 'error'

const MAX_WORKSPACES = 8
const MAX_RECENT_APPS = 12
const APP_KEY_RE = /^(builtin|market):\d+$/
const availableBuiltinAppKeys = () =>
  APP_MODULES.filter((app) => !app.devOnly || import.meta.env.DEV).map((app) => `builtin:${app.id}`)

const defaultHiddenBuiltinKeys = () =>
  APP_MODULES.filter((app) => (!app.devOnly || import.meta.env.DEV) && app.defaultHidden).map(
    (app) => `builtin:${app.id}`,
  )

const defaultBuiltinAppKeys = () =>
  APP_MODULES.filter((app) => (!app.devOnly || import.meta.env.DEV) && !app.defaultHidden).map(
    (app) => `builtin:${app.id}`,
  )

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

function normalizeWorkspaceItems(value: unknown): WorkspaceItem[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const items: WorkspaceItem[] = []
  for (const entry of value) {
    const appKey =
      entry && typeof entry === 'object' && 'appKey' in entry
        ? String((entry as { appKey?: unknown }).appKey || '')
        : ''
    if (!APP_KEY_RE.test(appKey) || seen.has(appKey)) continue

    seen.add(appKey)
    items.push({ appKey })
    if (items.length >= 100) break
  }
  return items
}

function createInitialConfig(): WorkspaceConfig {
  const keys = defaultBuiltinAppKeys()
  const availableKeys = availableBuiltinAppKeys()
  const oldOrder = getStorage<number[]>(STORAGE_KEYS.HOME_APP_ORDER, []) || []
  const oldHidden = new Set(getStorage<number[]>(STORAGE_KEYS.HOME_APP_HIDDEN, []) || [])
  const orderedKeys = oldOrder
    .filter((id) => !oldHidden.has(id) && keys.includes(`builtin:${id}`))
    .map((id) => `builtin:${id}`)
  const seen = new Set(orderedKeys)

  keys.forEach((key) => {
    const id = Number(key.split(':')[1])
    if (!seen.has(key) && !oldHidden.has(id)) orderedKeys.push(key)
  })

  const id = createId()
  return {
    version: 1,
    activeWorkspaceId: id,
    workspaces: [
      {
        id,
        name: '我的工作台',
        icon: '⌂',
        items: orderedKeys.map((appKey) => ({ appKey })),
      },
    ],
    recentApps: [],
    knownApps: availableKeys,
    preferences: {
      showWorkspaceBar: true,
      showAppDescriptions: true,
      cardDensity: 'standard',
    },
    layoutUpdatedAt: 0,
  }
}

function normalizeConfig(value: unknown): WorkspaceConfig {
  const fallback = createInitialConfig()
  if (!value || typeof value !== 'object') return fallback

  const raw = value as Partial<WorkspaceConfig>
  const workspaces = Array.isArray(raw.workspaces)
    ? raw.workspaces
        .slice(0, MAX_WORKSPACES)
        .filter((item): item is WorkspaceDefinition => !!item && typeof item === 'object')
        .map((item) => ({
          id: typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : createId(),
          name:
            typeof item.name === 'string' && item.name.trim()
              ? item.name.trim().slice(0, 20)
              : '未命名工作区',
          icon: typeof item.icon === 'string' && item.icon ? item.icon.slice(0, 8) : '◫',
          items: normalizeWorkspaceItems(item.items),
        }))
    : []

  if (workspaces.length === 0) return fallback

  const activeWorkspaceId = workspaces.some((item) => item.id === raw.activeWorkspaceId)
    ? raw.activeWorkspaceId!
    : workspaces[0].id

  return {
    version: 1,
    activeWorkspaceId,
    workspaces,
    recentApps: Array.isArray(raw.recentApps)
      ? raw.recentApps
          .filter((item) => item && APP_KEY_RE.test(item.appKey))
          .slice(0, MAX_RECENT_APPS)
          .map((item) => ({
            appKey: item.appKey,
            openedAt: Number.isFinite(item.openedAt) ? item.openedAt : Date.now(),
          }))
      : [],
    knownApps: Array.isArray(raw.knownApps)
      ? [
          ...new Set([
            ...raw.knownApps.filter((key) => typeof key === 'string' && APP_KEY_RE.test(key)),
            ...defaultHiddenBuiltinKeys(),
          ]),
        ]
      : availableBuiltinAppKeys(),
    preferences: {
      showWorkspaceBar: raw.preferences?.showWorkspaceBar !== false,
      showAppDescriptions: raw.preferences?.showAppDescriptions !== false,
      cardDensity: raw.preferences?.cardDensity === 'compact' ? 'compact' : 'standard',
    },
    layoutUpdatedAt: Number.isFinite(raw.layoutUpdatedAt) ? Number(raw.layoutUpdatedAt) : 0,
  }
}

function normalizeCloudConfig(value: unknown): WorkspaceCloudConfig {
  const normalized = normalizeConfig(value)
  const raw = value as Partial<WorkspaceCloudConfig> | null
  return {
    version: 1,
    workspaces: normalized.workspaces,
    updatedAt: Number.isFinite(raw?.updatedAt) ? Number(raw?.updatedAt) : 0,
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const config = ref<WorkspaceConfig>(createInitialConfig())
  const ownerId = ref<number | null>(null)
  const initialized = ref(false)
  const syncState = ref<WorkspaceSyncState>('local')
  const lastSyncedAt = ref<number | null>(null)
  const cloudSyncEnabled = ref(true)
  let syncTimer: ReturnType<typeof setTimeout> | null = null
  let contextRevision = 0
  let pushQueue = Promise.resolve(false)

  function invalidateSync() {
    contextRevision++
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = null
  }

  const storageKey = (userId: number | null) =>
    `${STORAGE_KEYS.WORKSPACE_CONFIG_PREFIX}:${userId === null ? 'guest' : userId}`

  const activeWorkspace = computed(
    () =>
      config.value.workspaces.find((item) => item.id === config.value.activeWorkspaceId) ||
      config.value.workspaces[0],
  )

  function init() {
    if (initialized.value) return
    const saved = getStorage<WorkspaceConfig>(storageKey(null))
    config.value = normalizeConfig(saved)
    initialized.value = true
  }

  function saveLocal() {
    setStorage(storageKey(ownerId.value), clone(config.value))
    syncState.value = ownerId.value === null ? 'local' : syncState.value
  }

  function saveLayout() {
    config.value.layoutUpdatedAt = Math.max(Date.now(), config.value.layoutUpdatedAt + 1)
    saveLocal()
    scheduleCloudSync()
  }

  function getCloudConfig(): WorkspaceCloudConfig {
    return {
      version: 1,
      workspaces: clone(config.value.workspaces),
      updatedAt: config.value.layoutUpdatedAt,
    }
  }

  function scheduleCloudSync() {
    if (ownerId.value === null || !cloudSyncEnabled.value) return
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => void pushToServer(), 800)
  }

  async function pushToServer(force = false) {
    if (ownerId.value === null || (!cloudSyncEnabled.value && !force)) return false
    if (config.value.layoutUpdatedAt <= 0) {
      config.value.layoutUpdatedAt = Date.now()
      saveLocal()
    }
    const owner = ownerId.value
    const revision = contextRevision
    const snapshot = getCloudConfig()
    const current = () => ownerId.value === owner && contextRevision === revision
    const operation = pushQueue
      .catch(() => false)
      .then(async () => {
        if (!current()) return false
        syncState.value = 'syncing'
        try {
          await api.put('/api/auth/workspace', { config: snapshot })
          if (!current()) return false
          if (config.value.layoutUpdatedAt === snapshot.updatedAt) {
            lastSyncedAt.value = Date.now()
            syncState.value = 'synced'
          }
          return true
        } catch {
          if (current()) syncState.value = 'error'
          return false
        }
      })
    pushQueue = operation
    return operation
  }

  function bindUserConfig(userId: number) {
    init()
    if (ownerId.value === userId) return
    invalidateSync()
    const saved = getStorage<WorkspaceConfig>(storageKey(userId))
    config.value = normalizeConfig(
      saved ||
        (ownerId.value === null ? config.value : getStorage<WorkspaceConfig>(storageKey(null))),
    )
    ownerId.value = userId
    setStorage(storageKey(userId), clone(config.value))
  }

  async function syncWithServer(userId: number) {
    bindUserConfig(userId)
    cloudSyncEnabled.value = true
    const revision = ++contextRevision
    const layoutAtStart = config.value.layoutUpdatedAt
    const current = () => ownerId.value === userId && revision === contextRevision

    syncState.value = 'syncing'
    try {
      const { data } = await api.get<{
        data: { config: WorkspaceCloudConfig; updatedAt: string } | null
      }>('/api/auth/workspace')
      if (!current()) return
      if (config.value.layoutUpdatedAt !== layoutAtStart) {
        await pushToServer()
        return
      }

      if (data?.config) {
        const remote = normalizeCloudConfig(data.config)
        if (remote.updatedAt > config.value.layoutUpdatedAt) {
          config.value.workspaces = remote.workspaces
          config.value.layoutUpdatedAt = remote.updatedAt
          if (!remote.workspaces.some((item) => item.id === config.value.activeWorkspaceId)) {
            config.value.activeWorkspaceId = remote.workspaces[0].id
          }
          saveLocal()
          lastSyncedAt.value = Date.parse(data.updatedAt) || Date.now()
          syncState.value = 'synced'
          return
        }

        if (remote.updatedAt === config.value.layoutUpdatedAt) {
          lastSyncedAt.value = Date.parse(data.updatedAt) || Date.now()
          syncState.value = 'synced'
          return
        }
      }

      await pushToServer()
    } catch {
      if (current()) syncState.value = 'error'
    }
  }

  function switchToUser(userId: number) {
    bindUserConfig(userId)
    invalidateSync()
    cloudSyncEnabled.value = false
    syncState.value = 'local'
    lastSyncedAt.value = null
  }

  function setCloudSyncEnabled(enabled: boolean) {
    if (cloudSyncEnabled.value !== enabled) invalidateSync()
    cloudSyncEnabled.value = enabled
    if (!enabled) syncState.value = 'local'
  }

  async function fetchCloudWorkspace(): Promise<WorkspaceCloudConfig | null> {
    if (ownerId.value === null) return null
    const owner = ownerId.value
    const revision = contextRevision
    const { data } = await api.get<{
      data: { config: WorkspaceCloudConfig; updatedAt: string } | null
    }>('/api/auth/workspace')
    if (ownerId.value !== owner || contextRevision !== revision)
      throw new Error('工作区或账号已变化，请重新操作')
    return data?.config ? normalizeCloudConfig(data.config) : null
  }

  async function downloadCloudWorkspace() {
    const remote = await fetchCloudWorkspace()
    if (!remote) throw new Error('云端还没有工作区数据')
    await applyCloudWorkspace(remote)
  }

  async function applyCloudWorkspace(remote: WorkspaceCloudConfig) {
    const next = clone(config.value)
    next.workspaces = normalizeCloudConfig(remote).workspaces
    next.layoutUpdatedAt = remote.updatedAt
    if (!next.workspaces.some((item) => item.id === next.activeWorkspaceId)) {
      next.activeWorkspaceId = next.workspaces[0].id
    }
    await restoreLocalConfig(next)
    lastSyncedAt.value = Date.now()
    syncState.value = 'synced'
  }

  async function restoreLocalConfig(snapshot: WorkspaceConfig) {
    const owner = ownerId.value
    invalidateSync()
    const revision = contextRevision
    const next = normalizeConfig(clone(snapshot))
    await applyStoragePatch({ [storageKey(owner)]: next })
    if (ownerId.value !== owner || revision !== contextRevision)
      throw new Error('工作区或账号已变化，请重新操作')
    config.value = next
    syncState.value = 'local'
    lastSyncedAt.value = null
  }

  async function deleteCloudWorkspace() {
    if (ownerId.value === null) return
    const owner = ownerId.value
    invalidateSync()
    const revision = contextRevision
    await pushQueue.catch(() => false)
    if (ownerId.value !== owner || contextRevision !== revision)
      throw new Error('账号已切换，请重新操作')
    await api.delete('/api/auth/workspace')
    if (ownerId.value !== owner || contextRevision !== revision)
      throw new Error('账号已切换，请重新操作')
    lastSyncedAt.value = null
    syncState.value = 'local'
  }

  function switchToGuest() {
    init()
    if (ownerId.value === null) return
    invalidateSync()
    ownerId.value = null
    cloudSyncEnabled.value = true
    config.value = normalizeConfig(getStorage<WorkspaceConfig>(storageKey(null)))
    syncState.value = 'local'
    lastSyncedAt.value = null
  }

  function setActiveWorkspace(id: string) {
    if (!config.value.workspaces.some((item) => item.id === id)) return
    config.value.activeWorkspaceId = id
    saveLocal()
  }

  function setWorkspaceOrder(workspaces: WorkspaceDefinition[]) {
    const currentIds = new Set(config.value.workspaces.map((item) => item.id))
    if (
      workspaces.length !== config.value.workspaces.length ||
      new Set(workspaces.map((item) => item.id)).size !== workspaces.length ||
      workspaces.some((item) => !currentIds.has(item.id))
    ) {
      return
    }
    config.value.workspaces = workspaces
    saveLayout()
  }

  function updatePreferences(preferences: Partial<WorkspacePreferences>) {
    config.value.preferences = {
      ...config.value.preferences,
      ...preferences,
    }
    saveLocal()
  }

  function createWorkspace(name: string, icon = '◫') {
    if (config.value.workspaces.length >= MAX_WORKSPACES) return null
    const workspace: WorkspaceDefinition = {
      id: createId(),
      name: name.trim().slice(0, 20) || `工作区 ${config.value.workspaces.length + 1}`,
      icon: icon.trim().slice(0, 8) || '◫',
      items: [],
    }
    config.value.workspaces.push(workspace)
    config.value.activeWorkspaceId = workspace.id
    saveLayout()
    return workspace.id
  }

  function exportActiveWorkspace(): WorkspaceTemplateData {
    return {
      version: 1,
      name: activeWorkspace.value.name,
      icon: activeWorkspace.value.icon,
      appKeys: activeWorkspace.value.items.map((item) => item.appKey),
    }
  }

  function importWorkspace(template: WorkspaceTemplateData) {
    if (config.value.workspaces.length >= MAX_WORKSPACES) {
      throw new Error(`最多创建 ${MAX_WORKSPACES} 个工作区`)
    }
    const appKeys = [
      ...new Set((template.appKeys || []).filter((key) => APP_KEY_RE.test(key))),
    ].slice(0, 100)
    const workspace: WorkspaceDefinition = {
      id: createId(),
      name: String(template.name || '导入的工作区')
        .trim()
        .slice(0, 20),
      icon: String(template.icon || '◫').slice(0, 8),
      items: appKeys.map((appKey) => ({ appKey })),
    }
    config.value.workspaces.push(workspace)
    config.value.activeWorkspaceId = workspace.id
    config.value.knownApps = [...new Set([...config.value.knownApps, ...appKeys])]
    saveLayout()
    return workspace.id
  }

  function updateWorkspace(id: string, payload: { name: string; icon: string }) {
    const workspace = config.value.workspaces.find((item) => item.id === id)
    if (!workspace) return
    workspace.name = payload.name.trim().slice(0, 20) || workspace.name
    workspace.icon = payload.icon.trim().slice(0, 8) || workspace.icon
    saveLayout()
  }

  function deleteWorkspace(id: string) {
    if (config.value.workspaces.length <= 1) return false
    const index = config.value.workspaces.findIndex((item) => item.id === id)
    if (index < 0) return false
    config.value.workspaces.splice(index, 1)
    if (config.value.activeWorkspaceId === id) {
      config.value.activeWorkspaceId = config.value.workspaces[Math.max(0, index - 1)].id
    }
    saveLayout()
    return true
  }

  function setActiveItems(items: WorkspaceItem[]) {
    if (!activeWorkspace.value) return
    activeWorkspace.value.items = normalizeWorkspaceItems(items)
    saveLayout()
  }

  function hasApp(appKey: string) {
    return !!activeWorkspace.value?.items.some((item) => item.appKey === appKey)
  }

  function toggleApp(appKey: string, enabled?: boolean) {
    if (!activeWorkspace.value || !APP_KEY_RE.test(appKey)) return
    const index = activeWorkspace.value.items.findIndex((item) => item.appKey === appKey)
    const shouldAdd = enabled ?? index < 0
    if (shouldAdd && index < 0) {
      activeWorkspace.value.items.push({ appKey })
    } else if (!shouldAdd && index >= 0) {
      activeWorkspace.value.items.splice(index, 1)
    }
    saveLayout()
  }

  function recordRecent(appKey: string) {
    if (!APP_KEY_RE.test(appKey)) return
    config.value.recentApps = [
      { appKey, openedAt: Date.now() },
      ...config.value.recentApps.filter((item) => item.appKey !== appKey),
    ].slice(0, MAX_RECENT_APPS)
    saveLocal()
  }

  function reconcileAvailableApps(appKeys: string[]) {
    const validKeys = [...new Set(appKeys.filter((key) => APP_KEY_RE.test(key)))]
    const known = new Set(config.value.knownApps)
    const additions = validKeys.filter((key) => !known.has(key))
    if (additions.length === 0) return

    const placedApps = new Set(
      config.value.workspaces.flatMap((workspace) => workspace.items.map((item) => item.appKey)),
    )
    let layoutChanged = false
    additions.forEach((appKey) => {
      if (!placedApps.has(appKey) && activeWorkspace.value) {
        activeWorkspace.value.items.push({ appKey })
        placedApps.add(appKey)
        layoutChanged = true
      }
      known.add(appKey)
    })
    config.value.knownApps = [...known]
    if (layoutChanged) saveLayout()
    else saveLocal()
  }

  return {
    config,
    ownerId,
    initialized,
    syncState,
    lastSyncedAt,
    cloudSyncEnabled,
    activeWorkspace,
    init,
    syncWithServer,
    switchToUser,
    setCloudSyncEnabled,
    fetchCloudWorkspace,
    downloadCloudWorkspace,
    applyCloudWorkspace,
    restoreLocalConfig,
    deleteCloudWorkspace,
    pushToServer,
    switchToGuest,
    setActiveWorkspace,
    setWorkspaceOrder,
    updatePreferences,
    createWorkspace,
    exportActiveWorkspace,
    importWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setActiveItems,
    hasApp,
    toggleApp,
    recordRecent,
    reconcileAvailableApps,
  }
})
