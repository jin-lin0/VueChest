<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CopyButton from '@/components/common/CopyButton.vue'
import CustomSelect, { type SelectOption } from '@/components/common/CustomSelect.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Toast from '@/components/common/Toast.vue'
import Modal from '@/components/common/Modal.vue'
import { useConfirm } from '@/composables/useConfirm'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { getStorage, setStorage } from '@/lib/storage'
import type { ApiItem } from './defaults'
import {
  buildCurlCommand,
  buildRequestUrl,
  formatBytes,
  getEnabledHeaders,
  inferApiAccess,
  evaluateAssertions,
  resolveVariables,
  type AssertionResult,
  type AssertionRule,
  type EnvironmentVariable,
  type RequestHeader,
} from './request-utils'

interface ApiResponse {
  status: number
  statusText: string
  data: unknown
  time: number
  contentType: string
  headers: Record<string, string>
  imageUrl?: string
  truncated: boolean
  size: number
}

interface RequestHistoryItem {
  id: string
  apiId: string | number
  apiName: string
  method: ApiItem['method']
  createdAt: string
  time: number
  status?: number
  ok: boolean
  error?: string
}

type CatalogScope = 'all' | 'featured' | 'pinned' | 'recent'
type RequestTab = 'params' | 'headers' | 'body' | 'tests'
type ResponseTab = 'preview' | 'headers' | 'tests'

interface ApiEnvironment {
  id: string
  name: string
  variables: EnvironmentVariable[]
}

interface ApiCollection {
  id: string
  name: string
  color: string
}

interface SavedRequest {
  id: string
  name: string
  collectionId: string
  apiId: string | number
  paramValues: Record<string, string>
  headers: RequestHeader[]
  body: string
  assertions: AssertionRule[]
  createdAt: string
}

const LEGACY_USER_APIS_KEY = 'userApis'
const LEGACY_PINNED_IDS_KEY = 'pinnedSystemIds'
const MAX_PREVIEW_BYTES = 512 * 1024
const REQUEST_TIMEOUT_MS = 20_000

const router = useRouter()
const { confirm } = useConfirm()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)

const defaultApis = ref<ApiItem[]>([])
const userApis = ref<ApiItem[]>([])
const pinnedSystemIds = ref<(string | number)[]>([])
const recentIds = ref<(string | number)[]>([])
const requestHistory = ref<RequestHistoryItem[]>([])
const isCatalogLoading = ref(true)

const searchQuery = ref('')
const catalogScope = ref<CatalogScope>('all')
const selectedCategory = ref<string | number>('all')
const selectedId = ref<string | number | null>(null)

const paramValues = ref<Record<string, string>>({})
const requestHeaders = ref<RequestHeader[]>([])
const requestBody = ref('')
const requestTab = ref<RequestTab>('params')
const responseTab = ref<ResponseTab>('preview')
const response = ref<ApiResponse | null>(null)
const error = ref<string | null>(null)
const validationMessage = ref<string | null>(null)
const isLoading = ref(false)
const activeController = ref<AbortController | null>(null)
const environments = ref<ApiEnvironment[]>([])
const activeEnvironmentId = ref('')
const collections = ref<ApiCollection[]>([])
const activeCollectionId = ref('')
const savedRequests = ref<SavedRequest[]>([])
const assertions = ref<AssertionRule[]>([])
const assertionResults = ref<AssertionResult[]>([])
const showWorkspaceManager = ref(false)
const newEnvironmentName = ref('')
const newCollectionName = ref('')
const saveRequestName = ref('')
const workspaceFileRef = ref<HTMLInputElement | null>(null)

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

