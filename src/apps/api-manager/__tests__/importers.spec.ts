import { describe, expect, it } from 'vitest'
import { importApiDocument } from '../importers'
import {
  applyAuth,
  evaluateResponseExtractions,
  extractResponseVariables,
  getJsonPath,
} from '../collection-runner'

describe('API document import', () => {
  it('imports OpenAPI 3 operations and examples', () => {
    const result = importApiDocument(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Pet API' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/pets/{id}': {
            get: {
              summary: 'Get pet',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            },
          },
        },
      }),
    )
    expect(result.format).toBe('openapi')
    expect(result.requests[0].api.url).toBe('https://api.example.com/pets/{id}')
    expect(result.requests[0].api.params[0].required).toBe(true)
  })

  it('imports nested Postman requests and variables', () => {
    const result = importApiDocument(
      JSON.stringify({
        info: {
          name: 'Collection',
          _postman_id: 'id',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        variable: [{ key: 'baseUrl', value: 'https://api.example.com' }],
        item: [
          {
            name: 'Users',
            item: [
              {
                name: 'List',
                request: {
                  method: 'GET',
                  url: {
                    raw: '{{baseUrl}}/users?page=1',
                    query: [{ key: 'page', value: '1' }],
                  },
                },
              },
            ],
          },
        ],
      }),
    )
    expect(result.requests[0].api.category).toBe('Users')
    expect(result.requests[0].api.url).toBe('{{baseUrl}}/users')
    expect(result.requests[0].api.params[0].name).toBe('page')
    expect(result.variables).toEqual([{ key: 'baseUrl', value: 'https://api.example.com' }])
  })
})

describe('collection variables and auth', () => {
  const variables = [{ id: '1', key: 'token', value: 'secret', enabled: true }]

  it('applies authentication with environment variables', () => {
    expect(
      applyAuth('https://api.example.com', {}, { type: 'bearer', token: '{{token}}' }, variables),
    ).toEqual({
      url: 'https://api.example.com',
      headers: { Authorization: 'Bearer secret' },
    })
  })

  it('extracts JSON path values for the next request', () => {
    expect(getJsonPath({ data: { items: [{ id: 7 }] } }, '$.data.items[0].id')).toBe(7)
    expect(
      extractResponseVariables({ data: { token: 'abc' } }, [
        { id: '1', path: '$.data.token', variable: 'accessToken', enabled: true },
      ]),
    ).toEqual([{ variable: 'accessToken', value: 'abc' }])
  })

  it('保留每条提取规则的运行结果和失败原因', () => {
    expect(
      evaluateResponseExtractions({ data: { token: 'abc' } }, [
        { id: 'success', path: '$.data.token', variable: 'accessToken', enabled: true },
        { id: 'missing', path: '$.data.user.id', variable: 'userId', enabled: true },
        { id: 'invalid', path: '', variable: 'emptyPath', enabled: true },
        { id: 'disabled', path: '$.data.token', variable: 'ignored', enabled: false },
      ]),
    ).toEqual([
      {
        id: 'success',
        path: '$.data.token',
        variable: 'accessToken',
        passed: true,
        value: 'abc',
        detail: '提取成功',
      },
      {
        id: 'missing',
        path: '$.data.user.id',
        variable: 'userId',
        passed: false,
        detail: '响应中未找到 $.data.user.id',
      },
      {
        id: 'invalid',
        path: '',
        variable: 'emptyPath',
        passed: false,
        detail: '请填写响应字段',
      },
    ])
  })
})
