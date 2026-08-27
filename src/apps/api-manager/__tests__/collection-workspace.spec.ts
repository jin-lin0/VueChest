import { describe, expect, it } from 'vitest'
import {
  createRuntimeVariableContext,
  findVariableReferences,
  isRequestUrlTemplate,
  mergeRuntimeVariables,
  requestsForCollection,
  toggleSelection,
  upsertCollectionRequest,
} from '../collection-workspace'

interface TestRequest {
  id: string
  collectionId: string
  name: string
}

const requests: TestRequest[] = [
  { id: 'one', collectionId: 'users', name: '获取用户' },
  { id: 'two', collectionId: 'orders', name: '获取订单' },
]

describe('API collection workspace', () => {
  it('只返回当前集合的请求', () => {
    expect(requestsForCollection(requests, 'orders')).toEqual([requests[1]])
    expect(requestsForCollection(requests, 'empty')).toEqual([])
  })

  it('更新已保存请求时不生成重复项', () => {
    const updated = upsertCollectionRequest(requests, {
      ...requests[0],
      name: '获取用户详情',
    })

    expect(updated).toHaveLength(2)
    expect(updated[0].name).toBe('获取用户详情')
  })

  it('新请求插入列表顶部', () => {
    const created = upsertCollectionRequest(requests, {
      id: 'three',
      collectionId: 'users',
      name: '创建用户',
    })

    expect(created.map((item) => item.id)).toEqual(['three', 'one', 'two'])
  })

  it('识别请求中使用的变量并去重', () => {
    expect(
      findVariableReferences([
        'https://{{baseUrl}}/users/{{userId}}',
        'Bearer {{ token }}',
        '{{userId}}',
      ]),
    ).toEqual(['baseUrl', 'userId', 'token'])
  })

  it('每次集合运行使用独立变量上下文，不修改环境变量', () => {
    const environment = [
      { id: 'base', key: 'baseUrl', value: 'https://example.com', enabled: true },
    ]
    const flowA = mergeRuntimeVariables(createRuntimeVariableContext(environment), [
      { key: 'token', value: 'token-a' },
    ])
    const flowB = mergeRuntimeVariables(createRuntimeVariableContext(environment), [
      { key: 'token', value: 'token-b' },
    ])

    expect(environment).toEqual([
      { id: 'base', key: 'baseUrl', value: 'https://example.com', enabled: true },
    ])
    expect(flowA.find((item) => item.key === 'token')?.value).toBe('token-a')
    expect(flowB.find((item) => item.key === 'token')?.value).toBe('token-b')
  })

  it('支持批量选择切换', () => {
    expect(toggleSelection(['one'], 'two')).toEqual(['one', 'two'])
    expect(toggleSelection(['one', 'two'], 'one')).toEqual(['two'])
  })

  it('接受 HTTP 地址或环境变量开头的请求模板', () => {
    expect(isRequestUrlTemplate('https://api.example.com/users')).toBe(true)
    expect(isRequestUrlTemplate('{{baseUrl}}/users')).toBe(true)
    expect(isRequestUrlTemplate('/users')).toBe(false)
  })
})