const methodOptions: SelectOption[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({
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
const assertionTypeOptions: SelectOption[] = [
  { value: 'status', label: '状态码等于' },
  { value: 'time', label: '响应耗时小于' },
  { value: 'body-includes', label: '响应包含文本' },
]

onMounted(async () => {
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
  environments.value = getStorage<ApiEnvironment[]>(STORAGE_KEYS.API_MANAGER_ENVIRONMENTS, []) ?? []
  if (!environments.value.length) {
    environments.value = [{ id: crypto.randomUUID(), name: '默认环境', variables: [] }]
  }
  activeEnvironmentId.value =
    getStorage<string>(STORAGE_KEYS.API_MANAGER_ACTIVE_ENVIRONMENT, environments.value[0].id) ||
    environments.value[0].id
  collections.value = getStorage<ApiCollection[]>(STORAGE_KEYS.API_MANAGER_COLLECTIONS, []) ?? []
  if (!collections.value.length) {
    collections.value = [{ id: crypto.randomUUID(), name: '默认集合', color: '#667eea' }]
  }
  activeCollectionId.value =
    getStorage<string>(STORAGE_KEYS.API_MANAGER_ACTIVE_COLLECTION, collections.value[0].id) ||
    collections.value[0].id
  savedRequests.value =
    getStorage<SavedRequest[]>(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, []) ?? []

  defaultApis.value = (await import('./defaults')).defaultApis
  isCatalogLoading.value = false
})

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
watch(activeCollectionId, (value) => setStorage(STORAGE_KEYS.API_MANAGER_ACTIVE_COLLECTION, value))
watch(savedRequests, (value) => setStorage(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, value), {
  deep: true,
})

const systemApis = computed(() =>
  defaultApis.value.map((api) => ({
    ...api,
    createdAt: api.createdAt ?? '2000-01-01T00:00:00.000Z',
    pinned: pinnedSystemIds.value.includes(api.id),
  })),
)
const apis = computed<ApiItem[]>(() => [...systemApis.value, ...userApis.value])
const selectedApi = computed(() => apis.value.find((api) => api.id === selectedId.value) ?? null)
const featuredApis = computed(() => apis.value.filter((api) => api.featured).slice(0, 6))
const pinnedCount = computed(() => apis.value.filter((api) => api.pinned).length)

const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const api of apis.value) counts.set(api.category, (counts.get(api.category) ?? 0) + 1)
  return counts
})
const categories = computed(() =>
  [...categoryCounts.value.keys()].sort((a, b) => a.localeCompare(b)),
)
const categoryOptions = computed<SelectOption[]>(() => [
  { value: 'all', label: `全部分类 · ${apis.value.length}` },
  ...categories.value.map((category) => ({
    value: category,
    label: `${category} · ${categoryCounts.value.get(category) ?? 0}`,
  })),
])

const filteredApis = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const recentOrder = new Map(recentIds.value.map((id, index) => [id, index]))

  return apis.value
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
const collectionOptions = computed<SelectOption[]>(() =>
  collections.value.map((item) => ({ value: item.id, label: item.name })),
)
const currentUrl = computed(() =>
  selectedApi.value
    ? resolveVariables(buildRequestUrl(selectedApi.value, paramValues.value), activeVariables.value)
    : '',
)
const curlCommand = computed(() =>
  selectedApi.value
    ? buildCurlCommand(
        selectedApi.value,
        currentUrl.value,
        requestHeaders.value.map((header) => ({
          ...header,
          value: resolveVariables(header.value, activeVariables.value),
        })),
        resolveVariables(requestBody.value, activeVariables.value),
      )
    : '',
)
const responseText = computed(() => {
  if (!response.value || response.value.imageUrl) return ''
  if (typeof response.value.data === 'string') return response.value.data
  try {
    return JSON.stringify(response.value.data, null, 2)
  } catch {
    return String(response.value.data)
  }
})
const canHaveBody = computed(() => Boolean(selectedApi.value && selectedApi.value.method !== 'GET'))

