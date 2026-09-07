<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  Download,
  ExternalLink,
  GripVertical,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
  Variable,
  Workflow,
  X,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import CopyButton from '@/components/common/CopyButton.vue'
import CustomSelect, { type SelectOption } from '@/components/common/CustomSelect.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Toast from '@/components/common/Toast.vue'
import Modal from '@/components/common/Modal.vue'
import WorkspaceRequestPicker from './components/WorkspaceRequestPicker.vue'
import RequestEditor from './components/RequestEditor.vue'
import ResponsePanel from './components/ResponsePanel.vue'
import CollectionSidebar from './components/CollectionSidebar.vue'
import { useCollectionRunner } from './useCollectionRunner'
import { assertionTypeOptions } from './editor-options'
import {
  HTTP_METHODS,
  canSendBody,
  prepareRequestBody,
  type RequestBodyMode,
  type RequestFormField,
  type RequestFiles,
} from './request-body'
import { useConfirm } from '@/composables/useConfirm'
import type { ApiItem } from './defaults'
import { useApiManagerPersistence } from './useApiManagerPersistence'
import {
  applyAuth,
  extractResponseVariables,
  resolvedHeaders,
  type AuthConfig,
  type ExtractionRule,
} from './collection-runner'
import {
  findVariableReferences,
  requestsForCollection,
  upsertCollectionRequest,
} from './collection-workspace'
import {
  buildCurlCommand,
  buildRequestUrl,
  formatBytes,
  getStatusTone,
  inferApiAccess,
  evaluateAssertions,
  resolveVariables,
  type AssertionResult,
  type AssertionRule,
  type RequestHeader,
} from './request-utils'
import { REQUEST_TIMEOUT_MS, parseResponseBody } from './request-executor'
import {
  createRequestHeader as createHeader,
  createSavedRequestFromApi as buildSavedRequestFromApi,
} from './saved-request'
import type {
  ApiCollection,
  ApiEnvironment,
  ApiResponse,
  AuthDraft,
  CollectionRuntimeVariable,
  RequestHistoryItem,
  SavedRequest,
  WorkspaceResponseSection,
  WorkspaceStepTab,
} from './types'

type CatalogScope = 'all' | 'featured' | 'pinned' | 'recent'
type RequestTab = 'params' | 'headers' | 'body' | 'tests' | 'extract'
type ResponseTab = 'preview' | 'headers' | 'tests'

const router = useRouter()
const route = useRoute()
const { confirm } = useConfirm()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)

const {
  userApis,
  pinnedSystemIds,
  recentIds,
  requestHistory,
  environments,
  activeEnvironmentId,
  collections,
  activeCollectionId,
  savedRequests,
  hydrate: hydratePersistentState,
  persistWorkspace,
} = useApiManagerPersistence()

const defaultApis = ref<ApiItem[]>([])
const isCatalogLoading = ref(true)

const searchQuery = ref('')
const catalogScope = ref<CatalogScope>('all')
const selectedCategory = ref<string | number>('all')
const selectedId = ref<string | number | null>(null)

const paramValues = ref<Record<string, string>>({})
const requestHeaders = ref<RequestHeader[]>([])
const requestBody = ref('')
const requestBodyMode = ref<RequestBodyMode>('raw')
const requestFormFields = ref<RequestFormField[]>([])
const requestFiles = ref<RequestFiles>({})
const requestTab = ref<RequestTab>('params')
const responseTab = ref<ResponseTab>('preview')
const response = ref<ApiResponse | null>(null)
const error = ref<string | null>(null)
const validationMessage = ref<string | null>(null)
const isLoading = ref(false)
const activeController = ref<AbortController | null>(null)
const assertions = ref<AssertionRule[]>([])
const assertionResults = ref<AssertionResult[]>([])
const showWorkspaceManager = ref(false)
const newEnvironmentName = ref('')
const newCollectionName = ref('')
const saveRequestName = ref('')
const editingSavedRequestId = ref<string | null>(null)
const definitionFileRef = ref<HTMLInputElement | null>(null)
const authDraft = ref<AuthDraft>({
  type: 'none',
  token: '',
  name: 'X-API-Key',
  value: '',
  location: 'header',
  username: '',
  password: '',
})
const extractionRules = ref<ExtractionRule[]>([])
const retryCount = ref(0)
const requestTimeoutMs = ref(REQUEST_TIMEOUT_MS)
const selectedWorkspaceRequestId = ref<string | null>(null)
const workspaceStepTab = ref<WorkspaceStepTab>('request')
const workspaceResponseSection = ref<WorkspaceResponseSection>('body')
const showNewCollectionInput = ref(false)
const draggedWorkspaceRequestId = ref<string | null>(null)
const collectionContextMenu = ref<{ collectionId: string; x: number; y: number } | null>(null)
const showWorkspaceRequestPicker = ref(false)

const showAddForm = ref(false)
const editingId = ref<string | number | null>(null)
const formErrors = ref<Record<string, string>>({})
const blankForm = (): Partial<ApiItem> => ({
  name: '',
  url: '',
  method: 'GET',
  category: '',
  description: '',
  params: [],
  docsUrl: '',
  auth: 'none',
  cors: 'unknown',
})
const formData = ref<Partial<ApiItem>>(blankForm())

const methodOptions: SelectOption[] = HTTP_METHODS.map((value) => ({
  value,
  label: value,
}))
const typeOptions: SelectOption[] = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔值' },
]
const authOptions: SelectOption[] = [
  { value: 'none', label: '无需 Key' },
  { value: 'optional', label: '可选鉴权' },
  { value: 'api-key', label: '需要 Key' },
]
const corsOptions: SelectOption[] = [
  { value: 'supported', label: '支持 CORS' },
  { value: 'unknown', label: '未知 / 待验证' },
]

let routeCommandsReady = false
let handledRouteCommand = ''
async function applyRouteCommand() {
  if (!routeCommandsReady) return
  const requestId = typeof route.query.request === 'string' ? route.query.request : ''
  const collectionId =
    typeof route.query.runCollection === 'string' ? route.query.runCollection : ''
  const commandKey = `${requestId}|${collectionId}|${String(route.query.command || '')}`
  if ((!requestId && !collectionId) || commandKey === handledRouteCommand) return
  handledRouteCommand = commandKey

  if (requestId) {
    const saved = savedRequests.value.find((item) => item.id === requestId)
    if (saved) openSavedRequest(saved)
    else notify('warning', '保存的请求已不存在')
    return
  }

  const collection = collections.value.find((item) => item.id === collectionId)
  if (!collection) {
    notify('warning', '请求集合已不存在')
    return
  }
  selectWorkspaceCollection(collection.id)
  showWorkspaceManager.value = true
  await runActiveCollection()
}

onMounted(async () => {
  hydratePersistentState()

  defaultApis.value = (await import('./defaults')).defaultApis
  isCatalogLoading.value = false
  routeCommandsReady = true
  await applyRouteCommand()
})

watch(activeCollectionId, (value, previous) => {
  if (value !== previous) {
    collectionResults.value = []
    collectionRuntimeVariables.value = []
    selectedWorkspaceRequestId.value =
      requestsForCollection(savedRequests.value, value)[0]?.id || null
    const editing = savedRequests.value.find((item) => item.id === editingSavedRequestId.value)
    if (editing && editing.collectionId !== value) {
      editingSavedRequestId.value = null
      saveRequestName.value = ''
    }
  }
})
watch(showWorkspaceManager, (visible) => {
  if (!visible) {
    showWorkspaceRequestPicker.value = false
    collectionContextMenu.value = null
    return
  }
  const selectedExists = activeCollectionRequests.value.some(
    (item) => item.id === selectedWorkspaceRequestId.value,
  )
  if (!selectedExists)
    selectedWorkspaceRequestId.value = activeCollectionRequests.value[0]?.id || null
})
watch(
  () => [route.query.request, route.query.runCollection, route.query.command],
  () => void applyRouteCommand(),
)

const systemApis = computed(() =>
  defaultApis.value.map((api) => ({
    ...api,
    createdAt: api.createdAt ?? '2000-01-01T00:00:00.000Z',
    pinned: pinnedSystemIds.value.includes(api.id),
  })),
)
const apis = computed<ApiItem[]>(() => [...systemApis.value, ...userApis.value])
const catalogApis = computed(() => apis.value.filter((api) => api.catalogVisible !== false))
const selectedApi = computed(() => apis.value.find((api) => api.id === selectedId.value) ?? null)
const featuredApis = computed(() => catalogApis.value.filter((api) => api.featured).slice(0, 6))
const pinnedCount = computed(() => catalogApis.value.filter((api) => api.pinned).length)

const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const api of catalogApis.value) counts.set(api.category, (counts.get(api.category) ?? 0) + 1)
  return counts
})
const categories = computed(() =>
  [...categoryCounts.value.keys()].sort((a, b) => a.localeCompare(b)),
)
const categoryOptions = computed<SelectOption[]>(() => [
  { value: 'all', label: `全部分类 · ${catalogApis.value.length}` },
  ...categories.value.map((category) => ({
    value: category,
    label: `${category} · ${categoryCounts.value.get(category) ?? 0}`,
  })),
])

