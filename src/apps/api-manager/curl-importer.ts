import type { ApiItem } from './defaults'

export interface ParsedCurlHeader {
  name: string
  value: string
}

export interface ParsedCurlRequest {
  url: string
  method: ApiItem['method']
  headers: ParsedCurlHeader[]
  body: string
  suggestedName: string
  basicAuth?: {
    username: string
    password: string
  }
}

const SUPPORTED_METHODS = new Set<ApiItem['method']>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

function tokenizeCurl(command: string): string[] {
  const input = command.replace(/\\\r?\n/g, ' ')
  const tokens: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let escaping = false

  const push = () => {
    if (!current) return
    tokens.push(current)
    current = ''
  }

  for (const character of input.trim()) {
    if (escaping) {
      current += character
      escaping = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaping = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (/\s/.test(character)) push()
    else current += character
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('cURL 命令中的引号没有闭合')
  push()
  return tokens
}

function takeOptionValue(tokens: string[], index: number, inlineValue?: string) {
  if (inlineValue !== undefined) return { value: inlineValue, nextIndex: index }
  const value = tokens[index + 1]
  if (value === undefined) {
    throw new Error('cURL 参数 ' + tokens[index] + ' 缺少值')
  }
  return { value, nextIndex: index + 1 }
}

function splitLongOption(token: string) {
  const equalIndex = token.indexOf('=')
  if (!token.startsWith('--') || equalIndex < 0) {
    return { name: token, inlineValue: undefined }
  }
  return {
    name: token.slice(0, equalIndex),
    inlineValue: token.slice(equalIndex + 1),
  }
}

function parseHeader(value: string): ParsedCurlHeader {
  const separator = value.indexOf(':')
  if (separator < 1) throw new Error('无法解析 Header：' + value)
  return {
    name: value.slice(0, separator).trim(),
    value: value.slice(separator + 1).trim(),
  }
}

function setHeader(headers: ParsedCurlHeader[], name: string, value: string) {
  const existing = headers.find((header) => header.name.toLowerCase() === name.toLowerCase())
  if (existing) existing.value = value
  else headers.push({ name, value })
}

function looksLikeRequestUrl(value: string) {
  return /^(https?:\/\/|{{\s*[\w.-]+\s*}})/i.test(value)
}

function appendQuery(url: string, data: string) {
  if (!data) return url
  const hashIndex = url.indexOf('#')
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const separator = base.includes('?') ? '&' : '?'
  return base + separator + data + hash
}

function suggestName(method: ApiItem['method'], url: string) {
  try {
    const normalized = url.replace(/^{{\s*[\w.-]+\s*}}/, 'https://workspace.local')
    const parsed = new URL(normalized)
    const path = parsed.pathname === '/' ? parsed.hostname : parsed.pathname
    return method + ' ' + path
  } catch {
    return method + ' 请求'
  }
}

export function parseCurlCommand(command: string): ParsedCurlRequest {
  const tokens = tokenizeCurl(command)
  if (!tokens.length) throw new Error('请粘贴 cURL 命令')
  if (!/^curl(?:\.exe)?$/i.test(tokens[0])) throw new Error('命令需要以 curl 开头')

  let url = ''
  let explicitMethod = ''
  let forceGet = false
  let basicAuth: ParsedCurlRequest['basicAuth']
  const headers: ParsedCurlHeader[] = []
  const dataParts: string[] = []

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const { name, inlineValue } = splitLongOption(token)

    if (name === '-X' || name === '--request') {
      const result = takeOptionValue(tokens, index, inlineValue)
      explicitMethod = result.value.toUpperCase()
      index = result.nextIndex
      continue
    }
    if (name === '--url') {
      const result = takeOptionValue(tokens, index, inlineValue)
      url = result.value
      index = result.nextIndex
      continue
    }
    if (name === '-H' || name === '--header') {
      const result = takeOptionValue(tokens, index, inlineValue)
      const header = parseHeader(result.value)
      setHeader(headers, header.name, header.value)
      index = result.nextIndex
      continue
    }
    if (
      name === '-d' ||
      name === '--data' ||
      name === '--data-raw' ||
      name === '--data-binary' ||
      name === '--data-urlencode'
    ) {
      const result = takeOptionValue(tokens, index, inlineValue)
      dataParts.push(result.value)
      index = result.nextIndex
      continue
    }
    if (name === '--json') {
      const result = takeOptionValue(tokens, index, inlineValue)
      dataParts.push(result.value)
      setHeader(headers, 'Content-Type', 'application/json')
      setHeader(headers, 'Accept', 'application/json')
      index = result.nextIndex
      continue
    }
    if (name === '-A' || name === '--user-agent') {
      const result = takeOptionValue(tokens, index, inlineValue)
      setHeader(headers, 'User-Agent', result.value)
      index = result.nextIndex
      continue
    }
    if (name === '-b' || name === '--cookie') {
      const result = takeOptionValue(tokens, index, inlineValue)
      setHeader(headers, 'Cookie', result.value)
      index = result.nextIndex
      continue
    }
    if (name === '-u' || name === '--user') {
      const result = takeOptionValue(tokens, index, inlineValue)
      const separator = result.value.indexOf(':')
      basicAuth = {
        username: separator >= 0 ? result.value.slice(0, separator) : result.value,
        password: separator >= 0 ? result.value.slice(separator + 1) : '',
      }
      index = result.nextIndex
      continue
    }
    if (name === '-G' || name === '--get') {
      forceGet = true
      continue
    }
    if (name === '-F' || name === '--form') {
      throw new Error('暂不支持 multipart 表单，请在完整编辑中配置请求体')
    }
    if (!token.startsWith('-') && looksLikeRequestUrl(token)) url = token
  }

  if (!url) throw new Error('cURL 命令中没有找到 http(s) 请求地址')

  const body = dataParts.join('&')
  const method = (forceGet ? 'GET' : explicitMethod || (body ? 'POST' : 'GET')) as ApiItem['method']
  if (!SUPPORTED_METHODS.has(method)) {
    throw new Error('暂不支持 ' + (method || '未知') + ' 请求方法')
  }

  const finalUrl = forceGet ? appendQuery(url, body) : url
  return {
    url: finalUrl,
    method,
    headers,
    body: forceGet ? '' : body,
    suggestedName: suggestName(method, finalUrl),
    ...(basicAuth ? { basicAuth } : {}),
  }
}