function notify(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

function createHeader(name = '', value = ''): RequestHeader {
  return { id: crypto.randomUUID(), name, value, enabled: true }
}

function resetRequest(api: ApiItem) {
  if (response.value?.imageUrl) URL.revokeObjectURL(response.value.imageUrl)
  paramValues.value = Object.fromEntries(
    api.params.map((param) => [param.name, param.defaultValue]),
  )
  requestHeaders.value = [createHeader('Accept', '*/*')]
  requestBody.value = api.method === 'GET' ? '' : '{\n  \n}'
  requestTab.value = api.params.length ? 'params' : 'headers'
  responseTab.value = 'preview'
  response.value = null
  assertionResults.value = []
  assertions.value = [
    { id: crypto.randomUUID(), type: 'status', expected: '200', enabled: true },
    { id: crypto.randomUUID(), type: 'time', expected: '2000', enabled: false },
  ]
  error.value = null
  validationMessage.value = null
}

function selectApi(api: ApiItem) {
  showAddForm.value = false
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

async function parseBody(
  result: Response,
  contentType: string,
): Promise<{ data: unknown; imageUrl?: string; truncated: boolean; size: number }> {
  if (contentType.startsWith('image/')) {
    const blob = await result.blob()
    return { data: null, imageUrl: URL.createObjectURL(blob), truncated: false, size: blob.size }
  }

  const reader = result.body?.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let truncated = false
  let text = ''

  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.length
      const remaining = MAX_PREVIEW_BYTES - (received - value.length)
      text += decoder.decode(value.slice(0, Math.max(0, remaining)), { stream: true })
      if (received >= MAX_PREVIEW_BYTES) {
        truncated = true
        await reader.cancel()
        break
      }
    }
    text += decoder.decode()
  } else {
    text = await result.text()
    received = new TextEncoder().encode(text).length
    if (received > MAX_PREVIEW_BYTES) {
      text = text.slice(0, MAX_PREVIEW_BYTES)
      truncated = true
    }
  }

  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // 非 JSON 响应按原始文本展示。
  }
  return { data, truncated, size: received }
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
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const startedAt = performance.now()

  try {
    const headers = Object.fromEntries(
      Object.entries(getEnabledHeaders(requestHeaders.value)).map(([name, value]) => [
        name,
        resolveVariables(value, activeVariables.value),
      ]),
    )
    const hasContentType = Object.keys(headers).some(
      (name) => name.toLowerCase() === 'content-type',
    )
    const resolvedBody = resolveVariables(requestBody.value, activeVariables.value)
    const hasBody = api.method !== 'GET' && resolvedBody.trim() !== ''
    if (hasBody && !hasContentType) headers['Content-Type'] = 'application/json'

    const result = await fetch(currentUrl.value, {
      method: api.method,
      headers,
      body: hasBody ? resolvedBody : undefined,
      signal: controller.signal,
    })
    const contentType = result.headers.get('content-type') ?? ''
    const parsed = await parseBody(result, contentType)
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
    addHistory({
      apiId: api.id,
      apiName: api.name,
      method: api.method,
      status: result.status,
      time,
      ok: result.ok,
    })
  } catch (reason) {
    const time = Math.round(performance.now() - startedAt)
    const message = timedOut
      ? `请求超过 ${REQUEST_TIMEOUT_MS / 1000} 秒，已自动取消`
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
    if (activeController.value === controller) activeController.value = null
    isLoading.value = false
  }
}

function abortRequest() {
  activeController.value?.abort()
}

function getStatusTone(status: number): string {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 400 && status < 500) return 'warning'
  if (status >= 500) return 'danger'
  return 'info'
}

function accessFor(api: ApiItem) {
  return inferApiAccess(api)
}

function setScope(scope: CatalogScope) {
  catalogScope.value = scope
}

function addRequestHeader() {
  requestHeaders.value.push(createHeader())
}

function removeRequestHeader(id: string) {
  requestHeaders.value = requestHeaders.value.filter((header) => header.id !== id)
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
}

function removeCollection(id: string) {
  if (collections.value.length <= 1) return
  collections.value = collections.value.filter((item) => item.id !== id)
  savedRequests.value = savedRequests.value.filter((item) => item.collectionId !== id)
  if (activeCollectionId.value === id) activeCollectionId.value = collections.value[0].id
}

function addAssertion() {
  assertions.value.push({
    id: crypto.randomUUID(),
    type: 'body-includes',
    expected: '',
    enabled: true,
  })
}

