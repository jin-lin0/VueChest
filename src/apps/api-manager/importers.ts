/* eslint-disable @typescript-eslint/no-explicit-any -- imported API schemas are intentionally dynamic */
import { load as loadYaml } from 'js-yaml'
import type { ApiItem } from './defaults'
import type { RequestHeader } from './request-utils'

export interface ImportedRequest {
  api: ApiItem
  name: string
  headers: RequestHeader[]
  body: string
}

export interface ApiImportResult {
  format: 'openapi' | 'postman'
  name: string
  requests: ImportedRequest[]
  variables: Array<{ key: string; value: string }>
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}
}

function parseDocument(text: string): Record<string, any> {
  try {
    return objectValue(JSON.parse(text))
  } catch {
    return objectValue(loadYaml(text))
  }
}

function header(name: string, value: string): RequestHeader {
  return { id: crypto.randomUUID(), name, value, enabled: true }
}

function requestBodyExample(requestBody: any): string {
  const content = objectValue(requestBody?.content)
  const media = content['application/json'] || Object.values(content)[0]
  if (!media) return ''
  const value = media.example ?? media.examples?.default?.value ?? media.schema?.example
  return value === undefined ? '' : JSON.stringify(value, null, 2)
}

function importOpenApi(document: Record<string, any>): ApiImportResult {
  const title = String(document.info?.title || 'OpenAPI 导入')
  const server = String(document.servers?.[0]?.url || '')
  const requests: ImportedRequest[] = []
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const

  for (const [path, pathItemValue] of Object.entries(objectValue(document.paths))) {
    const pathItem = objectValue(pathItemValue)
    for (const method of methods) {
      const operation = objectValue(pathItem[method])
      if (!Object.keys(operation).length) continue
      const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])]
      const api: ApiItem = {
        id: crypto.randomUUID(),
        name: String(
          operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
        ),
        url: `${server}${path}`,
        method: method.toUpperCase() as ApiItem['method'],
        category: String(operation.tags?.[0] || title),
        description: String(operation.description || operation.summary || 'OpenAPI 导入请求'),
        params: parameters
          .filter((item: any) => item?.in === 'query' || item?.in === 'path')
          .map((item: any) => ({
            name: String(item.name || ''),
            type: ['number', 'integer'].includes(item.schema?.type)
              ? ('number' as const)
              : item.schema?.type === 'boolean'
                ? ('boolean' as const)
                : ('string' as const),
            defaultValue: String(item.example ?? item.schema?.default ?? ''),
            required: item.in === 'path' || item.required === true,
            description: String(item.description || ''),
          })),
        auth: operation.security?.length || document.security?.length ? 'api-key' : 'none',
        cors: 'unknown',
        userCreated: true,
        createdAt: new Date().toISOString(),
      }
      const body = requestBodyExample(operation.requestBody)
      requests.push({
        api,
        name: api.name,
        headers: body ? [header('Content-Type', 'application/json')] : [],
        body,
      })
    }
  }
  if (!requests.length) throw new Error('OpenAPI 文档中没有可导入的请求')
  return { format: 'openapi', name: title, requests, variables: [] }
}

function postmanUrl(value: any): string {
  if (typeof value === 'string') return value
  if (typeof value?.raw === 'string') return value.raw
  const protocol = value?.protocol ? `${value.protocol}://` : ''
  const host = Array.isArray(value?.host) ? value.host.join('.') : value?.host || ''
  const path = Array.isArray(value?.path) ? `/${value.path.join('/')}` : value?.path || ''
  return `${protocol}${host}${path}`
}

function importPostman(document: Record<string, any>): ApiImportResult {
  const title = String(document.info?.name || 'Postman 导入')
  const requests: ImportedRequest[] = []
  function visit(items: any[], folders: string[] = []) {
    for (const item of items || []) {
      if (Array.isArray(item?.item)) {
        visit(item.item, [...folders, String(item.name || '分组')])
        continue
      }
      const request = objectValue(item?.request)
      if (!Object.keys(request).length) continue
      const method = String(request.method || 'GET').toUpperCase()
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue
      const rawUrl = postmanUrl(request.url)
      const query = Array.isArray(request.url?.query) ? request.url.query : []
      const url = query.length ? rawUrl.replace(/\?[^#]*/, '') : rawUrl
      const api: ApiItem = {
        id: crypto.randomUUID(),
        name: String(item.name || `${method} ${url}`),
        url,
        method: method as ApiItem['method'],
        category: folders.at(-1) || title,
        description: String(request.description || 'Postman Collection 导入请求'),
        params: query.map((param: any) => ({
          name: String(param.key || ''),
          type: 'string' as const,
          defaultValue: String(param.value || ''),
          required: false,
          description: String(param.description || ''),
        })),
        auth: request.auth?.type ? 'api-key' : 'none',
        cors: 'unknown',
        userCreated: true,
        createdAt: new Date().toISOString(),
      }
      requests.push({
        api,
        name: api.name,
        headers: (request.header || []).map((item: any) =>
          header(String(item.key || ''), String(item.value || '')),
        ),
        body: String(request.body?.raw || ''),
      })
    }
  }
  visit(document.item || [])
  if (!requests.length) throw new Error('Postman Collection 中没有可导入的请求')
  return {
    format: 'postman',
    name: title,
    requests,
    variables: (document.variable || []).map((item: any) => ({
      key: String(item.key || ''),
      value: String(item.value || ''),
    })),
  }
}

export function importApiDocument(text: string): ApiImportResult {
  const document = parseDocument(text)
  if (typeof document.openapi === 'string' && document.openapi.startsWith('3.')) {
    return importOpenApi(document)
  }
  if (document.info?._postman_id || String(document.info?.schema || '').includes('postman')) {
    return importPostman(document)
  }
  throw new Error('仅支持 OpenAPI 3.x 或 Postman Collection v2 文档')
}