const filteredApis = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const recentOrder = new Map(recentIds.value.map((id, index) => [id, index]))

  return catalogApis.value
    .filter((api) => {
      if (selectedCategory.value !== 'all' && api.category !== selectedCategory.value) return false
      if (catalogScope.value === 'featured' && !api.featured) return false
      if (catalogScope.value === 'pinned' && !api.pinned) return false
      if (catalogScope.value === 'recent' && !recentIds.value.includes(api.id)) return false
      if (!query) return true
      return [api.name, api.url, api.category, api.description, ...(api.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    .sort((a, b) => {
      if (catalogScope.value === 'recent') {
        return (recentOrder.get(a.id) ?? 99) - (recentOrder.get(b.id) ?? 99)
      }
      if (Boolean(a.pinned) !== Boolean(b.pinned))
        return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      if (Boolean(a.featured) !== Boolean(b.featured))
        return Number(Boolean(b.featured)) - Number(Boolean(a.featured))
      return a.name.localeCompare(b.name, 'zh-CN')
    })
})

const activeEnvironment = computed(
  () =>
    environments.value.find((item) => item.id === activeEnvironmentId.value) ||
    environments.value[0],
)
const activeVariables = computed(() => activeEnvironment.value?.variables || [])
const environmentOptions = computed<SelectOption[]>(() =>
  environments.value.map((item) => ({ value: item.id, label: item.name })),
)
const activeCollection = computed(
  () =>
    collections.value.find((item) => item.id === activeCollectionId.value) || collections.value[0],
)
const activeCollectionRequests = computed(() =>
  requestsForCollection(savedRequests.value, activeCollectionId.value),
)
const {
  collectionRunning,
  collectionResults,
  collectionRuntimeVariables,
  runningRequestId,
  runActiveCollection,
  stopCollection,
} = useCollectionRunner({
  collectionId: activeCollectionId,
  requests: activeCollectionRequests,
  variables: activeVariables,
  files: requestFiles,
  apiFor: apiForSavedRequest,
  notify,
  select: (id, completed) => {
    selectedWorkspaceRequestId.value = id
    if (completed) {
      workspaceStepTab.value = 'response'
      workspaceResponseSection.value = 'body'
    }
  },
})
const editingSavedRequest = computed(() =>
  savedRequests.value.find((item) => item.id === editingSavedRequestId.value),
)
const selectedWorkspaceRequest = computed(() =>
  activeCollectionRequests.value.find((item) => item.id === selectedWorkspaceRequestId.value),
)
const selectedWorkspaceApi = computed(() =>
  apis.value.find((item) => item.id === selectedWorkspaceRequest.value?.apiId),
)
const selectedWorkspaceResult = computed(() =>
  collectionResults.value.find((item) => item.id === selectedWorkspaceRequestId.value),
)
const finalCollectionResult = computed(() => collectionResults.value.at(-1))
const collectionTotalTime = computed(() =>
  collectionResults.value.reduce((total, item) => total + item.time, 0),
)
const selectedWorkspaceResponseBody = computed(() => {
  const body = selectedWorkspaceResult.value?.response?.body || ''
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
})
const workspaceRuntimeVariables = computed<CollectionRuntimeVariable[]>(() => {
  if (collectionRuntimeVariables.value.length) return collectionRuntimeVariables.value
  const declared = new Map<string, CollectionRuntimeVariable>()
  for (const request of activeCollectionRequests.value) {
    for (const rule of request.extractions || []) {
      if (!rule.enabled || !rule.variable.trim()) continue
      declared.set(rule.variable, {
        key: rule.variable,
        value: '',
        sourceRequestId: request.id,
        sourceRequestName: request.name,
      })
    }
  }
  return [...declared.values()]
})
const currentUrl = computed(() =>
  selectedApi.value
    ? resolveVariables(buildRequestUrl(selectedApi.value, paramValues.value), activeVariables.value)
    : '',
)
const curlCommand = computed(() => {
  if (!selectedApi.value) return ''
  const authenticated = applyAuth(
    currentUrl.value,
    resolvedHeaders(requestHeaders.value, activeVariables.value),
    currentAuthConfig(),
    activeVariables.value,
  )
  return buildCurlCommand(
    selectedApi.value,
    authenticated.url,
    Object.entries(authenticated.headers).map(([name, value]) => ({
      id: name,
      name,
      value,
      enabled: true,
    })),
    resolveVariables(requestBody.value, activeVariables.value),
    requestBodyMode.value,
    requestFormFields.value.map((field) => ({
      ...field,
      name: resolveVariables(field.name, activeVariables.value),
      value: resolveVariables(field.value, activeVariables.value),
      filename: field.filename
        ? resolveVariables(field.filename, activeVariables.value)
        : undefined,
      contentType: field.contentType
        ? resolveVariables(field.contentType, activeVariables.value)
        : undefined,
    })),
  )
})

function notify(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function currentAuthConfig(): AuthConfig {
  if (authDraft.value.type === 'bearer') {
    return { type: 'bearer', token: authDraft.value.token }
  }
  if (authDraft.value.type === 'api-key') {
    return {
      type: 'api-key',
      name: authDraft.value.name,
      value: authDraft.value.value,
      location: authDraft.value.location,
    }
  }
  if (authDraft.value.type === 'basic') {
    return {
      type: 'basic',
      username: authDraft.value.username,
      password: authDraft.value.password,
    }
  }
  return { type: 'none' }
}

function loadAuthConfig(auth?: AuthConfig) {
  authDraft.value = {
    type: auth?.type || 'none',
    token: auth?.type === 'bearer' ? auth.token : '',
    name: auth?.type === 'api-key' ? auth.name : 'X-API-Key',
    value: auth?.type === 'api-key' ? auth.value : '',
    location: auth?.type === 'api-key' ? auth.location : 'header',
    username: auth?.type === 'basic' ? auth.username : '',
    password: auth?.type === 'basic' ? auth.password : '',
  }
}

function resetRequest(api: ApiItem) {
  abortRequest()
  if (response.value?.imageUrl) URL.revokeObjectURL(response.value.imageUrl)
  paramValues.value = Object.fromEntries(
    api.params.map((param) => [param.name, param.defaultValue]),
  )
  requestHeaders.value = [createHeader('Accept', '*/*')]
  requestBody.value = canSendBody(api.method) ? '{\n  \n}' : ''
  requestBodyMode.value = 'raw'
  requestFormFields.value = []
  requestTab.value = api.params.length ? 'params' : 'headers'
  responseTab.value = 'preview'
  response.value = null
  assertionResults.value = []
  assertions.value = [
    { id: crypto.randomUUID(), type: 'status', expected: '200', enabled: true },
    { id: crypto.randomUUID(), type: 'time', expected: '2000', enabled: false },
  ]
  loadAuthConfig()
  extractionRules.value = []
  retryCount.value = 0
  requestTimeoutMs.value = REQUEST_TIMEOUT_MS
  error.value = null
  validationMessage.value = null
}

function selectApi(api: ApiItem) {
  showAddForm.value = false
  editingSavedRequestId.value = null
  saveRequestName.value = ''
  selectedId.value = api.id
  recentIds.value = [api.id, ...recentIds.value.filter((id) => id !== api.id)].slice(0, 12)
  resetRequest(api)
}

function closeApi() {
  abortRequest()
  if (response.value?.imageUrl) URL.revokeObjectURL(response.value.imageUrl)
  selectedId.value = null
  response.value = null
  error.value = null
}

function missingRequiredParams(api: ApiItem): string[] {
  return api.params
    .filter(
      (param) => param.required && !(paramValues.value[param.name] || param.defaultValue).trim(),
    )
    .map((param) => param.name)
}

function addHistory(item: Omit<RequestHistoryItem, 'id' | 'createdAt'>) {
  requestHistory.value = [
    { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
    ...requestHistory.value,
  ].slice(0, 25)
}

async function executeApi() {
  const api = selectedApi.value
  if (!api || isLoading.value) return

  const missing = missingRequiredParams(api)
  if (missing.length) {
    validationMessage.value = `请先填写必填参数：${missing.join('、')}`
    requestTab.value = 'params'
    return
  }

  if (response.value?.imageUrl) URL.revokeObjectURL(response.value.imageUrl)
  validationMessage.value = null
  error.value = null
  response.value = null
  responseTab.value = 'preview'
  isLoading.value = true

  const controller = new AbortController()
  activeController.value = controller
  let timedOut = false
  const timeoutId = window.setTimeout(
    () => {
      timedOut = true
      controller.abort()
    },
    Math.min(120_000, Math.max(1000, requestTimeoutMs.value)),
  )
  const startedAt = performance.now()

  try {
    const baseHeaders = resolvedHeaders(requestHeaders.value, activeVariables.value)
    const authenticated = applyAuth(
      currentUrl.value,
      baseHeaders,
      currentAuthConfig(),
      activeVariables.value,
    )
    const prepared = prepareRequestBody({
      method: api.method,
      body: requestBody.value,
      bodyMode: requestBodyMode.value,
      formFields: requestFormFields.value,
      files: requestFiles.value,
      variables: activeVariables.value,
      headers: authenticated.headers,
    })

    let result: Response | null = null
    const attempts = Math.min(3, Math.max(0, retryCount.value)) + 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        result = await fetch(authenticated.url, {
          method: api.method,
          headers: prepared.headers,
          body: prepared.body,
          signal: controller.signal,
        })
        if (result.status < 500 || attempt === attempts - 1) break
        await result.body?.cancel()
      } catch (reason) {
        if (attempt === attempts - 1 || controller.signal.aborted) throw reason
      }
    }
    if (!result) throw new Error('请求未返回响应')
    const contentType = result.headers.get('content-type') ?? ''
    const parsed = await parseResponseBody(result, contentType)
    if (activeController.value !== controller) {
      if (parsed.imageUrl) URL.revokeObjectURL(parsed.imageUrl)
      return
    }
    const time = Math.round(performance.now() - startedAt)
    const responseHeaders: Record<string, string> = {}
    result.headers.forEach((value, name) => {
      responseHeaders[name] = value
    })
    response.value = {
      status: result.status,
      statusText: result.statusText,
      time,
      contentType,
      headers: responseHeaders,
      ...parsed,
    }
    const assertionBody =
      typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data ?? '')
    assertionResults.value = evaluateAssertions(assertions.value, {
      status: result.status,
      time,
      body: assertionBody,
    })
    const extracted = extractResponseVariables(parsed.data, extractionRules.value)
    for (const item of extracted) upsertEnvironmentVariable(item.variable, item.value, true)
    if (extracted.length) notify('success', `已提取 ${extracted.length} 个环境变量`)
    addHistory({
      apiId: api.id,
      apiName: api.name,
      method: api.method,
      status: result.status,
      time,
      ok: result.ok,
    })
  } catch (reason) {
    if (activeController.value !== controller) return
    const time = Math.round(performance.now() - startedAt)
    const message = timedOut
      ? `请求超过 ${Math.round(requestTimeoutMs.value / 1000)} 秒，已自动取消`
      : reason instanceof DOMException && reason.name === 'AbortError'
        ? '请求已取消'
        : reason instanceof TypeError
          ? '浏览器未能完成请求。请检查网络、URL 与目标服务的 CORS 配置。'
          : reason instanceof Error
            ? reason.message
            : '请求失败，请检查网络或 API 地址'
    error.value = message
    addHistory({
      apiId: api.id,
      apiName: api.name,
      method: api.method,
      time,
      ok: false,
      error: message,
    })
  } finally {
    window.clearTimeout(timeoutId)
    if (activeController.value === controller) {
      activeController.value = null
      isLoading.value = false
    }
  }
}

function abortRequest() {
  activeController.value?.abort()
  activeController.value = null
  isLoading.value = false
}

function accessFor(api: ApiItem) {
  return inferApiAccess(api)
}

function setScope(scope: CatalogScope) {
  catalogScope.value = scope
}

function showAddFormPanel() {
  closeApi()
  showAddForm.value = true
  editingId.value = null
  formData.value = blankForm()
  formErrors.value = {}
}

function editApi(api: ApiItem) {
  closeApi()
  showAddForm.value = true
  editingId.value = api.id
  formData.value = {
    ...api,
    params: api.params.map((param) => ({ ...param })),
  }
  formErrors.value = {}
}

function cancelForm() {
  showAddForm.value = false
  editingId.value = null
  formErrors.value = {}
}

function validateForm(): boolean {
  const errors: Record<string, string> = {}
  const name = formData.value.name?.trim() ?? ''
  const url = formData.value.url?.trim() ?? ''
  if (!name) errors.name = '请填写 API 名称'
  if (!url) errors.url = '请填写请求地址'
  else if (!/^https?:\/\//i.test(url)) errors.url = '请求地址需以 http:// 或 https:// 开头'

  const params = formData.value.params ?? []
  const names = params.map((param) => param.name.trim()).filter(Boolean)
  if (params.some((param) => !param.name.trim())) errors.params = '参数名不能为空'
  else if (new Set(names).size !== names.length) errors.params = '参数名不能重复'

  formErrors.value = errors
  return Object.keys(errors).length === 0
}

function saveApi() {
  if (!validateForm()) return
  const isEditing = editingId.value !== null
  const payload: Omit<ApiItem, 'id'> = {
    name: formData.value.name!.trim(),
    url: formData.value.url!.trim(),
    method: formData.value.method ?? 'GET',
    category: formData.value.category?.trim() || '未分类',
    description: formData.value.description?.trim() || '用户自定义 API',
    params: (formData.value.params ?? []).map((param) => ({
      ...param,
      name: param.name.trim(),
      description: param.description.trim(),
    })),
    docsUrl: formData.value.docsUrl?.trim() || undefined,
    auth: formData.value.auth ?? 'none',
    cors: formData.value.cors ?? 'unknown',
    userCreated: true,
    createdAt: new Date().toISOString(),
    pinned: false,
  }

  let saved: ApiItem
  if (editingId.value !== null) {
    const index = userApis.value.findIndex((api) => api.id === editingId.value)
    if (index === -1) return
    saved = {
      ...userApis.value[index],
      ...payload,
      id: editingId.value,
      createdAt: userApis.value[index].createdAt,
      pinned: userApis.value[index].pinned,
    }
    userApis.value[index] = saved
  } else {
    saved = { ...payload, id: crypto.randomUUID() }
    userApis.value.push(saved)
  }

  cancelForm()
  selectApi(saved)
  notify('success', isEditing ? 'API 已更新' : 'API 已添加')
}

async function deleteApi(api: ApiItem) {
  const ok = await confirm(`确定删除自定义 API「${api.name}」吗？`)
  if (!ok) return
  userApis.value = userApis.value.filter((item) => item.id !== api.id)
  recentIds.value = recentIds.value.filter((id) => id !== api.id)
  if (selectedId.value === api.id) closeApi()
  notify('success', 'API 已删除')
}

function togglePin(api: ApiItem) {
  const willPin = !api.pinned
  const userApi = userApis.value.find((item) => item.id === api.id)
  if (userApi) userApi.pinned = !userApi.pinned
  else if (pinnedSystemIds.value.includes(api.id)) {
    pinnedSystemIds.value = pinnedSystemIds.value.filter((id) => id !== api.id)
  } else pinnedSystemIds.value = [...pinnedSystemIds.value, api.id]
  notify('success', willPin ? `已置顶「${api.name}」` : `已取消置顶「${api.name}」`)
}

function addParam() {
  if (!formData.value.params) formData.value.params = []
  formData.value.params.push({
    name: '',
    type: 'string',
    defaultValue: '',
    required: false,
    description: '',
  })
}

function removeParam(index: number) {
  formData.value.params?.splice(index, 1)
}

function addEnvironment() {
  const name = newEnvironmentName.value.trim()
  if (!name) return
  const environment: ApiEnvironment = { id: crypto.randomUUID(), name, variables: [] }
  environments.value.push(environment)
  activeEnvironmentId.value = environment.id
  newEnvironmentName.value = ''
}

function removeEnvironment(id: string) {
  if (environments.value.length <= 1) return
  environments.value = environments.value.filter((item) => item.id !== id)
  if (activeEnvironmentId.value === id) activeEnvironmentId.value = environments.value[0].id
}

function addEnvironmentVariable() {
  activeEnvironment.value?.variables.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
  })
}

