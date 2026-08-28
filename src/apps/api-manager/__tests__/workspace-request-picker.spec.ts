import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { ApiItem } from '../defaults'
import type { ApiCollection, SavedRequest } from '../types'
import { useWorkspaceRequestPicker } from '../useWorkspaceRequestPicker'

const catalogApis: ApiItem[] = [
  {
    id: 'list-users',
    name: '用户列表',
    url: 'https://example.com/users',
    method: 'GET',
    category: '用户',
    description: '查询用户',
    params: [],
  },
  {
    id: 'create-order',
    name: '创建订单',
    url: 'https://example.com/orders',
    method: 'POST',
    category: '订单',
    description: '创建订单',
    params: [],
  },
]

const collections: ApiCollection[] = [
  { id: 'users', name: '用户流程', color: '#6255e8' },
  { id: 'orders', name: '订单流程', color: '#2563eb' },
]

const reusableRequest: SavedRequest = {
  id: 'saved-order',
  name: '创建演示订单',
  collectionId: 'orders',
  apiId: 'create-order',
  paramValues: {},
  headers: [],
  body: '{"amount":1}',
  assertions: [],
  createdAt: '2026-08-29T00:00:00.000Z',
}

function setupPicker() {
  const apis = ref(catalogApis)
  const savedRequests = ref<SavedRequest[]>([reusableRequest])
  const activeCollectionId = ref('users')
  const appendRequests = vi.fn()
  const addCreatedRequest = vi.fn()
  const notify = vi.fn()
  const picker = useWorkspaceRequestPicker({
    apis: computed(() => apis.value),
    catalogApis: computed(() => apis.value),
    savedRequests,
    collections: ref(collections),
    activeCollectionId,
    activeCollectionName: computed(() => '用户流程'),
    appendRequests,
    addCreatedRequest,
    notify,
  })
  return { picker, appendRequests, addCreatedRequest, notify }
}

describe('workspace request picker', () => {
  it('按关键词和请求方法筛选 API', () => {
    const { picker } = setupPicker()

    picker.workspacePickerSearch.value = '订单'
    expect(picker.workspaceCatalogApis.value.map((api) => api.id)).toEqual(['create-order'])

    picker.workspacePickerSearch.value = ''
    picker.workspacePickerMethod.value = 'GET'
    expect(picker.workspaceCatalogApis.value.map((api) => api.id)).toEqual(['list-users'])
  })

  it('批量添加目录 API 时生成当前集合的独立请求', () => {
    const { picker, appendRequests, notify } = setupPicker()
    picker.workspaceSelectedApiIds.value = ['list-users', 'create-order']

    picker.addSelectedCatalogRequests()

    const requests = appendRequests.mock.calls[0][0] as SavedRequest[]
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.collectionId === 'users')).toBe(true)
    expect(requests.map((request) => request.apiId)).toEqual(['list-users', 'create-order'])
    expect(notify).toHaveBeenCalledWith('success', '已向「用户流程」添加 2 个请求')
  })

  it('校验自定义请求，并保留“仅工作区可见”的默认值', () => {
    const { picker, addCreatedRequest } = setupPicker()
    picker.openWorkspaceRequestPicker('custom')

    picker.createWorkspaceCustomRequest()
    expect(picker.workspaceCustomErrors.value).toEqual({
      name: '请输入请求名称',
      url: '请输入请求地址',
    })
    expect(addCreatedRequest).not.toHaveBeenCalled()

    picker.workspaceCustomRequest.value.name = '健康检查'
    picker.workspaceCustomRequest.value.url = '{{baseUrl}}/health'
    picker.createWorkspaceCustomRequest()

    expect(addCreatedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '健康检查',
        url: '{{baseUrl}}/health',
        catalogVisible: false,
      }),
    )
  })
})
