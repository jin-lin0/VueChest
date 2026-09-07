import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { isRequestUrlTemplate, toggleSelection } from './collection-workspace'
import { parseCurlCommand, type ParsedCurlRequest } from './curl-importer'
import type { ApiItem } from './defaults'
import {
  cloneSavedRequestToCollection,
  createRequestHeader,
  createSavedRequestFromApi,
} from './saved-request'
import type { ApiCollection, SavedRequest } from './types'
import { HTTP_METHODS } from './request-body'

type WorkspacePickerTab = 'catalog' | 'saved' | 'custom'
type WorkspaceCustomMode = 'form' | 'curl'

interface WorkspaceCustomRequestDraft {
  name: string
  method: ApiItem['method']
  url: string
  category: string
  description: string
  addToCatalog: boolean
}

interface WorkspaceRequestPickerOptions {
  apis: ComputedRef<ApiItem[]>
  catalogApis: ComputedRef<ApiItem[]>
  savedRequests: Readonly<Ref<SavedRequest[]>>
  collections: Readonly<Ref<ApiCollection[]>>
  activeCollectionId: Readonly<Ref<string>>
  activeCollectionName: ComputedRef<string>
  appendRequests: (requests: SavedRequest[]) => void
  addCreatedRequest: (api: ApiItem, saved?: SavedRequest) => void
  notify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
}

const workspaceMethodOptions: SelectOption[] = [
  { value: 'all', label: '全部方法' },
  ...HTTP_METHODS.map((value) => ({ value, label: value })),
]

function blankCustomRequest(): WorkspaceCustomRequestDraft {
  return {
    name: '',
    method: 'GET',
    url: '',
    category: '自定义',
    description: '',
    addToCatalog: false,
  }
}

