import type { ApiItem } from './defaults'
import type { RequestBodyMode, RequestFormField } from './request-body'

export interface RequestHeader {
  id: string
  name: string
  value: string
  enabled: boolean
}

export interface EnvironmentVariable {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface AssertionRule {
  id: string
  type: 'status' | 'time' | 'body-includes'
  expected: string
  enabled: boolean
}

export interface AssertionResult {
  id: string
  passed: boolean
  label: string
  detail: string
}

export function resolveVariables(text: string, variables: EnvironmentVariable[]): string {
  const values = new Map(
    variables
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => [item.key.trim(), item.value]),
  )
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) =>
    values.has(key) ? values.get(key)! : match,
  )
}

export function evaluateAssertions(
  rules: AssertionRule[],
  response: { status: number; time: number; body: string },
): AssertionResult[] {
  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      if (rule.type === 'status') {
        const expected = Number(rule.expected)
        const passed = Number.isFinite(expected) && response.status === expected
        return {
          id: rule.id,
          passed,
          label: `状态码等于 ${rule.expected || '--'}`,
          detail: `实际 ${response.status}`,
        }
      }
      if (rule.type === 'time') {
        const expected = Number(rule.expected)
        const passed = Number.isFinite(expected) && response.time < expected
        return {
          id: rule.id,
          passed,
          label: `响应耗时小于 ${rule.expected || '--'} ms`,
          detail: `实际 ${response.time} ms`,
        }
      }
      const passed = Boolean(rule.expected) && response.body.includes(rule.expected)
      return {
        id: rule.id,
        passed,
        label: `响应包含「${rule.expected || '--'}」`,
        detail: passed ? '已找到目标文本' : '未找到目标文本',
      }
    })
}

function getParamValue(param: ApiItem['params'][number], values: Record<string, string>): string {
  const value = values[param.name]
  return value !== undefined && value !== '' ? value : param.defaultValue
}

/** 构建最终请求地址：URL 占位符用于路径/已有查询项，其余参数自动追加到查询串。 */
export function buildRequestUrl(api: ApiItem, values: Record<string, string>): string {
  let url = api.url

  for (const param of api.params) {
    const placeholder = `{${param.name}}`
    if (!url.includes(placeholder)) continue
    const value = getParamValue(param, values)
    url = url.split(placeholder).join(value === '' ? '' : encodeURIComponent(value))
  }

  // 清理空的可选查询参数，同时保留 hash。
  url = url
    .replace(/[?&][^=&?#]+=(?=&|$|#)/g, (segment) => (segment.startsWith('?') ? '?' : ''))
    .replace(/\?&/, '?')
    .replace(/[?&](?=#|$)/, '')

  const extraParams = api.params.filter((param) => !api.url.includes(`{${param.name}}`))
  if (extraParams.length === 0) return url

  const [baseWithQuery, hash = ''] = url.split('#', 2)
  const query = new URLSearchParams()
  for (const param of extraParams) {
    const value = getParamValue(param, values)
    if (value !== '') query.append(param.name, value)
  }

  const serialized = query.toString()
  if (!serialized) return url
  const separator = baseWithQuery.includes('?') ? '&' : '?'
  return `${baseWithQuery}${separator}${serialized}${hash ? `#${hash}` : ''}`
}

export function getEnabledHeaders(headers: RequestHeader[]): Record<string, string> {
  return Object.fromEntries(
    headers
      .filter((header) => header.enabled && header.name.trim())
      .map((header) => [header.name.trim(), header.value]),
  )
}

function quoteShell(value: string): string {
  return `'${value.split("'").join("'\\''")}'`
}

function curlFormFile(field: RequestFormField): string {
  const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  const parts = [`@${quote(field.value)}`]
  if (field.filename) parts.push(`filename=${quote(field.filename)}`)
  if (field.contentType) parts.push(`type=${field.contentType}`)
  return parts.join(';')
}

export function buildCurlCommand(
  api: ApiItem,
  url: string,
  headers: RequestHeader[],
  body: string,
  bodyMode: RequestBodyMode = 'raw',
  formFields: RequestFormField[] = [],
): string {
  const parts = [`curl --request ${api.method}`, quoteShell(url)]
  const enabled = getEnabledHeaders(headers)
  if (
    bodyMode === 'raw' &&
    !['GET', 'HEAD'].includes(api.method) &&
    body.trim() &&
    !Object.keys(enabled).some((key) => key.toLowerCase() === 'content-type')
  )
    enabled['Content-Type'] = 'application/json'
  for (const [name, value] of Object.entries(enabled)) {
    if (bodyMode === 'form-data' && name.toLowerCase() === 'content-type') continue
    parts.push(`--header ${quoteShell(`${name}: ${value}`)}`)
  }
  if (!['GET', 'HEAD'].includes(api.method) && bodyMode === 'form-data') {
    for (const field of formFields.filter((item) => item.enabled && item.name.trim())) {
      const value = field.type === 'file' ? curlFormFile(field) : field.value
      parts.push(
        `${field.type === 'file' ? '--form' : '--form-string'} ${quoteShell(`${field.name}=${value}`)}`,
      )
    }
  } else if (!['GET', 'HEAD'].includes(api.method) && body.trim()) {
    parts.push(`--data-raw ${quoteShell(body)}`)
  }
  return parts.join(' \\\n  ')
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function inferApiAccess(api: ApiItem): {
  authLabel: string
  corsLabel: string
  verified: boolean
} {
  const description = api.description.toLowerCase()
  const inferredNoAuth = /无需\s*key|免\s*key|no\s*key/.test(description)
  const inferredCors = description.includes('cors')

  return {
    authLabel:
      api.auth === 'none' || inferredNoAuth
        ? '无需 Key'
        : api.auth === 'optional'
          ? '可选鉴权'
          : api.auth === 'api-key'
            ? '需要 Key'
            : '鉴权未知',
    corsLabel: api.cors === 'supported' || inferredCors ? '支持 CORS' : 'CORS 未知',
    verified: Boolean(api.docsUrl && api.cors === 'supported'),
  }
}

export function getStatusTone(status: number): string {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 400 && status < 500) return 'warning'
  if (status >= 500) return 'danger'
  return 'info'
}
