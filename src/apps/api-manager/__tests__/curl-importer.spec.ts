import { describe, expect, it } from 'vitest'
import { parseCurlCommand } from '../curl-importer'

describe('cURL request importer', () => {
  it('解析浏览器复制的多行 POST cURL', () => {
    const result = parseCurlCommand(
      [
        "curl 'https://api.example.com/v1/users'",
        "  -H 'Content-Type: application/json'",
        "  -H 'Authorization: Bearer token'",
        '  --data-raw \'{"name":"Codex User"}\'',
      ].join(' \\\n'),
    )

    expect(result).toEqual({
      url: 'https://api.example.com/v1/users',
      method: 'POST',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Authorization', value: 'Bearer token' },
      ],
      body: '{"name":"Codex User"}',
      suggestedName: 'POST /v1/users',
    })
  })

  it('支持显式方法、长参数等号写法和环境变量地址', () => {
    const result = parseCurlCommand(
      'curl --request=PATCH --url={{baseUrl}}/users/1 --header=Accept:application/json',
    )

    expect(result.method).toBe('PATCH')
    expect(result.url).toBe('{{baseUrl}}/users/1')
    expect(result.headers).toEqual([{ name: 'Accept', value: 'application/json' }])
  })

  it('把 curl -G 的数据追加到查询参数', () => {
    const result = parseCurlCommand(
      "curl -G 'https://api.example.com/search?lang=zh#result' --data 'q=vue' --data 'page=1'",
    )

    expect(result.method).toBe('GET')
    expect(result.url).toBe('https://api.example.com/search?lang=zh&q=vue&page=1#result')
    expect(result.body).toBe('')
  })

  it('解析 Basic Auth 并保留以短横线开头的请求体', () => {
    const result = parseCurlCommand(
      "curl https://api.example.com/session -u 'codex:p@ss:word' --data-raw '-1'",
    )

    expect(result.basicAuth).toEqual({ username: 'codex', password: 'p@ss:word' })
    expect(result.body).toBe('-1')
    expect(result.method).toBe('POST')
  })

  it('拒绝不完整或当前不支持的命令', () => {
    expect(() => parseCurlCommand('wget https://api.example.com')).toThrow('命令需要以 curl 开头')
    expect(() => parseCurlCommand("curl -F 'file=@demo.png' https://api.example.com")).toThrow(
      '暂不支持 multipart 表单',
    )
    expect(() => parseCurlCommand('curl -X HEAD https://api.example.com')).toThrow(
      '暂不支持 HEAD 请求方法',
    )
  })
})
