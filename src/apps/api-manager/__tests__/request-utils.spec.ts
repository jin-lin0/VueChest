import { describe, expect, it } from 'vitest'
import type { ApiItem } from '../defaults'
import {
  buildCurlCommand,
  buildRequestUrl,
  formatBytes,
  getEnabledHeaders,
  inferApiAccess,
} from '../request-utils'

const api: ApiItem = {
  id: 1,
  name: '测试接口',
  url: 'https://example.com/users/{name}?year={year}',
  method: 'GET',
  category: '测试',
  description: '免 Key、支持 CORS',
  params: [
    {
      name: 'name',
      type: 'string',
      defaultValue: 'Ada Lovelace',
      required: true,
      description: '',
    },
    {
      name: 'year',
      type: 'number',
      defaultValue: '',
      required: false,
      description: '',
    },
    {
      name: 'page',
      type: 'number',
      defaultValue: '1',
      required: false,
      description: '',
    },
  ],
}

describe('buildRequestUrl', () => {
  it('替换路径参数、移除空查询项并追加额外参数', () => {
    expect(buildRequestUrl(api, {})).toBe('https://example.com/users/Ada%20Lovelace?page=1')
  })

  it('优先使用用户输入并正确编码', () => {
    expect(buildRequestUrl(api, { name: 'a/b', year: '2024', page: '2' })).toBe(
      'https://example.com/users/a%2Fb?year=2024&page=2',
    )
  })
})

describe('request helpers', () => {
  it('只返回启用且有名称的请求头', () => {
    expect(
      getEnabledHeaders([
        { id: '1', name: ' Accept ', value: 'application/json', enabled: true },
        { id: '2', name: 'X-Skip', value: '1', enabled: false },
        { id: '3', name: '', value: '2', enabled: true },
      ]),
    ).toEqual({ Accept: 'application/json' })
  })

  it('生成可复制的 cURL 并转义单引号', () => {
    const postApi = { ...api, method: 'POST' as const }
    const command = buildCurlCommand(
      postApi,
      'https://example.com',
      [{ id: '1', name: 'X-Name', value: "Ada's", enabled: true }],
      '{"ok":true}',
    )
    expect(command).toContain("--header 'X-Name: Ada'\\''s'")
    expect(command).toContain('--data-raw \'{"ok":true}\'')
  })

  it('格式化大小并推断旧数据的访问属性', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(inferApiAccess(api)).toMatchObject({
      authLabel: '无需 Key',
      corsLabel: '支持 CORS',
      verified: false,
    })
  })
})