function removeAssertion(id: string) {
  assertions.value = assertions.value.filter((item) => item.id !== id)
  assertionResults.value = assertionResults.value.filter((item) => item.id !== id)
}

function saveCurrentRequest() {
  if (!selectedApi.value) return
  const name = saveRequestName.value.trim() || `${selectedApi.value.name} 副本`
  savedRequests.value.unshift({
    id: crypto.randomUUID(),
    name,
    collectionId: activeCollectionId.value || collections.value[0].id,
    apiId: selectedApi.value.id,
    paramValues: { ...paramValues.value },
    headers: requestHeaders.value.map((item) => ({ ...item })),
    body: requestBody.value,
    assertions: assertions.value.map((item) => ({ ...item })),
    createdAt: new Date().toISOString(),
  })
  saveRequestName.value = ''
  notify('success', `已保存请求「${name}」`)
}

function openSavedRequest(saved: SavedRequest) {
  const api = apis.value.find((item) => item.id === saved.apiId)
  if (!api) {
    notify('warning', '原始 API 已不存在')
    return
  }
  selectApi(api)
  paramValues.value = { ...saved.paramValues }
  requestHeaders.value = saved.headers.map((item) => ({ ...item }))
  requestBody.value = saved.body
  assertions.value = saved.assertions.map((item) => ({ ...item }))
  showWorkspaceManager.value = false
}

function removeSavedRequest(id: string) {
  savedRequests.value = savedRequests.value.filter((item) => item.id !== id)
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
  activeController.value?.abort()
  if (response.value?.imageUrl) URL.revokeObjectURL(response.value.imageUrl)
})
</script>

