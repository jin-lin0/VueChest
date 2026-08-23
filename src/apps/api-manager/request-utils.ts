import type { ApiItem } from './defaults'

export interface RequestHeader {
  id: string
  name: string
  value: string
  enabled: boolean
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

export function buildCurlCommand(
  api: ApiItem,
  url: string,
  headers: RequestHeader[],
  body: string,
): string {
  const parts = [`curl --request ${api.method}`, quoteShell(url)]
  for (const [name, value] of Object.entries(getEnabledHeaders(headers))) {
    parts.push(`--header ${quoteShell(`${name}: ${value}`)}`)
  }
  if (!['GET', 'DELETE'].includes(api.method) && body.trim()) {
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
