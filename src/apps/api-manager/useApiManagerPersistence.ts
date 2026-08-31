import { ref, watch } from 'vue'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { getStorage, setStorage } from '@/lib/storage'
import type { ApiItem } from './defaults'
import type {
  ApiCollection,
  ApiEnvironment,
  RequestHistoryItem,
  SavedRequest,
} from './types'

const LEGACY_USER_APIS_KEY = 'userApis'
const LEGACY_PINNED_IDS_KEY = 'pinnedSystemIds'

export function useApiManagerPersistence() {
  const userApis = ref<ApiItem[]>([])
  const pinnedSystemIds = ref<(string | number)[]>([])
  const recentIds = ref<(string | number)[]>([])
  const requestHistory = ref<RequestHistoryItem[]>([])
  const environments = ref<ApiEnvironment[]>([])
  const activeEnvironmentId = ref('')
  const collections = ref<ApiCollection[]>([])
  const activeCollectionId = ref('')
  const savedRequests = ref<SavedRequest[]>([])

  function hydrate() {
    const legacyUserApis = getStorage<ApiItem[]>(LEGACY_USER_APIS_KEY, []) ?? []
    const legacyPinnedIds = getStorage<(string | number)[]>(LEGACY_PINNED_IDS_KEY, []) ?? []

    userApis.value =
      getStorage<ApiItem[]>(STORAGE_KEYS.API_MANAGER_USER_APIS, legacyUserApis) ?? legacyUserApis
    pinnedSystemIds.value =
      getStorage<(string | number)[]>(STORAGE_KEYS.API_MANAGER_PINNED_IDS, legacyPinnedIds) ??
      legacyPinnedIds
    recentIds.value = getStorage<(string | number)[]>(STORAGE_KEYS.API_MANAGER_RECENT_IDS, []) ?? []
    requestHistory.value =
      getStorage<RequestHistoryItem[]>(STORAGE_KEYS.API_MANAGER_HISTORY, []) ?? []
    environments.value =
      getStorage<ApiEnvironment[]>(STORAGE_KEYS.API_MANAGER_ENVIRONMENTS, []) ?? []
    if (!environments.value.length) {
      environments.value = [{ id: crypto.randomUUID(), name: '默认环境', variables: [] }]
    }
    activeEnvironmentId.value =
      getStorage<string>(STORAGE_KEYS.API_MANAGER_ACTIVE_ENVIRONMENT, environments.value[0].id) ||
      environments.value[0].id
    collections.value =
      getStorage<ApiCollection[]>(STORAGE_KEYS.API_MANAGER_COLLECTIONS, []) ?? []
    if (!collections.value.length) {
      collections.value = [{ id: crypto.randomUUID(), name: '默认集合', color: '#667eea' }]
    }
    activeCollectionId.value =
      getStorage<string>(STORAGE_KEYS.API_MANAGER_ACTIVE_COLLECTION, collections.value[0].id) ||
      collections.value[0].id
    savedRequests.value =
      getStorage<SavedRequest[]>(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, []) ?? []
  }

  function persistWorkspace() {
    setStorage(STORAGE_KEYS.API_MANAGER_COLLECTIONS, collections.value)
    setStorage(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, savedRequests.value)
  }

  watch(userApis, (value) => setStorage(STORAGE_KEYS.API_MANAGER_USER_APIS, value), { deep: true })
  watch(pinnedSystemIds, (value) => setStorage(STORAGE_KEYS.API_MANAGER_PINNED_IDS, value), {
    deep: true,
  })
  watch(recentIds, (value) => setStorage(STORAGE_KEYS.API_MANAGER_RECENT_IDS, value), { deep: true })
  watch(requestHistory, (value) => setStorage(STORAGE_KEYS.API_MANAGER_HISTORY, value), {
    deep: true,
  })
  watch(environments, (value) => setStorage(STORAGE_KEYS.API_MANAGER_ENVIRONMENTS, value), {
    deep: true,
  })
  watch(activeEnvironmentId, (value) =>
    setStorage(STORAGE_KEYS.API_MANAGER_ACTIVE_ENVIRONMENT, value),
  )
  watch(collections, (value) => setStorage(STORAGE_KEYS.API_MANAGER_COLLECTIONS, value), {
    deep: true,
  })
  watch(activeCollectionId, (value) =>
    setStorage(STORAGE_KEYS.API_MANAGER_ACTIVE_COLLECTION, value),
  )
  watch(savedRequests, (value) => setStorage(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, value), {
    deep: true,
  })

  return {
    userApis,
    pinnedSystemIds,
    recentIds,
    requestHistory,
    environments,
    activeEnvironmentId,
    collections,
    activeCollectionId,
    savedRequests,
    hydrate,
    persistWorkspace,
  }
}
