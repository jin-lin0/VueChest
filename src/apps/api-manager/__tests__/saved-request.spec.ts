import { describe, expect, it } from 'vitest'
import type { ApiItem } from '../defaults'
import {
  cloneSavedRequestToCollection,
  createSavedRequestFromApi,
} from '../saved-request'

const api: ApiItem = {
  id: 'users',
  name: '用户列表',
  url: 'https://example.com/users',
  method: 'GET',
  category: '测试',
  description: '获取用户列表',
  params: [
    { name: 'page', type: 'number', defaultValue: '1', required: false, description: '' },
  ],
}

function deterministicFactory() {
  let sequence = 0
  return {
    createId: () => `id-${++sequence}`,
    now: () => '2026-08-29T00:00:00.000Z',
  }
}

describe('saved request factory', () => {
  it('从 API 默认配置创建可运行请求', () => {
    const saved = createSavedRequestFromApi(
      api,
      'collection-a',
      '分页用户',
      deterministicFactory(),
    )

    expect(saved).toMatchObject({
      id: 'id-1',
      name: '分页用户',
      collectionId: 'collection-a',
      apiId: 'users',
      paramValues: { page: '1' },
      body: '',
      retryCount: 0,
      timeoutMs: 20_000,
      createdAt: '2026-08-29T00:00:00.000Z',
    })
    expect(saved.headers).toEqual([
      { id: 'id-2', name: 'Accept', value: '*/*', enabled: true },
    ])
    expect(saved.assertions.map((rule) => rule.id)).toEqual(['id-3', 'id-4'])
  })

  it('复制到其他集合时深拷贝可编辑配置并刷新标识', () => {
    const factory = deterministicFactory()
    const original = createSavedRequestFromApi(api, 'collection-a', api.name, factory)
    original.extractions = [
      { id: 'old-extraction', path: '$.data.id', variable: 'userId', enabled: true },
    ]
    original.auth = { type: 'bearer', token: '{{token}}' }

    const cloned = cloneSavedRequestToCollection(
      original,
      'collection-b',
      factory,
    )

    expect(cloned.collectionId).toBe('collection-b')
    expect(cloned.id).not.toBe(original.id)
    expect(cloned.headers[0]).not.toBe(original.headers[0])
    expect(cloned.headers[0].id).not.toBe(original.headers[0].id)
    expect(cloned.assertions[0]).not.toBe(original.assertions[0])
    expect(cloned.extractions?.[0]).not.toBe(original.extractions?.[0])
    expect(cloned.auth).not.toBe(original.auth)
  })
})
