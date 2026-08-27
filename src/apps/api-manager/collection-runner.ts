import { resolveVariables, type EnvironmentVariable, type RequestHeader } from './request-utils'

export type AuthConfig =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; name: string; value: string; location: 'header' | 'query' }
  | { type: 'basic'; username: string; password: string }

export interface ExtractionRule {
  id: string
  path: string
  variable: string
  enabled: boolean
}

export function applyAuth(
  url: string,
  headers: Record<string, string>,
  auth: AuthConfig,
  variables: EnvironmentVariable[],
) {
  const resultHeaders = { ...headers }
  let resultUrl = url
  if (auth.type === 'bearer') {
    resultHeaders.Authorization = `Bearer ${resolveVariables(auth.token, variables)}`
  } else if (auth.type === 'basic') {
    const username = resolveVariables(auth.username, variables)
    const password = resolveVariables(auth.password, variables)
    resultHeaders.Authorization = `Basic ${btoa(`${username}:${password}`)}`
  } else if (auth.type === 'api-key') {
    const name = resolveVariables(auth.name, variables)
    const value = resolveVariables(auth.value, variables)
    if (auth.location === 'header') resultHeaders[name] = value
    else {
      const parsed = new URL(resultUrl)
      parsed.searchParams.set(name, value)
      resultUrl = parsed.toString()
    }
  }
  return { url: resultUrl, headers: resultHeaders }
}

export function getJsonPath(value: unknown, path: string): unknown {
  const normalized = path.trim().replace(/^\$\.?/, '')
  if (!normalized) return value
  const parts = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let current = value
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function extractResponseVariables(data: unknown, rules: ExtractionRule[]) {
  return rules
    .filter((rule) => rule.enabled && rule.variable.trim() && rule.path.trim())
    .map((rule) => ({
      variable: rule.variable.trim(),
      value: getJsonPath(data, rule.path),
    }))
    .filter((item) => item.value !== undefined)
    .map((item) => ({
      variable: item.variable,
      value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value),
    }))
}

export function resolvedHeaders(headers: RequestHeader[], variables: EnvironmentVariable[]) {
  return Object.fromEntries(
    headers
      .filter((header) => header.enabled && header.name.trim())
      .map((header) => [
        resolveVariables(header.name.trim(), variables),
        resolveVariables(header.value, variables),
      ]),
  )
}
