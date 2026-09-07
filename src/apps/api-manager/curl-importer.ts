import type { ApiItem } from './defaults'
import { HTTP_METHODS, type RequestFormField } from './request-body'

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
  bodyMode?: 'form-data'
  formFields?: RequestFormField[]
  basicAuth?: {
    username: string
    password: string
  }
}

const SUPPORTED_METHODS = new Set<ApiItem['method']>(HTTP_METHODS)

function tokenizeCurl(command: string): string[] {
  const input = command.replace(/\\\r?\n/g, ' ')
  const tokens: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let escaping = false
  let started = false

  const push = () => {
    if (!started) return
    tokens.push(current)
    current = ''
    started = false
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
      started = true
      continue
    }
    if (/\s/.test(character)) push()
    else {
      current += character
      started = true
    }
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('cURL 命令中的引号没有闭合')
  push()
  return tokens
}

/** 分号只在引号外分隔字段属性，文件名中的引号和反斜杠保留到下一步解码。 */
function splitFormAttributes(content: string): string[] {
  const parts: string[] = []
  let quoted = false
  let start = 0
  for (let index = 0; index < content.length; index++) {
    const character = content[index]
    if (quoted && character === '\\') {
      index++
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ';' && !quoted) {
      parts.push(content.slice(start, index))
      start = index + 1
    }
  }
  if (quoted) throw new Error('表单文件字段中的引号没有闭合')
  parts.push(content.slice(start))
  return parts
}

function unquoteFormValue(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value
  return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
}

function parseForm(value: string, literal: boolean): RequestFormField {
  const equal = value.indexOf('=')
  if (equal < 1) throw new Error('表单字段需要 name=value 格式')
  const name = value.slice(0, equal)
  const content = value.slice(equal + 1)
  if (literal) return { id: crypto.randomUUID(), name, value: content, type: 'text', enabled: true }
  const [source, ...attributes] = splitFormAttributes(content)
  if (source.startsWith('<') || source.startsWith('(') || source === ')') {
    throw new Error('暂不支持表单文件转文本或嵌套 multipart，请改为普通文本或单文件字段')
  }
  const field: RequestFormField = {
    id: crypto.randomUUID(),
    name,
    value: source,
    type: 'text',
    enabled: true,
  }
  if (source.startsWith('@')) {
    const rawPath = source.slice(1)
    const path = unquoteFormValue(rawPath)
    const quotedPath = rawPath.startsWith('"') && rawPath.endsWith('"')
    if (!path || path === '-' || (!quotedPath && path.includes(',')))
      throw new Error('每个文件字段需指定一个文件；多文件请重复 -F')
    field.type = 'file'
    field.value = path
  }
  for (const attribute of attributes) {
    if (field.type !== 'file') throw new Error('带分号的普通文本请使用 --form-string')
    const [key, ...parts] = attribute.split('=')
    const data = unquoteFormValue(parts.join('='))
    if (key === 'type' && data) field.contentType = data
    else if (key === 'filename' && data) field.filename = data
    else throw new Error(`暂不支持表单修饰符：${key}`)
  }
  return field
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
  let head = false
  let basicAuth: ParsedCurlRequest['basicAuth']
  const headers: ParsedCurlHeader[] = []
  const dataParts: string[] = []
  const formFields: RequestFormField[] = []

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const { name, inlineValue } = /^-[XHFduAb].+/.test(token)
      ? { name: token.slice(0, 2), inlineValue: token.slice(2) }
      : splitLongOption(token)

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
      if (name !== '--data-raw' && result.value.startsWith('@'))
        throw new Error('文件请求体请使用 -F 并在页面重新选择文件')
      if (name === '--data-urlencode') {
        const equal = result.value.indexOf('=')
        if (equal < 0 && result.value.includes('@'))
          throw new Error('暂不支持从本机文件读取 data-urlencode')
        dataParts.push(
          equal < 0
            ? encodeURIComponent(result.value)
            : `${result.value.slice(0, equal)}=${encodeURIComponent(result.value.slice(equal + 1))}`,
        )
      } else dataParts.push(result.value)
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
    if (name === '-I' || name === '--head') {
      head = true
      continue
    }
    if (name === '-F' || name === '--form' || name === '--form-string') {
      const result = takeOptionValue(tokens, index, inlineValue)
      formFields.push(parseForm(result.value, name === '--form-string'))
      index = result.nextIndex
      continue
    }
    if (!token.startsWith('-') && looksLikeRequestUrl(token)) url = token
  }

  if (!url) throw new Error('cURL 命令中没有找到 http(s) 请求地址')

  const body = dataParts.join('&')
  if (formFields.length && (dataParts.length || forceGet || head))
    throw new Error('multipart 不能与 --data、--get 或 --head 混用')
  const method = (explicitMethod ||
    (head
      ? 'HEAD'
      : forceGet
        ? 'GET'
        : dataParts.length || formFields.length
          ? 'POST'
          : 'GET')) as ApiItem['method']
  if (!SUPPORTED_METHODS.has(method)) {
    throw new Error('暂不支持 ' + (method || '未知') + ' 请求方法')
  }

  const finalUrl = forceGet ? appendQuery(url, body) : url
  if (
    dataParts.length &&
    !forceGet &&
    !headers.some((header) => header.name.toLowerCase() === 'content-type')
  )
    setHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded')
  if (formFields.length && ['GET', 'HEAD'].includes(method))
    throw new Error('浏览器的 GET/HEAD 请求不能携带 multipart')
  return {
    url: finalUrl,
    method,
    headers,
    body: forceGet || method === 'HEAD' ? '' : body,
    ...(formFields.length ? { bodyMode: 'form-data' as const, formFields } : {}),
    suggestedName: suggestName(method, finalUrl),
    ...(basicAuth ? { basicAuth } : {}),
  }
}
