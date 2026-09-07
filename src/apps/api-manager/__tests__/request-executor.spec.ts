import { describe, expect, it, vi } from 'vitest'
import type { ApiItem } from '../defaults'
import { MAX_PREVIEW_BYTES, parseResponseBody, runSavedRequest } from '../request-executor'
import type { SavedRequest } from '../types'

const api: ApiItem = {
  id: 'create-user',
  name: '创建用户',
  url: 'https://{{host}}/users',
  method: 'POST',
  category: '测试',
  description: '创建测试用户',
  params: [],
}

function createSavedRequest(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: 'saved-create-user',
    name: '创建用户',
    collectionId: 'users',
    apiId: api.id,
    paramValues: {},
    headers: [{ id: 'accept', name: 'Accept', value: 'application/json', enabled: true }],
    body: '{"name":"{{name}}"}',
    assertions: [
      { id: 'status', type: 'status', expected: '201', enabled: true },
      { id: 'body', type: 'body-includes', expected: 'created', enabled: true },
    ],
    auth: { type: 'bearer', token: '{{token}}' },
    extractions: [{ id: 'user-id', path: '$.data.id', variable: 'userId', enabled: true }],
    retryCount: 0,
    timeoutMs: 5000,
    createdAt: '2026-08-29T00:00:00.000Z',
    ...overrides,
  }
}

describe('parseResponseBody', () => {
  it('解析 JSON，并按字节限制预览大小', async () => {
    const result = await parseResponseBody(
      new Response('{"message":"hello-vuechest"}', {
        headers: { 'Content-Type': 'application/json' },
      }),
      'application/json',
      16,
    )

    expect(result.truncated).toBe(true)
    expect(result.size).toBeGreaterThan(16)
    expect(new TextEncoder().encode(String(result.data)).byteLength).toBeLessThanOrEqual(16)
  })

  it('默认预览上限保持为 512 KiB', () => {
    expect(MAX_PREVIEW_BYTES).toBe(512 * 1024)
  })

  it('releases the reader and does not mark an exact-size response as truncated', async () => {
    const response = new Response('exact')
    const result = await parseResponseBody(response, 'text/plain', 5)
    expect(result).toMatchObject({ data: 'exact', truncated: false, size: 5 })
    expect(response.body?.locked).toBe(false)
  })

  it('releases the reader after a network error', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('Connection lost'))
        },
      }),
    )
    await expect(parseResponseBody(response, 'text/plain')).rejects.toThrow('Connection lost')
    expect(response.body?.locked).toBe(false)
  })
})

describe('runSavedRequest', () => {
  it('解析变量、鉴权、断言和响应提取', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('{"created":true,"data":{"id":42}}', {
          status: 201,
          statusText: 'Created',
          headers: { 'Content-Type': 'application/json', 'X-Trace': 'trace-1' },
        }),
    )
    const timestamps = [100, 148]

    const execution = await runSavedRequest(
      createSavedRequest(),
      api,
      [
        { id: 'host', key: 'host', value: 'api.example.com', enabled: true },
        { id: 'name', key: 'name', value: 'Ada', enabled: true },
        { id: 'token', key: 'token', value: 'secret', enabled: true },
      ],
      {
        fetch: fetchMock as unknown as typeof fetch,
        now: () => timestamps.shift() ?? 148,
        timeoutSignal: () => new AbortController().signal,
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"Ada"}',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
        },
      }),
    )
    expect(execution.result).toMatchObject({
      status: 201,
      time: 48,
      ok: true,
      testsPassed: 2,
      testsTotal: 2,
    })
    expect(execution.extracted).toEqual([{ variable: 'userId', value: '42' }])
    expect(execution.result.response?.headers['x-trace']).toBe('trace-1')
  })

  it('按配置重试服务端错误', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(
        new Response('{"created":true,"data":{"id":7}}', {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const execution = await runSavedRequest(
      createSavedRequest({ retryCount: 1 }),
      api,
      [
        { id: 'host', key: 'host', value: 'api.example.com', enabled: true },
        { id: 'name', key: 'name', value: 'Ada', enabled: true },
        { id: 'token', key: 'token', value: 'secret', enabled: true },
      ],
      {
        fetch: fetchMock as unknown as typeof fetch,
        now: () => 100,
        timeoutSignal: () => new AbortController().signal,
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(execution.result.status).toBe(201)
    expect(execution.result.ok).toBe(true)
  })

  it('对缺失的原始 API 返回稳定错误结果', async () => {
    const execution = await runSavedRequest(createSavedRequest(), undefined, [])

    expect(execution.result).toMatchObject({
      ok: false,
      time: 0,
      error: '原始 API 已不存在',
    })
    expect(execution.extracted).toEqual([])
  })
})