function removeEnvironmentVariable(id: string) {
  if (!activeEnvironment.value) return
  activeEnvironment.value.variables = activeEnvironment.value.variables.filter(
    (item) => item.id !== id,
  )
}

function upsertEnvironmentVariable(key: string, value: string, overwrite: boolean) {
  if (!activeEnvironment.value || !key.trim()) return 'skipped'
  const normalized = key.trim()
  const existing = activeEnvironment.value.variables.find((item) => item.key === normalized)
  if (existing) {
    if (!overwrite && existing.value !== value) return 'conflict'
    existing.value = value
    existing.enabled = true
    return 'updated'
  }
  activeEnvironment.value.variables.push({
    id: crypto.randomUUID(),
    key: normalized,
    value,
    enabled: true,
  })
  return 'created'
}

function addCollection() {
  const name = newCollectionName.value.trim()
  if (!name) return
  const colors = ['#667eea', '#0f766e', '#e65f5c', '#d97706', '#2563eb']
  const collection: ApiCollection = {
    id: crypto.randomUUID(),
    name,
    color: colors[collections.value.length % colors.length],
  }
  collections.value.push(collection)
  activeCollectionId.value = collection.id
  newCollectionName.value = ''
  showNewCollectionInput.value = false
}

function selectWorkspaceCollection(id: string) {
  activeCollectionId.value = id
  workspaceStepTab.value = 'request'
  collectionContextMenu.value = null
}

function createWorkspaceCollection() {
  if (!newCollectionName.value.trim())
    newCollectionName.value = `新集合 ${collections.value.length + 1}`
  addCollection()
}

function cancelWorkspaceCollectionCreation() {
  newCollectionName.value = ''
  showNewCollectionInput.value = false
}

function removeUnreferencedWorkspaceApis() {
  const referencedApiIds = new Set(savedRequests.value.map((request) => request.apiId))
  userApis.value = userApis.value.filter(
    (api) => api.catalogVisible !== false || referencedApiIds.has(api.id),
  )
}

function removeCollection(id: string) {
  if (collections.value.length <= 1) return
  collections.value = collections.value.filter((item) => item.id !== id)
  savedRequests.value = savedRequests.value.filter((item) => item.collectionId !== id)
  removeUnreferencedWorkspaceApis()
  if (activeCollectionId.value === id) activeCollectionId.value = collections.value[0].id
}

async function confirmRemoveCollection(id: string) {
  collectionContextMenu.value = null
  if (collections.value.length <= 1) {
    notify('info', '至少保留一个集合')
    return
  }
  const collection = collections.value.find((item) => item.id === id)
  if (!collection) return
  const ok = await confirm(`删除集合「${collection.name}」及其中的全部请求？`)
  if (ok) removeCollection(id)
}

function openCollectionContextMenu(event: MouseEvent, collectionId: string) {
  const width = 180
  const height = 84
  collectionContextMenu.value = {
    collectionId,
    x: Math.min(event.clientX, window.innerWidth - width - 8),
    y: Math.min(event.clientY, window.innerHeight - height - 8),
  }
}

function persistCurrentRequest(asCopy: boolean): SavedRequest | undefined {
  if (!selectedApi.value) return undefined
  const existing = asCopy ? undefined : editingSavedRequest.value
  const name = saveRequestName.value.trim() || existing?.name || selectedApi.value.name
  const saved: SavedRequest = {
    id: existing?.id || crypto.randomUUID(),
    name,
    collectionId: existing?.collectionId || activeCollectionId.value || collections.value[0].id,
    apiId: selectedApi.value.id,
    paramValues: { ...paramValues.value },
    headers: requestHeaders.value.map((item) => ({ ...item })),
    body: requestBody.value,
    bodyMode: requestBodyMode.value,
    formFields: requestFormFields.value.map((field) => ({ ...field })),
    assertions: assertions.value.map((item) => ({ ...item })),
    auth: currentAuthConfig(),
    extractions: extractionRules.value.map((item) => ({ ...item })),
    retryCount: retryCount.value,
    timeoutMs: requestTimeoutMs.value,
    createdAt: existing?.createdAt || new Date().toISOString(),
  }
  savedRequests.value = upsertCollectionRequest(savedRequests.value, saved)
  editingSavedRequestId.value = saved.id
  activeCollectionId.value = saved.collectionId
  saveRequestName.value = saved.name
  notify('success', existing ? `已更新请求「${name}」` : `已保存请求「${name}」`)
  return saved
}