export function useWorkspaceRequestPicker(options: WorkspaceRequestPickerOptions) {
  const showWorkspaceRequestPicker = ref(false)
  const workspacePickerTab = ref<WorkspacePickerTab>('catalog')
  const workspacePickerSearch = ref('')
  const workspacePickerMethod = ref<string | number>('all')
  const workspaceSelectedApiIds = ref<Array<string | number>>([])
  const workspaceSelectedSavedIds = ref<string[]>([])
  const workspaceCustomErrors = ref<Record<string, string>>({})
  const workspaceCustomMode = ref<WorkspaceCustomMode>('form')
  const workspaceCurlCommand = ref('')
  const workspaceCurlError = ref('')
  const workspaceCustomRequest = ref<WorkspaceCustomRequestDraft>(blankCustomRequest())

  const workspaceCatalogApis = computed(() => {
    const query = workspacePickerSearch.value.trim().toLowerCase()
    return options.catalogApis.value.filter((api) => {
      if (workspacePickerMethod.value !== 'all' && api.method !== workspacePickerMethod.value) {
        return false
      }
      if (!query) return true
      return [api.name, api.url, api.category, api.description]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  })

  const workspaceReusableRequests = computed(() => {
    const query = workspacePickerSearch.value.trim().toLowerCase()
    return options.savedRequests.value.filter((saved) => {
      if (saved.collectionId === options.activeCollectionId.value) return false
      const api = apiForSavedRequest(saved)
      if (!query) return true
      return [saved.name, api?.url || '', api?.method || '', api?.category || '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  })

  const workspacePickerSelectionCount = computed(() =>
    workspacePickerTab.value === 'catalog'
      ? workspaceSelectedApiIds.value.length
      : workspaceSelectedSavedIds.value.length,
  )

  const workspaceCurlPreview = computed<ParsedCurlRequest | null>(() => {
    if (!workspaceCurlCommand.value.trim()) return null
    try {
      return parseCurlCommand(workspaceCurlCommand.value)
    } catch {
      return null
    }
  })

  function apiForSavedRequest(saved: SavedRequest) {
    return options.apis.value.find((api) => api.id === saved.apiId)
  }

  function collectionNameForSavedRequest(saved: SavedRequest) {
    return (
      options.collections.value.find((collection) => collection.id === saved.collectionId)?.name ||
      '未知集合'
    )
  }

  function resetWorkspaceCustomRequest() {
    workspaceCustomRequest.value = blankCustomRequest()
    workspaceCustomErrors.value = {}
    workspaceCurlCommand.value = ''
    workspaceCurlError.value = ''
  }

  function openWorkspaceRequestPicker(tab: WorkspacePickerTab = 'catalog') {
    workspacePickerTab.value = tab
    workspacePickerSearch.value = ''
    workspacePickerMethod.value = 'all'
    workspaceSelectedApiIds.value = []
    workspaceSelectedSavedIds.value = []
    workspaceCustomMode.value = 'form'
    resetWorkspaceCustomRequest()
    showWorkspaceRequestPicker.value = true
  }

  function selectWorkspacePickerTab(tab: WorkspacePickerTab) {
    workspacePickerTab.value = tab
    workspacePickerSearch.value = ''
  }

  function selectWorkspaceCustomMode(mode: WorkspaceCustomMode) {
    workspaceCustomMode.value = mode
    workspaceCustomErrors.value = {}
    workspaceCurlError.value = ''
  }

  function handleWorkspacePickerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    showWorkspaceRequestPicker.value = false
  }

  function toggleWorkspaceApiSelection(id: string | number) {
    workspaceSelectedApiIds.value = toggleSelection(workspaceSelectedApiIds.value, id)
  }

  function toggleWorkspaceSavedSelection(id: string) {
    workspaceSelectedSavedIds.value = toggleSelection(workspaceSelectedSavedIds.value, id)
  }

  function addSelectedCatalogRequests() {
    const requests = workspaceSelectedApiIds.value
      .map((id) => options.apis.value.find((api) => api.id === id))
      .filter((api): api is ApiItem => Boolean(api))
      .map((api) => createSavedRequestFromApi(api, options.activeCollectionId.value))
    options.appendRequests(requests)
    options.notify(
      'success',
      `已向「${options.activeCollectionName.value}」添加 ${requests.length} 个请求`,
    )
  }

  function addSelectedSavedRequests() {
    const requests = workspaceSelectedSavedIds.value
      .map((id) => options.savedRequests.value.find((saved) => saved.id === id))
      .filter((saved): saved is SavedRequest => Boolean(saved))
      .map((saved) => cloneSavedRequestToCollection(saved, options.activeCollectionId.value))
    options.appendRequests(requests)
    options.notify('success', `已复制 ${requests.length} 个已配置请求`)
  }

  function createWorkspaceCustomRequest() {
    const draft = workspaceCustomRequest.value
    const errors: Record<string, string> = {}
    const name = draft.name.trim()
    const url = draft.url.trim()
    if (!name) errors.name = '请输入请求名称'
    if (!url) errors.url = '请输入请求地址'
    else if (!isRequestUrlTemplate(url)) {
      errors.url = '使用 http(s):// 或 {{baseUrl}} 开头'
    }
    workspaceCustomErrors.value = errors
    if (Object.keys(errors).length) return

    const api: ApiItem = {
      id: crypto.randomUUID(),
      name,
      url,
      method: draft.method,
      category: draft.category.trim() || '自定义',
      description: draft.description.trim() || '从 API 工作区快速创建',
      params: [],
      auth: 'none',
      cors: 'unknown',
      userCreated: true,
      catalogVisible: draft.addToCatalog,
      createdAt: new Date().toISOString(),
      pinned: false,
    }
    options.addCreatedRequest(api)
  }

  function createWorkspaceCurlRequest() {
    workspaceCurlError.value = ''
    let parsed: ParsedCurlRequest
    try {
      parsed = parseCurlCommand(workspaceCurlCommand.value)
    } catch (reason) {
      workspaceCurlError.value = reason instanceof Error ? reason.message : '无法解析 cURL 命令'
      return
    }

    const draft = workspaceCustomRequest.value
    const api: ApiItem = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || parsed.suggestedName,
      url: parsed.url,
      method: parsed.method,
      category: draft.category.trim() || '自定义',
      description: '从 cURL 导入',
      params: [],
      auth: 'none',
      cors: 'unknown',
      userCreated: true,
      catalogVisible: draft.addToCatalog,
      createdAt: new Date().toISOString(),
      pinned: false,
    }
    const saved = createSavedRequestFromApi(api, options.activeCollectionId.value)
    saved.headers = parsed.headers.map((header) => createRequestHeader(header.name, header.value))
    saved.body = parsed.body
    saved.bodyMode = parsed.bodyMode
    saved.formFields = parsed.formFields
    if (parsed.basicAuth) saved.auth = { type: 'basic', ...parsed.basicAuth }
    options.addCreatedRequest(api, saved)
  }

  return {
    showWorkspaceRequestPicker,
    workspacePickerTab,
    workspacePickerSearch,
    workspacePickerMethod,
    workspaceSelectedApiIds,
    workspaceSelectedSavedIds,
    workspaceCustomErrors,
    workspaceCustomMode,
    workspaceCurlCommand,
    workspaceCurlError,
    workspaceCustomRequest,
    workspaceMethodOptions,
    workspaceCatalogApis,
    workspaceReusableRequests,
    workspacePickerSelectionCount,
    workspaceCurlPreview,
    apiForSavedRequest,
    collectionNameForSavedRequest,
    resetWorkspaceCustomRequest,
    openWorkspaceRequestPicker,
    selectWorkspacePickerTab,
    selectWorkspaceCustomMode,
    handleWorkspacePickerKeydown,
    toggleWorkspaceApiSelection,
    toggleWorkspaceSavedSelection,
    addSelectedCatalogRequests,
    addSelectedSavedRequests,
    createWorkspaceCustomRequest,
    createWorkspaceCurlRequest,
  }
}