<template>
  <div class="api-workbench">
    <header class="topbar">
      <button
        class="icon-button back-button"
        type="button"
        aria-label="返回首页"
        @click="router.push('/')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>

      <div class="brand-lockup" role="banner">
        <span class="brand-mark">A</span>
        <span><strong>API LAB</strong><small>发现 · 调试 · 复用</small></span>
      </div>

      <div class="topbar-actions">
        <span class="catalog-health"><i></i>{{ apis.length }} 个接口已载入</span>
        <div class="environment-switcher" title="当前请求环境">
          <span>ENV</span>
          <CustomSelect v-model="activeEnvironmentId" :options="environmentOptions" size="sm" />
        </div>
        <button class="secondary-button compact" type="button" @click="showWorkspaceManager = true">
          工作区 · {{ savedRequests.length }}
        </button>
        <button class="primary-button compact" type="button" @click="showAddFormPanel">
          <span aria-hidden="true">＋</span> 添加 API
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

        <div class="scope-tabs" role="tablist" aria-label="目录筛选">
          <button
            :class="{ active: catalogScope === 'all' }"
            type="button"
            @click="setScope('all')"
          >
            全部
          </button>
          <button
            :class="{ active: catalogScope === 'featured' }"
            type="button"
            @click="setScope('featured')"
          >
            推荐
          </button>
          <button
            :class="{ active: catalogScope === 'pinned' }"
            type="button"
            @click="setScope('pinned')"
          >
            置顶
          </button>
          <button
            :class="{ active: catalogScope === 'recent' }"
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
              <span>接口总数</span><strong>{{ apis.length }}</strong
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
              <button type="button" @click="saveCurrentRequest">保存请求</button>
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
            <section class="runner-card request-card">
              <div class="runner-card-heading">
                <div>
                  <span class="step-number">01</span>
                  <div>
                    <h2>构建请求</h2>
                    <p>配置运行时参数、Header 与 Body</p>
                  </div>
                </div>
                <CopyButton :text="curlCommand" label="复制 cURL" :icon="false" variant="mini" />
              </div>

              <div class="runner-tabs" role="tablist">
                <button
                  :class="{ active: requestTab === 'params' }"
                  type="button"
                  @click="requestTab = 'params'"
                >
                  Params <span>{{ selectedApi.params.length }}</span>
                </button>
                <button
                  :class="{ active: requestTab === 'headers' }"
                  type="button"
                  @click="requestTab = 'headers'"
                >
                  Headers <span>{{ requestHeaders.length }}</span>
                </button>
                <button
                  v-if="canHaveBody"
                  :class="{ active: requestTab === 'body' }"
                  type="button"
                  @click="requestTab = 'body'"
                >
                  Body
                </button>
                <button
                  :class="{ active: requestTab === 'tests' }"
                  type="button"
                  @click="requestTab = 'tests'"
                >
                  Tests <span>{{ assertions.length }}</span>
                </button>
              </div>

              <div class="request-config vc-scrollbar vc-scrollbar--thin">
                <div v-if="requestTab === 'params'" class="runtime-params">
                  <div v-if="selectedApi.params.length" class="param-table-head">
                    <span>参数</span><span>值</span>
                  </div>
                  <label v-for="param in selectedApi.params" :key="param.name" class="runtime-param"
                    ><span class="runtime-param-info"
                      ><strong>{{ param.name }} <b v-if="param.required">*</b></strong
                      ><small>{{ param.description || `${param.type} 参数` }}</small></span
                    ><input
                      v-model="paramValues[param.name]"
                      :type="param.type === 'number' ? 'number' : 'text'"
                      :placeholder="param.defaultValue || '输入参数值'"
                  /></label>
                  <div v-if="!selectedApi.params.length" class="config-empty">
                    <span>✓</span><strong>这个接口没有动态参数</strong>
                    <p>请求地址已经可以直接运行。需要自定义 Header 时切换到 Headers。</p>
                  </div>
                </div>

                <div v-else-if="requestTab === 'headers'" class="headers-editor">
                  <div class="header-table-head">
                    <span>启用</span><span>Header</span><span>Value</span><span></span>
                  </div>
                  <div v-for="header in requestHeaders" :key="header.id" class="header-row">
                    <label class="row-check"
                      ><input v-model="header.enabled" type="checkbox" /><span></span></label
                    ><input v-model="header.name" type="text" placeholder="Authorization" /><input
                      v-model="header.value"
                      type="text"
                      placeholder="Bearer …"
                    /><button
                      type="button"
                      aria-label="删除请求头"
                      @click="removeRequestHeader(header.id)"
                    >
                      ×
                    </button>
                  </div>
                  <button class="add-table-row" type="button" @click="addRequestHeader">
                    ＋ 添加 Header
                  </button>
                  <p class="security-note">敏感 Header 只用于本次页面会话，不会写入请求历史。</p>
                </div>

                <div v-else-if="requestTab === 'body'" class="body-editor">
                  <div class="code-editor-bar">
                    <span>JSON / TEXT</span
                    ><small>Content-Type 未填写时默认 application/json</small>
                  </div>
                  <textarea
                    v-model="requestBody"
                    spellcheck="false"
                    aria-label="请求 Body"
                  ></textarea>
                </div>
                <div v-else class="assertion-editor">
                  <div class="assertion-head">
                    <span>启用</span><span>断言</span><span>期望值</span><span></span>
                  </div>
                  <div v-for="rule in assertions" :key="rule.id" class="assertion-row">
                    <label class="row-check"
                      ><input v-model="rule.enabled" type="checkbox" /><span></span
                    ></label>
                    <CustomSelect
                      v-model="rule.type"
                      :options="assertionTypeOptions"
                      size="sm"
                      block
                    />
                    <input
                      v-model="rule.expected"
                      type="text"
                      :placeholder="
                        rule.type === 'status' ? '200' : rule.type === 'time' ? '2000' : 'success'
                      "
                    />
                    <button type="button" aria-label="删除断言" @click="removeAssertion(rule.id)">
                      ×
                    </button>
                  </div>
                  <button class="add-table-row" type="button" @click="addAssertion">
                    ＋ 添加断言
                  </button>
                  <p class="security-note">
                    每次请求完成后自动执行，用于快速验证状态、性能和响应内容。
                  </p>
                </div>
              </div>

              <p v-if="validationMessage" class="form-banner error">{{ validationMessage }}</p>
              <div class="request-actions">
                <button v-if="!isLoading" class="send-button" type="button" @click="executeApi">
                  <span>▶</span> 发送请求</button
                ><button v-else class="cancel-request-button" type="button" @click="abortRequest">
                  <span>■</span> 取消请求</button
                ><span
                  ><i :class="{ running: isLoading }"></i
                  >{{
                    isLoading ? '正在等待目标服务响应…' : `超时限制 ${REQUEST_TIMEOUT_MS / 1000}s`
                  }}</span
                >
              </div>
            </section>

            <section class="runner-card response-card">
              <div class="runner-card-heading response-heading">
                <div>
                  <span class="step-number">02</span>
                  <div>
                    <h2>读取响应</h2>
                    <p>预览 Body 与响应 Header</p>
                  </div>
                </div>
                <CopyButton
                  v-if="responseText"
                  :text="responseText"
                  label="复制响应"
                  :icon="false"
                  variant="mini"
                />
              </div>

              <div class="runner-tabs response-tabs" role="tablist">
                <button
                  :class="{ active: responseTab === 'preview' }"
                  type="button"
                  @click="responseTab = 'preview'"
                >
                  Preview</button
                ><button
                  :class="{ active: responseTab === 'headers' }"
                  :disabled="!response"
                  type="button"
                  @click="responseTab = 'headers'"
                >
                  Headers <span>{{ response ? Object.keys(response.headers).length : 0 }}</span>
                </button>
                <button
                  :class="{ active: responseTab === 'tests' }"
                  :disabled="!response"
                  type="button"
                  @click="responseTab = 'tests'"
                >
                  Tests
                  <span
                    >{{ assertionResults.filter((item) => item.passed).length }}/{{
                      assertionResults.length
                    }}</span
                  >
                </button>
                <div v-if="response" class="response-metrics">
                  <span class="status-pill" :class="getStatusTone(response.status)"
                    ><i></i>{{ response.status }} {{ response.statusText }}</span
                  ><span>{{ response.time }} ms</span><span>{{ formatBytes(response.size) }}</span>
                </div>
              </div>

              <div class="response-viewport vc-scrollbar vc-scrollbar--thin">
                <div v-if="isLoading" class="response-loading">
                  <span class="pulse-ring"></span><strong>请求已发出</strong>
                  <p>正在等待响应并读取数据流…</p>
                  <div><i></i><i></i><i></i></div>
                </div>
                <div v-else-if="error" class="response-error">
                  <span>!</span><strong>请求没有完成</strong>
                  <p>{{ error }}</p>
                  <button type="button" @click="executeApi">重新发送</button>
                </div>
                <template v-else-if="response">
                  <div v-if="response.truncated" class="truncate-banner">
                    响应超过 512 KB，已停止读取并只展示安全范围内的内容。
                  </div>
                  <div v-if="responseTab === 'preview'" class="response-body">
                    <img
                      v-if="response.imageUrl"
                      :src="response.imageUrl"
                      :alt="response.contentType"
                    />
                    <pre v-else><code>{{ responseText }}</code></pre>
                  </div>
                  <div v-else-if="responseTab === 'headers'" class="response-headers-table">
                    <div v-for="(value, name) in response.headers" :key="name">
                      <strong>{{ name }}</strong
                      ><code>{{ value }}</code>
                    </div>
                  </div>
                  <div v-else class="assertion-results">
                    <div
                      v-for="item in assertionResults"
                      :key="item.id"
                      :class="item.passed ? 'passed' : 'failed'"
                    >
                      <span>{{ item.passed ? '✓' : '×' }}</span
                      ><strong>{{ item.label }}</strong
                      ><small>{{ item.detail }}</small>
                    </div>
                    <p v-if="!assertionResults.length">还没有启用的断言。</p>
                  </div>
                </template>
                <div v-else class="response-placeholder">
                  <div class="response-orbit"><span>{ }</span><i></i><i></i></div>
                  <strong>等待一次真实响应</strong>
                  <p>配置左侧请求并点击“发送请求”，状态、耗时、大小和响应内容会显示在这里。</p>
                  <div class="placeholder-hints">
                    <span>JSON 格式化</span><span>图片预览</span><span>响应头</span>
                  </div>
                </div>
              </div>
            </section>
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

    <Modal v-model:open="showWorkspaceManager" title="API 工作区" width="min(920px, 94vw)">
      <div class="workspace-manager">
        <section class="manager-section environment-manager">
          <div class="manager-heading">
            <div>
              <h3>环境变量</h3>
              <p>
                在 URL、Header 或 Body 中使用 <code v-pre>{{ variable }}</code
                >。
              </p>
            </div>
          </div>
          <div class="manager-toolbar">
            <CustomSelect v-model="activeEnvironmentId" :options="environmentOptions" size="sm" />
            <input
              v-model="newEnvironmentName"
              type="text"
              placeholder="新环境名称"
              @keydown.enter="addEnvironment"
            />
            <button type="button" @click="addEnvironment">新建环境</button>
            <button
              v-if="environments.length > 1"
              class="danger-text"
              type="button"
              @click="removeEnvironment(activeEnvironmentId)"
            >
              删除环境
            </button>
          </div>
          <div class="variable-table">
            <div class="variable-head">
              <span>启用</span><span>变量名</span><span>值</span><span></span>
            </div>
            <div
              v-for="variable in activeEnvironment?.variables || []"
              :key="variable.id"
              class="variable-row"
            >
              <label class="row-check"
                ><input v-model="variable.enabled" type="checkbox" /><span></span
              ></label>
              <input v-model="variable.key" type="text" placeholder="baseUrl" />
              <input v-model="variable.value" type="text" placeholder="https://api.example.com" />
              <button type="button" @click="removeEnvironmentVariable(variable.id)">×</button>
            </div>
            <button class="add-table-row" type="button" @click="addEnvironmentVariable">
              ＋ 添加变量
            </button>
          </div>
        </section>

        <section class="manager-section collection-manager">
          <div class="manager-heading">
            <div>
              <h3>请求集合</h3>
              <p>保存当前参数、Header、Body 与断言。</p>
            </div>
          </div>
          <div class="manager-toolbar">
            <CustomSelect v-model="activeCollectionId" :options="collectionOptions" size="sm" />
            <input
              v-model="newCollectionName"
              type="text"
              placeholder="新集合名称"
              @keydown.enter="addCollection"
            />
            <button type="button" @click="addCollection">新建集合</button>
            <button
              v-if="collections.length > 1"
              class="danger-text"
              type="button"
              @click="removeCollection(activeCollectionId)"
            >
              删除集合
            </button>
          </div>
          <div class="save-current-row">
            <input v-model="saveRequestName" type="text" placeholder="当前请求名称" />
            <button type="button" :disabled="!selectedApi" @click="saveCurrentRequest">
              保存当前请求
            </button>
          </div>
          <div class="manager-saved-list">
            <div v-for="saved in savedRequests" :key="saved.id">
              <span
                class="saved-color"
                :style="{
                  background: collections.find((item) => item.id === saved.collectionId)?.color,
                }"
              ></span>
              <span
                ><strong>{{ saved.name }}</strong
                ><small>{{ new Date(saved.createdAt).toLocaleString() }}</small></span
              >
              <button type="button" @click="openSavedRequest(saved)">打开</button>
              <button type="button" class="danger-text" @click="removeSavedRequest(saved.id)">
                删除
              </button>
            </div>
            <p v-if="!savedRequests.length">还没有保存请求。</p>
          </div>
        </section>

        <footer class="manager-footer">
          <button type="button" @click="exportWorkspace">导出工作区</button>
          <button type="button" @click="workspaceFileRef?.click()">导入工作区</button>
          <input
            ref="workspaceFileRef"
            type="file"
            accept="application/json,.json"
            hidden
            @change="importWorkspace"
          />
        </footer>
      </div>
    </Modal>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped src="./api-manager.css"></style>