function saveCurrentRequest() {
  persistCurrentRequest(false)
}

function saveCurrentRequestAsCopy() {
  persistCurrentRequest(true)
}

function createSavedRequestFromApi(
  api: ApiItem,
  collectionId = activeCollectionId.value,
  name = api.name,
): SavedRequest {
  return buildSavedRequestFromApi(api, collectionId, name)
}

function appendWorkspaceRequests(requests: SavedRequest[]) {
  if (!requests.length) return
  savedRequests.value = [...savedRequests.value, ...requests]
  selectedWorkspaceRequestId.value = requests[0].id
  workspaceStepTab.value = 'request'
  collectionResults.value = []
  collectionRuntimeVariables.value = []
  showWorkspaceRequestPicker.value = false
}

function openWorkspaceRequestPicker() {
  showWorkspaceRequestPicker.value = true
}

function addCreatedWorkspaceRequest(api: ApiItem, saved = createSavedRequestFromApi(api)) {
  userApis.value.push(api)
  appendWorkspaceRequests([saved])
  notify(
    'success',
    api.catalogVisible === false
      ? '已添加工作区请求「' + api.name + '」'
      : '已添加请求「' + api.name + '」，并保存到 API 目录',
  )
}

function openSavedRequest(saved: SavedRequest) {
  const api = apis.value.find((item) => item.id === saved.apiId)
  if (!api) {
    notify('warning', '原始 API 已不存在')
    return
  }
  activeCollectionId.value = saved.collectionId
  selectApi(api)
  editingSavedRequestId.value = saved.id
  saveRequestName.value = saved.name
  paramValues.value = { ...saved.paramValues }
  requestHeaders.value = saved.headers.map((item) => ({ ...item }))
  requestBody.value = saved.body
  requestBodyMode.value = saved.bodyMode || 'raw'
  requestFormFields.value = (saved.formFields || []).map((field) => ({ ...field }))
  assertions.value = saved.assertions.map((item) => ({ ...item }))
  loadAuthConfig(saved.auth)
  extractionRules.value = (saved.extractions || []).map((item) => ({ ...item }))
  retryCount.value = saved.retryCount || 0
  requestTimeoutMs.value = saved.timeoutMs || REQUEST_TIMEOUT_MS
  showWorkspaceManager.value = false
}

function removeSavedRequest(id: string) {
  savedRequests.value = savedRequests.value.filter((item) => item.id !== id)
  removeUnreferencedWorkspaceApis()
  collectionResults.value = collectionResults.value.filter((item) => item.id !== id)
  if (selectedWorkspaceRequestId.value === id) {
    selectedWorkspaceRequestId.value = activeCollectionRequests.value[0]?.id || null
  }
  if (editingSavedRequestId.value === id) {
    editingSavedRequestId.value = null
    saveRequestName.value = ''
  }
}

function moveSavedRequest(saved: SavedRequest, direction: -1 | 1) {
  const collectionItems = savedRequests.value.filter(
    (item) => item.collectionId === saved.collectionId,
  )
  const position = collectionItems.findIndex((item) => item.id === saved.id)
  const target = collectionItems[position + direction]
  if (!target) return
  const fromIndex = savedRequests.value.findIndex((item) => item.id === saved.id)
  const targetIndex = savedRequests.value.findIndex((item) => item.id === target.id)
  ;[savedRequests.value[fromIndex], savedRequests.value[targetIndex]] = [
    savedRequests.value[targetIndex],
    savedRequests.value[fromIndex],
  ]
}

function dropWorkspaceRequest(target: SavedRequest) {
  const dragged = activeCollectionRequests.value.find(
    (item) => item.id === draggedWorkspaceRequestId.value,
  )
  draggedWorkspaceRequestId.value = null
  if (!dragged || dragged.id === target.id) return

  const fromIndex = savedRequests.value.findIndex((item) => item.id === dragged.id)
  const targetIndex = savedRequests.value.findIndex((item) => item.id === target.id)
  const next = [...savedRequests.value]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(targetIndex, 0, moved)
  savedRequests.value = next
}

function apiForSavedRequest(saved: SavedRequest) {
  return apis.value.find((item) => item.id === saved.apiId)
}

function selectWorkspaceStep(id: string) {
  selectedWorkspaceRequestId.value = id
  workspaceResponseSection.value = 'body'
  workspaceStepTab.value = collectionResults.value.some((item) => item.id === id)
    ? 'response'
    : 'request'
}

function showFinalCollectionResponse() {
  const result = finalCollectionResult.value
  if (!result) return
  selectWorkspaceStep(result.id)
}

function authVariableValues(auth?: AuthConfig) {
  if (!auth || auth.type === 'none') return []
  if (auth.type === 'bearer') return [auth.token]
  if (auth.type === 'api-key') return [auth.name, auth.value]
  return [auth.username, auth.password]
}

function requestVariableReferences(saved: SavedRequest) {
  const api = apiForSavedRequest(saved)
  return findVariableReferences([
    api?.url || '',
    ...Object.values(saved.paramValues),
    ...saved.headers.flatMap((header) => [header.name, header.value]),
    saved.body,
    ...(saved.formFields || [])
      .filter((field) => field.enabled)
      .flatMap((field) => [field.name, field.value, field.filename || '', field.contentType || '']),
    ...authVariableValues(saved.auth),
  ])
}

function connectorVariables(saved: SavedRequest, next?: SavedRequest) {
  if (!next) return []
  const nextInputs = new Set(requestVariableReferences(next))
  return (saved.extractions || []).filter(
    (rule) => rule.enabled && rule.variable && nextInputs.has(rule.variable),
  )
}

function variableSource(saved: SavedRequest, variable: string) {
  const currentIndex = activeCollectionRequests.value.findIndex((item) => item.id === saved.id)
  let source: SavedRequest | undefined
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = activeCollectionRequests.value[index]
    if ((candidate.extractions || []).some((rule) => rule.enabled && rule.variable === variable)) {
      source = candidate
      break
    }
  }
  if (source) return source.name
  if (activeVariables.value.some((item) => item.enabled && item.key === variable)) return '环境'
  return '未定义'
}

function addWorkspaceExtractionRule() {
  const saved = selectedWorkspaceRequest.value
  if (!saved) return
  if (!saved.extractions) saved.extractions = []
  saved.extractions.push({
    id: crypto.randomUUID(),
    path: '$.data.token',
    variable: 'token',
    enabled: true,
  })
}

function removeWorkspaceExtractionRule(id: string) {
  const saved = selectedWorkspaceRequest.value
  if (!saved) return
  saved.extractions = (saved.extractions || []).filter((item) => item.id !== id)
}

function addWorkspaceAssertion() {
  selectedWorkspaceRequest.value?.assertions.push({
    id: crypto.randomUUID(),
    type: 'status',
    expected: '200',
    enabled: true,
  })
}

function removeWorkspaceAssertion(id: string) {
  const saved = selectedWorkspaceRequest.value
  if (!saved) return
  saved.assertions = saved.assertions.filter((item) => item.id !== id)
}

function saveWorkspace() {
  persistWorkspace()
  notify('success', `已保存集合「${activeCollection.value?.name || ''}」`)
}

function createEnvironmentFromWorkspace() {
  newEnvironmentName.value = `环境 ${environments.value.length + 1}`
  addEnvironment()
}

function exportWorkspace() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userApis: userApis.value,
    environments: environments.value,
    collections: collections.value,
    savedRequests: savedRequests.value,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `vuechest-api-workspace-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function importWorkspace(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}')) as {
        version?: number
        userApis?: ApiItem[]
        environments?: ApiEnvironment[]
        collections?: ApiCollection[]
        savedRequests?: SavedRequest[]
      }
      if (payload.version !== 1) throw new Error('不支持的工作区版本')
      if (Array.isArray(payload.userApis)) userApis.value = payload.userApis
      if (Array.isArray(payload.environments) && payload.environments.length) {
        environments.value = payload.environments
        activeEnvironmentId.value = environments.value[0].id
      }
      if (Array.isArray(payload.collections) && payload.collections.length) {
        collections.value = payload.collections
        activeCollectionId.value = collections.value[0].id
      }
      if (Array.isArray(payload.savedRequests)) savedRequests.value = payload.savedRequests
      notify('success', 'API 工作区已导入')
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : '导入失败')
    }
  }
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}

function importApiDefinition(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const { importApiDocument } = await import('./importers')
      const imported = importApiDocument(String(reader.result || ''))
      const collection: ApiCollection = {
        id: crypto.randomUUID(),
        name: imported.name.slice(0, 40),
        color: '#2563eb',
      }
      collections.value.push(collection)
      activeCollectionId.value = collection.id
      for (const request of imported.requests) {
        userApis.value.push(request.api)
        savedRequests.value.push({
          id: crypto.randomUUID(),
          name: request.name,
          collectionId: collection.id,
          apiId: request.api.id,
          paramValues: Object.fromEntries(
            request.api.params.map((param) => [param.name, param.defaultValue]),
          ),
          headers: request.headers,
          body: request.body,
          bodyMode: request.bodyMode,
          formFields: request.formFields,
          assertions: [{ id: crypto.randomUUID(), type: 'status', expected: '200', enabled: true }],
          auth: { type: 'none' },
          extractions: [],
          retryCount: 0,
          timeoutMs: REQUEST_TIMEOUT_MS,
          createdAt: new Date().toISOString(),
        })
      }
      let conflicts = 0
      for (const variable of imported.variables) {
        if (upsertEnvironmentVariable(variable.key, variable.value, false) === 'conflict') {
          conflicts += 1
        }
      }
      notify(
        conflicts ? 'warning' : 'success',
        `已导入 ${imported.requests.length} 个请求${conflicts ? `，跳过 ${conflicts} 个变量冲突` : ''}`,
      )
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : 'API 文档导入失败')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function exportCollectionReport() {
  if (!collectionResults.value.length) return
  const payload = {
    exportedAt: new Date().toISOString(),
    collection: collections.value.find((item) => item.id === activeCollectionId.value)?.name,
    summary: {
      passed: collectionResults.value.filter((item) => item.ok).length,
      total: collectionResults.value.length,
      time: collectionTotalTime.value,
    },
    results: collectionResults.value,
    runtimeVariables: collectionRuntimeVariables.value,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `api-collection-report-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function clearHistory() {
  if (!requestHistory.value.length) return
  const ok = await confirm('确定清空全部请求历史吗？')
  if (ok) requestHistory.value = []
}

function openHistoryItem(item: RequestHistoryItem) {
  const api = apis.value.find((candidate) => candidate.id === item.apiId)
  if (api) selectApi(api)
}

function formatHistoryTime(value: string): string {
  const date = new Date(value)
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000)
  if (Math.abs(diffMinutes) < 1) return '刚刚'
  if (Math.abs(diffMinutes) < 60)
    return new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(diffMinutes, 'minute')
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onBeforeUnmount(() => {
  abortRequest()
  if (response.value?.imageUrl) URL.revokeObjectURL(response.value.imageUrl)
})
</script>

<template>
  <div class="api-workbench">
    <header class="topbar">
      <div class="topbar-leading">
        <button
          class="icon-button back-button"
          type="button"
          aria-label="返回首页"
          @click="router.push('/')"
        >
          <ArrowLeft :size="19" />
        </button>
        <div class="topbar-title">
          <strong>API 工作台</strong>
          <span>接口调试与流程编排</span>
        </div>
      </div>

      <div class="topbar-actions">
        <div class="environment-switcher" title="当前请求环境">
          <span>环境</span>
          <CustomSelect
            v-model="activeEnvironmentId"
            :options="environmentOptions"
            size="sm"
            width="116px"
          />
        </div>
        <button
          class="workspace-entry"
          type="button"
          title="打开工作区"
          @click="showWorkspaceManager = true"
        >
          <span class="workspace-entry-icon"><Workflow :size="17" /></span>
          <span>
            <strong>工作区</strong>
            <small>{{ collections.length }} 个集合 · {{ savedRequests.length }} 个请求</small>
          </span>
          <ArrowRight :size="15" />
        </button>
        <button
          class="toolbar-action import-action"
          type="button"
          title="导入 OpenAPI / Postman"
          @click="definitionFileRef?.click()"
        >
          <Upload :size="16" />
          <span>导入定义</span>
        </button>
        <input
          ref="definitionFileRef"
          type="file"
          accept="application/json,.json,.yaml,.yml"
          hidden
          @change="importApiDefinition"
        />
        <button class="toolbar-primary" type="button" title="新建 API" @click="showAddFormPanel">
          <Plus :size="16" />
          <span>新建 API</span>
        </button>
      </div>
    </header>

    <main class="api-shell">
      <aside class="catalog-panel" aria-label="API 目录">
        <div class="catalog-heading">
          <div>
            <h2>接口目录</h2>
          </div>
          <span class="catalog-count">{{ filteredApis.length }}</span>
        </div>

        <label class="search-box">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input v-model="searchQuery" type="search" placeholder="搜索名称、用途或 URL" />
          <kbd>⌘ K</kbd>
        </label>

        <div class="scope-tabs" role="group" aria-label="目录筛选">
          <button
            :class="{ active: catalogScope === 'all' }"
            :aria-pressed="catalogScope === 'all'"
            type="button"
            @click="setScope('all')"
          >
            全部
          </button>
          <button
            :class="{ active: catalogScope === 'featured' }"
            :aria-pressed="catalogScope === 'featured'"
            type="button"
            @click="setScope('featured')"
          >
            推荐
          </button>
          <button
            :class="{ active: catalogScope === 'pinned' }"
            :aria-pressed="catalogScope === 'pinned'"
            type="button"
            @click="setScope('pinned')"
          >
            置顶
          </button>
          <button
            :class="{ active: catalogScope === 'recent' }"
            :aria-pressed="catalogScope === 'recent'"
            type="button"
            @click="setScope('recent')"
          >
            最近
          </button>
        </div>

        <div class="category-filter">
          <CustomSelect
            v-model="selectedCategory"
            :options="categoryOptions"
            searchable
            size="sm"
            block
          />
        </div>

        <div class="catalog-list vc-scrollbar vc-scrollbar--thin">
          <div v-if="isCatalogLoading" class="catalog-loading" aria-label="正在载入 API">
            <span v-for="index in 6" :key="index"></span>
          </div>

          <div
            v-for="api in filteredApis"
            v-else
            :key="api.id"
            class="catalog-item"
            :class="{ active: selectedApi?.id === api.id }"
            role="button"
            tabindex="0"
            @click="selectApi(api)"
            @keydown.enter.prevent="selectApi(api)"
            @keydown.space.prevent="selectApi(api)"
          >
            <span class="method-dot" :class="api.method.toLowerCase()">{{ api.method }}</span>
            <span class="catalog-item-copy">
              <span class="catalog-item-title"
                ><strong>{{ api.name }}</strong
                ><i v-if="api.featured" title="精选并核验">✦</i></span
              >
              <small>{{ api.category }} · {{ api.params.length }} 个参数</small>
            </span>
            <button
              class="catalog-pin-button"
              :class="{ active: api.pinned }"
              type="button"
              :aria-label="api.pinned ? `取消置顶 ${api.name}` : `置顶 ${api.name}`"
              :title="api.pinned ? '取消置顶' : '置顶'"
              @click.stop="togglePin(api)"
            >
              {{ api.pinned ? '★' : '☆' }}
            </button>
            <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>

          <EmptyState
            v-if="!isCatalogLoading && filteredApis.length === 0"
            title="没有匹配的 API"
            description="换个关键词、分类或筛选条件试试"
          />
        </div>

        <div class="catalog-footer">
          <span><i></i> {{ featuredApis.length }} 个精选接口已核验</span>
          <button type="button" @click="showAddFormPanel">管理自定义 API</button>
        </div>
      </aside>

      <section class="workspace-panel">
        <div v-if="!selectedApi && !showAddForm" class="overview-screen">
          <section class="stats-strip" aria-label="API 目录统计">
            <div>
              <span>接口总数</span><strong>{{ catalogApis.length }}</strong
              ><small>系统 + 自定义</small>
            </div>
            <div>
              <span>覆盖分类</span><strong>{{ categories.length }}</strong
              ><small>按使用场景整理</small>
            </div>
            <div>
              <span>我的置顶</span><strong>{{ pinnedCount }}</strong
              ><small>常用接口快捷访问</small>
            </div>
            <div>
              <span>请求记录</span><strong>{{ requestHistory.length }}</strong
              ><small>本机保存最近 25 条</small>
            </div>
          </section>

          <section class="overview-section featured-section">
            <div class="section-heading">
              <div>
                <h2>本周实用 API</h2>
              </div>
              <p>来自官方文档，并实测 HTTPS、响应状态与浏览器 CORS。</p>
            </div>
            <div class="featured-grid">
              <button
                v-for="api in featuredApis"
                :key="api.id"
                class="featured-card"
                type="button"
                @click="selectApi(api)"
              >
                <span class="featured-topline"
                  ><span class="method-chip" :class="api.method.toLowerCase()">{{
                    api.method
                  }}</span
                  ><span class="verified-chip">✓ 已核验</span></span
                >
                <strong>{{ api.name }}</strong>
                <p>{{ api.description }}</p>
                <span class="featured-meta"
                  ><span>{{ api.category }}</span
                  ><span>{{ accessFor(api).authLabel }}</span
                  ><b>打开 →</b></span
                >
              </button>
            </div>
          </section>

          <section class="overview-section history-section">
            <div class="section-heading inline-heading">
              <div>
                <h2>最近请求</h2>
              </div>
              <button v-if="requestHistory.length" type="button" @click="clearHistory">
                清空记录
              </button>
            </div>
            <div v-if="requestHistory.length" class="history-list">
              <button
                v-for="item in requestHistory.slice(0, 6)"
                :key="item.id"
                type="button"
                @click="openHistoryItem(item)"
              >
                <span class="history-status" :class="item.ok ? 'success' : 'danger'"
                  ><i></i>{{ item.status ?? 'ERR' }}</span
                >
                <span
                  ><strong>{{ item.apiName }}</strong
                  ><small>{{ item.method }} · {{ formatHistoryTime(item.createdAt) }}</small></span
                >
                <b>{{ item.time }} ms</b
                ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>
            <div v-else class="history-empty">
              <span>↗</span>
              <div>
                <strong>还没有请求记录</strong>
                <p>运行一次 API 后，状态与耗时会保存在这里。</p>
              </div>
            </div>
          </section>

          <section v-if="savedRequests.length" class="overview-section saved-section">
            <div class="section-heading inline-heading">
              <div><h2>已保存请求</h2></div>
              <button type="button" @click="showWorkspaceManager = true">管理工作区</button>
            </div>
            <div class="saved-request-grid">
              <button
                v-for="saved in savedRequests.slice(0, 6)"
                :key="saved.id"
                type="button"
                @click="openSavedRequest(saved)"
              >
                <span
                  class="saved-color"
                  :style="{
                    background: collections.find((item) => item.id === saved.collectionId)?.color,
                  }"
                ></span>
                <span
                  ><strong>{{ saved.name }}</strong
                  ><small>{{
                    collections.find((item) => item.id === saved.collectionId)?.name || '未分类'
                  }}</small></span
                >
                <b>打开 →</b>
              </button>
            </div>
          </section>
        </div>

        <div v-else-if="showAddForm" class="editor-screen">
          <div class="editor-heading">
            <div>
              <button type="button" @click="cancelForm">← 返回工作台</button>
              <h1>{{ editingId === null ? '添加自定义 API' : '编辑自定义 API' }}</h1>
              <p>
                把常用接口保存到本机目录。参数既可以放进 URL
                占位符，也可以在运行时自动追加为查询参数。
              </p>
            </div>
            <span class="editor-mark">{ }</span>
          </div>

          <div class="editor-grid">
            <section class="editor-card">
              <div class="card-heading">
                <span>01</span>
                <div>
                  <h2>基础信息</h2>
                  <p>定义接口的请求方式与用途</p>
                </div>
              </div>
              <div class="field-grid two-columns">
                <label class="field"
                  ><span>API 名称 <b>*</b></span
                  ><input
                    v-model="formData.name"
                    type="text"
                    placeholder="例如：项目版本查询"
                  /><small v-if="formErrors.name" class="field-error">{{
                    formErrors.name
                  }}</small></label
                >
                <label class="field"
                  ><span>分类</span
                  ><input v-model="formData.category" type="text" placeholder="例如：开发"
                /></label>
              </div>
              <div class="field method-url-field">
                <span>请求地址 <b>*</b></span>
                <div>
                  <CustomSelect
                    v-model="formData.method"
                    :options="methodOptions"
                    size="sm"
                  /><input
                    v-model="formData.url"
                    type="text"
                    placeholder="https://api.example.com/users/{id}"
                  />
                </div>
                <small v-if="formErrors.url" class="field-error">{{ formErrors.url }}</small>
              </div>
              <label class="field"
                ><span>用途说明</span
                ><textarea
                  v-model="formData.description"
                  rows="3"
                  placeholder="这个接口解决什么问题，会返回什么数据？"
                ></textarea>
              </label>
              <label class="field"
                ><span>官方文档</span
                ><input
                  v-model="formData.docsUrl"
                  type="url"
                  placeholder="https://docs.example.com/api"
              /></label>
              <div class="field-grid two-columns">
                <label class="field"
                  ><span>鉴权方式</span
                  ><CustomSelect v-model="formData.auth" :options="authOptions" size="sm" block
                /></label>
                <label class="field"
                  ><span>浏览器跨域</span
                  ><CustomSelect v-model="formData.cors" :options="corsOptions" size="sm" block
                /></label>
              </div>
            </section>

            <section class="editor-card params-editor-card">
              <div class="card-heading with-action">
                <span>02</span>
                <div>
                  <h2>参数定义</h2>
                  <p>使用 {name} 可把参数嵌入 URL</p>
                </div>
                <button type="button" @click="addParam">＋ 添加参数</button>
              </div>
              <p v-if="formErrors.params" class="form-banner error">{{ formErrors.params }}</p>
              <div v-if="formData.params?.length" class="form-params-list">
                <div v-for="(param, index) in formData.params" :key="index" class="form-param-row">
                  <div class="param-index">{{ String(index + 1).padStart(2, '0') }}</div>
                  <div class="param-fields">
                    <input v-model="param.name" type="text" placeholder="参数名" /><CustomSelect
                      v-model="param.type"
                      :options="typeOptions"
                      size="sm"
                      block
                    /><input v-model="param.defaultValue" type="text" placeholder="默认值" /><input
                      v-model="param.description"
                      type="text"
                      placeholder="参数说明"
                    />
                  </div>
                  <label class="required-toggle"
                    ><input v-model="param.required" type="checkbox" /><span></span>必填</label
                  >
                  <button
                    class="remove-row"
                    type="button"
                    aria-label="删除参数"
                    @click="removeParam(index)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div v-else class="params-empty">
                <span>＋</span><strong>暂无参数</strong>
                <p>没有参数的接口可以直接保存；需要动态配置时再添加。</p>
                <button type="button" @click="addParam">添加第一个参数</button>
              </div>
            </section>
          </div>

          <div class="editor-actions">
            <button class="secondary-button" type="button" @click="cancelForm">取消</button
            ><button class="primary-button" type="button" @click="saveApi">
              {{ editingId === null ? '保存并开始调试' : '保存修改' }}
            </button>
          </div>
        </div>

        <div v-else-if="selectedApi" class="request-screen">
          <header class="endpoint-header">
            <div class="endpoint-heading">
              <button type="button" class="back-to-overview" @click="closeApi">← API 概览</button>
              <div class="endpoint-title-line">
                <span class="method-chip large" :class="selectedApi.method.toLowerCase()">{{
                  selectedApi.method
                }}</span>
                <h1>{{ selectedApi.name }}</h1>
                <button
                  type="button"
                  class="pin-button"
                  :class="{ active: selectedApi.pinned }"
                  @click="togglePin(selectedApi)"
                >
                  <span aria-hidden="true">{{ selectedApi.pinned ? '★' : '☆' }}</span>
                  {{ selectedApi.pinned ? '已置顶' : '置顶' }}
                </button>
              </div>
              <p>{{ selectedApi.description }}</p>
              <div class="endpoint-tags">
                <span>{{ selectedApi.category }}</span
                ><span :class="{ positive: accessFor(selectedApi).authLabel === '无需 Key' }">{{
                  accessFor(selectedApi).authLabel
                }}</span
                ><span :class="{ positive: accessFor(selectedApi).corsLabel === '支持 CORS' }">{{
                  accessFor(selectedApi).corsLabel
                }}</span
                ><span v-if="accessFor(selectedApi).verified" class="verified"
                  >✓ 官方来源已核验</span
                >
              </div>
            </div>
            <div class="endpoint-actions">
              <button type="button" @click="saveCurrentRequest">
                {{
                  editingSavedRequest
                    ? `更新「${editingSavedRequest.name}」`
                    : `保存到「${activeCollection?.name || '默认集合'}」`
                }}
              </button>
              <button v-if="editingSavedRequest" type="button" @click="saveCurrentRequestAsCopy">
                另存为副本
              </button>
              <a
                v-if="selectedApi.docsUrl"
                :href="selectedApi.docsUrl"
                target="_blank"
                rel="noreferrer"
                >官方文档 ↗</a
              ><button v-if="selectedApi.userCreated" type="button" @click="editApi(selectedApi)">
                编辑</button
              ><button
                v-if="selectedApi.userCreated"
                class="danger-text"
                type="button"
                @click="deleteApi(selectedApi)"
              >
                删除
              </button>
            </div>
          </header>

          <div class="request-url-bar">
            <span class="method-label" :class="selectedApi.method.toLowerCase()">{{
              selectedApi.method
            }}</span
            ><code>{{ currentUrl }}</code
            ><CopyButton :text="currentUrl" label="复制 URL" :icon="false" variant="ghost" />
          </div>

          <div class="runner-grid">
            <RequestEditor
              :selected-api="selectedApi"
              :curl-command="curlCommand"
              :is-loading="isLoading"
              :validation-message="validationMessage"
              v-model:paramValues="paramValues"
              v-model:requestHeaders="requestHeaders"
              v-model:requestBody="requestBody"
              v-model:requestBodyMode="requestBodyMode"
              v-model:requestFormFields="requestFormFields"
              v-model:requestFiles="requestFiles"
              v-model:requestTab="requestTab"
              v-model:assertions="assertions"
              v-model:authDraft="authDraft"
              v-model:extractionRules="extractionRules"
              v-model:retryCount="retryCount"
              v-model:requestTimeoutMs="requestTimeoutMs"
              @send="executeApi"
              @cancel="abortRequest"
              @remove-assertion="
                assertionResults = assertionResults.filter((item) => item.id !== $event)
              "
            />

            <ResponsePanel
              v-model:tab="responseTab"
              :response="response"
              :is-loading="isLoading"
              :error="error"
              :assertion-results="assertionResults"
              @retry="executeApi"
            />
          </div>

          <section class="request-history-drawer">
            <div class="history-drawer-heading">
              <div>
                <h2>本地请求记录</h2>
              </div>
              <button v-if="requestHistory.length" type="button" @click="clearHistory">清空</button>
            </div>
            <div v-if="requestHistory.length" class="compact-history">
              <button
                v-for="item in requestHistory.slice(0, 8)"
                :key="item.id"
                type="button"
                @click="openHistoryItem(item)"
              >
                <span class="history-status" :class="item.ok ? 'success' : 'danger'"
                  ><i></i>{{ item.status ?? 'ERR' }}</span
                ><strong>{{ item.apiName }}</strong
                ><small>{{ item.method }}</small
                ><span>{{ item.time }} ms</span><time>{{ formatHistoryTime(item.createdAt) }}</time>
              </button>
            </div>
            <p v-else class="compact-history-empty">
              运行结果会自动记录在本机，且不会保存 Header 或 Body 中的敏感内容。
            </p>
          </section>
        </div>
      </section>
    </main>

    <Modal
      v-model:open="showWorkspaceManager"
      class="collection-workspace-modal"
      width="min(1440px, calc(100vw - 32px))"
      :show-close="false"
      :style="{
        '--vc-modal-body-pad': '0',
        '--vc-modal-header-pad': '0',
        '--vc-modal-max-h': 'calc(100vh - 32px)',
        '--vc-modal-radius': '14px',
      }"
    >
      <template #header>
        <div class="flow-workspace-topbar">
          <div class="flow-brand">
            <span><Workflow :size="18" /></span>
            <strong>API LAB</strong>
          </div>
          <div v-if="activeCollection" class="flow-collection-title">
            <input v-model="activeCollection.name" aria-label="集合名称" />
            <span>{{ activeCollectionRequests.length }} 个请求</span>
            <button
              v-if="collections.length > 1"
              type="button"
              aria-label="删除当前集合"
              title="删除当前集合"
              @click="confirmRemoveCollection(activeCollectionId)"
            >
              <Trash2 :size="16" />
            </button>
          </div>
          <div class="flow-topbar-actions">
            <CustomSelect
              v-model="activeEnvironmentId"
              :options="environmentOptions"
              size="sm"
              width="150px"
            />
            <button class="flow-secondary-action" type="button" @click="saveWorkspace">
              <Save :size="15" /> 保存
            </button>
            <button
              v-if="!collectionRunning"
              class="flow-run-action"
              type="button"
              :disabled="collectionRunning || !activeCollectionRequests.length"
              @click="runActiveCollection"
            >
              <Play :size="15" fill="currentColor" />
              运行流程
            </button>
            <button
              v-if="collectionRunning"
              type="button"
              class="flow-run-action"
              @click="stopCollection"
            >
              停止运行
            </button>
            <button
              class="flow-close-action"
              type="button"
              aria-label="关闭集合工作区"
              @click="showWorkspaceManager = false"
            >
              <X :size="19" />
            </button>
          </div>
        </div>
      </template>

      <div class="flow-workspace-shell">
        <CollectionSidebar
          v-model:show-new="showNewCollectionInput"
          v-model:name="newCollectionName"
          :collections="collections"
          :saved-requests="savedRequests"
          :active-collection-id="activeCollectionId"
          @select="selectWorkspaceCollection"
          @context="openCollectionContextMenu"
          @create="createWorkspaceCollection"
          @cancel="cancelWorkspaceCollectionCreation"
          @export="exportWorkspace"
          @import="importWorkspace"
        />

        <main class="flow-editor-main">
          <header class="flow-editor-heading">
            <div>
              <strong>请求流程</strong>
              <span v-if="collectionResults.length">
                {{ collectionResults.filter((item) => item.ok).length }}/{{
                  collectionResults.length
                }}
                通过
              </span>
            </div>
            <div>
              <button v-if="collectionResults.length" type="button" @click="exportCollectionReport">
                <Download :size="14" /> 报告
              </button>
              <button type="button" @click="openWorkspaceRequestPicker()">
                <Plus :size="14" /> 添加请求
              </button>
            </div>
          </header>

          <section class="flow-canvas" aria-label="集合请求流程">
            <div v-if="activeCollectionRequests.length" class="flow-stage-track">
              <template v-for="(saved, index) in activeCollectionRequests" :key="saved.id">
                <article
                  class="flow-stage"
                  :class="{
                    selected: saved.id === selectedWorkspaceRequestId,
                    running: saved.id === runningRequestId,
                    failed: collectionResults.find((item) => item.id === saved.id && !item.ok),
                  }"
                  draggable="true"
                  @click="selectWorkspaceStep(saved.id)"
                  @dragstart="draggedWorkspaceRequestId = saved.id"
                  @dragend="draggedWorkspaceRequestId = null"
                  @dragover.prevent
                  @drop.prevent="dropWorkspaceRequest(saved)"
                >
                  <header>
                    <button
                      class="flow-drag-handle"
                      type="button"
                      :aria-label="'拖动请求 ' + saved.name"
                      @keydown.up.prevent="moveSavedRequest(saved, -1)"
                      @keydown.down.prevent="moveSavedRequest(saved, 1)"
                    >
                      <GripVertical :size="16" />
                    </button>
                    <span class="flow-stage-number">{{ index + 1 }}</span>
                    <span
                      class="method-badge"
                      :class="
                        'method-' + (apiForSavedRequest(saved)?.method.toLowerCase() || 'get')
                      "
                    >
                      {{ apiForSavedRequest(saved)?.method || 'API' }}
                    </span>
                    <strong>{{ saved.name }}</strong>
                    <span
                      v-if="collectionResults.find((item) => item.id === saved.id)"
                      class="flow-stage-status"
                      :class="{
                        success: collectionResults.find((item) => item.id === saved.id)?.ok,
                      }"
                    >
                      {{ collectionResults.find((item) => item.id === saved.id)?.status || 'ERR' }}
                      · {{ collectionResults.find((item) => item.id === saved.id)?.time }}ms
                    </span>
                    <button
                      type="button"
                      :aria-label="'删除请求 ' + saved.name"
                      @click.stop="removeSavedRequest(saved.id)"
                    >
                      <Trash2 :size="14" />
                    </button>
                  </header>
                  <code>{{ apiForSavedRequest(saved)?.url || '原始 API 已不存在' }}</code>
                  <div class="flow-stage-variables">
                    <div>
                      <span>输入</span>
                      <template v-if="requestVariableReferences(saved).length">
                        <b v-for="variable in requestVariableReferences(saved)" :key="variable">
                          <Variable :size="12" />{{ variable }}
                          <small>{{ variableSource(saved, variable) }}</small>
                        </b>
                      </template>
                      <em v-else>—</em>
                    </div>
                    <div>
                      <span>输出</span>
                      <template
                        v-if="(saved.extractions || []).filter((item) => item.enabled).length"
                      >
                        <b
                          v-for="rule in (saved.extractions || []).filter((item) => item.enabled)"
                          :key="rule.id"
                          class="output"
                        >
                          <Braces :size="12" />{{ rule.variable || '未命名' }}
                        </b>
                      </template>
                      <em v-else>—</em>
                    </div>
                  </div>
                </article>

                <div v-if="index < activeCollectionRequests.length - 1" class="flow-connector">
                  <span
                    v-for="rule in connectorVariables(saved, activeCollectionRequests[index + 1])"
                    :key="rule.id"
                  >
                    {{ rule.variable }}
                  </span>
                  <ArrowRight :size="18" />
                </div>
              </template>
            </div>
            <div v-else class="flow-empty-state">
              <Workflow :size="30" />
              <strong>这个集合还没有请求</strong>
              <button type="button" @click="openWorkspaceRequestPicker()">
                <Plus :size="15" /> 添加请求
              </button>
            </div>
          </section>

          <section v-if="selectedWorkspaceRequest" class="flow-step-inspector">
            <header>
              <div>
                <span
                  class="method-badge"
                  :class="'method-' + (selectedWorkspaceApi?.method.toLowerCase() || 'get')"
                >
                  {{ selectedWorkspaceApi?.method || 'API' }}
                </span>
                <input v-model="selectedWorkspaceRequest.name" aria-label="请求步骤名称" />
              </div>
              <button type="button" @click="openSavedRequest(selectedWorkspaceRequest)">
                <ExternalLink :size="14" /> 完整编辑
              </button>
            </header>
            <nav class="flow-inspector-tabs" aria-label="请求步骤详情">
              <button
                type="button"
                :class="{ active: workspaceStepTab === 'request' }"
                @click="workspaceStepTab = 'request'"
              >
                请求
              </button>
              <button
                type="button"
                :class="{ active: workspaceStepTab === 'response' }"
                @click="workspaceStepTab = 'response'"
              >
                响应
                <span v-if="selectedWorkspaceResult">{{
                  selectedWorkspaceResult.status || 'ERR'
                }}</span>
              </button>
              <button
                type="button"
                :class="{ active: workspaceStepTab === 'extract' }"
                @click="workspaceStepTab = 'extract'"
              >
                提取 <span>{{ selectedWorkspaceRequest.extractions?.length || 0 }}</span>
              </button>
              <button
                type="button"
                :class="{ active: workspaceStepTab === 'assertions' }"
                @click="workspaceStepTab = 'assertions'"
              >
                断言 <span>{{ selectedWorkspaceRequest.assertions.length }}</span>
              </button>
            </nav>

            <div v-if="workspaceStepTab === 'request'" class="flow-request-summary">
              <div>
                <span>实际 URL</span
                ><code>{{
                  selectedWorkspaceResult?.request.url || selectedWorkspaceApi?.url
                }}</code>
              </div>
              <div>
                <span>使用变量</span>
                <b
                  v-for="variable in requestVariableReferences(selectedWorkspaceRequest)"
                  :key="variable"
                >
                  <span v-pre>{{</span>{{ variable }}<span v-pre>}}</span>
                  <small>来自{{ variableSource(selectedWorkspaceRequest, variable) }}</small>
                </b>
                <em v-if="!requestVariableReferences(selectedWorkspaceRequest).length">无</em>
              </div>
              <div v-if="selectedWorkspaceResult">
                <span>请求头</span>
                <div
                  v-if="Object.keys(selectedWorkspaceResult.request.headers).length"
                  class="flow-inline-pairs"
                >
                  <code v-for="(value, name) in selectedWorkspaceResult.request.headers" :key="name"
                    ><strong>{{ name }}</strong
                    >{{ value }}</code
                  >
                </div>
                <em v-else>无</em>
              </div>
              <div v-if="selectedWorkspaceResult?.request.body" class="flow-request-body-row">
                <span>请求体</span>
                <pre><code>{{ selectedWorkspaceResult.request.body }}</code></pre>
              </div>
              <p v-if="!selectedWorkspaceResult" class="flow-config-hint">
                当前显示请求模板。运行流程后会显示变量替换和鉴权处理后的实际请求。
              </p>
            </div>

            <div v-else-if="workspaceStepTab === 'response'" class="flow-response-result">
              <div v-if="selectedWorkspaceResult" class="flow-result-metrics">
                <span
                  class="status-pill"
                  :class="
                    selectedWorkspaceResult.status
                      ? getStatusTone(selectedWorkspaceResult.status)
                      : 'danger'
                  "
                >
                  <i></i>{{ selectedWorkspaceResult.status || 'ERR' }}
                  {{ selectedWorkspaceResult.statusText || '' }}
                </span>
                <span>{{ selectedWorkspaceResult.time }} ms</span>
                <span>{{ formatBytes(selectedWorkspaceResult.response?.size) }}</span>
                <span>
                  断言 {{ selectedWorkspaceResult.testsPassed }}/{{
                    selectedWorkspaceResult.testsTotal
                  }}
                </span>
              </div>

              <div v-if="selectedWorkspaceResult?.error" class="flow-result-error">
                <span>!</span>
                <div>
                  <strong>请求没有完成</strong>
                  <p>{{ selectedWorkspaceResult.error }}</p>
                </div>
              </div>

              <template v-else-if="selectedWorkspaceResult?.response">
                <div class="flow-result-toolbar">
                  <div>
                    <button
                      type="button"
                      :class="{ active: workspaceResponseSection === 'body' }"
                      @click="workspaceResponseSection = 'body'"
                    >
                      响应体
                    </button>
                    <button
                      type="button"
                      :class="{ active: workspaceResponseSection === 'headers' }"
                      @click="workspaceResponseSection = 'headers'"
                    >
                      Headers
                      <span>{{
                        Object.keys(selectedWorkspaceResult.response.headers).length
                      }}</span>
                    </button>
                  </div>
                  <CopyButton
                    v-if="workspaceResponseSection === 'body' && selectedWorkspaceResponseBody"
                    :text="selectedWorkspaceResponseBody"
                    label="复制响应"
                    :icon="false"
                    variant="mini"
                  />
                </div>
                <div v-if="selectedWorkspaceResult.response.truncated" class="flow-result-warning">
                  响应超过 512 KB，本面板和报告仅保留前 512 KB；断言与提取仍基于完整响应执行。
                </div>
                <pre
                  v-if="workspaceResponseSection === 'body' && selectedWorkspaceResponseBody"
                  class="flow-response-body"
                ><code>{{ selectedWorkspaceResponseBody }}</code></pre>
                <div
                  v-else-if="workspaceResponseSection === 'headers'"
                  class="flow-response-headers"
                >
                  <div
                    v-for="(value, name) in selectedWorkspaceResult.response.headers"
                    :key="name"
                  >
                    <strong>{{ name }}</strong
                    ><code>{{ value }}</code>
                  </div>
                  <p v-if="!Object.keys(selectedWorkspaceResult.response.headers).length">
                    响应没有返回 Header。
                  </p>
                </div>
                <div v-else class="flow-result-empty">响应体为空</div>
              </template>

              <div v-else class="flow-result-placeholder">
                <Workflow :size="24" />
                <div>
                  <strong>还没有运行结果</strong>
                  <p>点击“运行流程”后，这里会显示该步骤的真实响应。</p>
                </div>
              </div>
            </div>

            <div v-else-if="workspaceStepTab === 'extract'" class="flow-rule-editor">
              <div class="flow-rule-head">
                <span>启用</span><span>响应字段</span><span></span><span>本次运行变量</span
                ><span></span>
              </div>
              <div
                v-for="rule in selectedWorkspaceRequest.extractions || []"
                :key="rule.id"
                class="flow-rule-row"
              >
                <label class="row-check">
                  <input v-model="rule.enabled" type="checkbox" /><span></span>
                </label>
                <input
                  v-model="rule.path"
                  type="text"
                  aria-label="响应字段"
                  placeholder="$.data.token"
                />
                <ArrowRight :size="16" />
                <input
                  v-model="rule.variable"
                  type="text"
                  aria-label="变量名"
                  placeholder="token"
                />
                <button
                  type="button"
                  aria-label="删除提取规则"
                  @click="removeWorkspaceExtractionRule(rule.id)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
              <button class="flow-add-rule" type="button" @click="addWorkspaceExtractionRule">
                <Plus :size="15" /> 添加提取规则
              </button>
              <section v-if="selectedWorkspaceResult" class="flow-rule-run-results">
                <header>
                  <strong>本次提取</strong>
                  <span
                    >{{
                      selectedWorkspaceResult.extractions.filter((item) => item.passed).length
                    }}/{{ selectedWorkspaceResult.extractions.length }} 成功</span
                  >
                </header>
                <div
                  v-for="item in selectedWorkspaceResult.extractions"
                  :key="item.id"
                  :class="item.passed ? 'passed' : 'failed'"
                >
                  <span>{{ item.passed ? '✓' : '×' }}</span>
                  <div>
                    <strong>{{ item.variable || '未命名变量' }}</strong>
                    <small>{{ item.path || '未填写响应字段' }} · {{ item.detail }}</small>
                  </div>
                  <code v-if="item.passed">{{ item.value }}</code>
                </div>
                <p v-if="!selectedWorkspaceResult.extractions.length">没有启用的提取规则。</p>
              </section>
            </div>

            <div v-else class="flow-rule-editor assertion-mode">
              <div class="flow-rule-head assertion">
                <span>启用</span><span>断言</span><span>期望值</span><span></span>
              </div>
              <div
                v-for="rule in selectedWorkspaceRequest.assertions"
                :key="rule.id"
                class="flow-rule-row assertion"
              >
                <label class="row-check">
                  <input v-model="rule.enabled" type="checkbox" /><span></span>
                </label>
                <CustomSelect v-model="rule.type" :options="assertionTypeOptions" size="sm" block />
                <input v-model="rule.expected" type="text" aria-label="断言期望值" />
                <button
                  type="button"
                  aria-label="删除断言"
                  @click="removeWorkspaceAssertion(rule.id)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
              <button class="flow-add-rule" type="button" @click="addWorkspaceAssertion">
                <Plus :size="15" /> 添加断言
              </button>
              <section v-if="selectedWorkspaceResult" class="flow-rule-run-results">
                <header>
                  <strong>本次断言</strong>
                  <span
                    >{{ selectedWorkspaceResult.testsPassed }}/{{
                      selectedWorkspaceResult.testsTotal
                    }}
                    通过</span
                  >
                </header>
                <div
                  v-for="item in selectedWorkspaceResult.assertions"
                  :key="item.id"
                  :class="item.passed ? 'passed' : 'failed'"
                >
                  <span>{{ item.passed ? '✓' : '×' }}</span>
                  <div>
                    <strong>{{ item.label }}</strong
                    ><small>{{ item.detail }}</small>
                  </div>
                </div>
                <p v-if="!selectedWorkspaceResult.assertions.length">没有启用的断言。</p>
              </section>
            </div>
          </section>
        </main>

        <aside class="flow-variable-sidebar">
          <section v-if="collectionResults.length" class="flow-run-overview">
            <header>
              <div><Check :size="15" /><strong>运行结果</strong></div>
              <span
                :class="{
                  failed: collectionResults.some((item) => !item.ok),
                }"
                >{{ collectionResults.filter((item) => item.ok).length }}/{{
                  collectionResults.length
                }}</span
              >
            </header>
            <div class="flow-overview-metrics">
              <div>
                <span>总耗时</span><strong>{{ collectionTotalTime }} ms</strong>
              </div>
              <div>
                <span>最终状态</span
                ><strong :class="{ failed: !finalCollectionResult?.ok }">{{
                  finalCollectionResult?.status || 'ERR'
                }}</strong>
              </div>
            </div>
            <button
              type="button"
              class="flow-final-result-button"
              @click="showFinalCollectionResponse"
            >
              查看最终响应 <ArrowRight :size="14" />
            </button>
          </section>
          <section>
            <header>
              <div><Variable :size="15" /><strong>本次运行</strong></div>
              <span>{{ workspaceRuntimeVariables.length }}</span>
            </header>
            <div v-if="workspaceRuntimeVariables.length" class="flow-runtime-list">
              <div v-for="variable in workspaceRuntimeVariables" :key="variable.key">
                <span>V</span>
                <div>
                  <strong>{{ variable.key }}</strong>
                  <small>来自 {{ variable.sourceRequestName }}</small>
                  <code>{{ variable.value || '运行后可见' }}</code>
                </div>
              </div>
            </div>
            <p v-else class="flow-variable-empty">请求输出会出现在这里</p>
          </section>

          <section class="flow-environment-section">
            <header>
              <div><Braces :size="15" /><strong>环境</strong></div>
              <div>
                <button type="button" aria-label="新建环境" @click="createEnvironmentFromWorkspace">
                  <Plus :size="14" />
                </button>
                <button
                  v-if="environments.length > 1"
                  type="button"
                  aria-label="删除当前环境"
                  @click="removeEnvironment(activeEnvironmentId)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </header>
            <div class="flow-environment-list">
              <div v-for="variable in activeEnvironment?.variables || []" :key="variable.id">
                <label class="row-check">
                  <input v-model="variable.enabled" type="checkbox" /><span></span>
                </label>
                <input
                  v-model="variable.key"
                  type="text"
                  aria-label="环境变量名"
                  placeholder="baseUrl"
                />
                <input
                  v-model="variable.value"
                  type="text"
                  aria-label="环境变量值"
                  placeholder="值"
                />
                <button
                  type="button"
                  aria-label="删除环境变量"
                  @click="removeEnvironmentVariable(variable.id)"
                >
                  <X :size="13" />
                </button>
              </div>
              <button type="button" @click="addEnvironmentVariable">
                <Plus :size="14" /> 添加变量
              </button>
            </div>
          </section>
        </aside>

        <template v-if="collectionContextMenu">
          <button
            class="collection-context-dismiss"
            type="button"
            aria-label="关闭集合菜单"
            @click="collectionContextMenu = null"
            @contextmenu.prevent="collectionContextMenu = null"
          ></button>
          <div
            class="collection-context-menu"
            role="menu"
            :style="{
              left: collectionContextMenu.x + 'px',
              top: collectionContextMenu.y + 'px',
            }"
          >
            <strong>{{
              collections.find((item) => item.id === collectionContextMenu?.collectionId)?.name
            }}</strong>
            <button
              type="button"
              role="menuitem"
              :disabled="collections.length <= 1"
              @click="confirmRemoveCollection(collectionContextMenu.collectionId)"
            >
              <Trash2 :size="15" /> 删除集合
            </button>
          </div>
        </template>

        <WorkspaceRequestPicker
          v-if="showWorkspaceRequestPicker"
          :apis="apis"
          :catalog-apis="catalogApis"
          :saved-requests="savedRequests"
          :collections="collections"
          :active-collection-id="activeCollectionId"
          :active-collection-name="activeCollection?.name || ''"
          @close="showWorkspaceRequestPicker = false"
          @append="appendWorkspaceRequests"
          @create="addCreatedWorkspaceRequest"
          @notify="notify"
        />
      </div>
    </Modal>

    <Toast ref="toastRef" />
  </div>
</template>

<style src="./api-manager.css"></style>
