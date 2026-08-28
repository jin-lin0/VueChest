import {
  applyAuth,
  evaluateResponseExtractions,
  resolvedHeaders,
  type ExtractionResult,
} from './collection-runner'
import type { ApiItem } from './defaults'
import { buildRequestUrl, evaluateAssertions, formatBytes, resolveVariables } from './request-utils'
import type { SavedRequest, SavedRequestRun } from './types'
import type { RuntimeVariableRecord } from './collection-workspace'

export const MAX_PREVIEW_BYTES = 512 * 1024
export const REQUEST_TIMEOUT_MS = 20_000

export interface ParsedResponseBody {
  data: unknown
  imageUrl?: string
  truncated: boolean
  size: number
}

interface RequestExecutorDependencies {
  fetch: typeof globalThis.fetch
  now: () => number
  timeoutSignal: (milliseconds: number) => AbortSignal
}

const defaultDependencies: RequestExecutorDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  now: () => performance.now(),
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
}

export async function parseResponseBody(
  response: Response,
  contentType: string,
  maxPreviewBytes = MAX_PREVIEW_BYTES,
): Promise<ParsedResponseBody> {
  if (contentType.startsWith('image/')) {
    const blob = await response.blob()
    return {
      data: null,
      imageUrl: URL.createObjectURL(blob),
      truncated: false,
      size: blob.size,
    }
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let truncated = false
  let text = ''

  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.length
      const remaining = maxPreviewBytes - (received - value.length)
      text += decoder.decode(value.slice(0, Math.max(0, remaining)), { stream: true })
      if (received >= maxPreviewBytes) {
        truncated = true
        await reader.cancel()
        break
      }
    }
    text += decoder.decode()
  } else {
    text = await response.text()
    received = new TextEncoder().encode(text).length
    if (received > maxPreviewBytes) {
      text = new TextDecoder().decode(new TextEncoder().encode(text).slice(0, maxPreviewBytes))
      truncated = true
    }
  }

  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // 非 JSON 响应按原始文本展示。
  }
  return { data, truncated, size: received }
}

function errorMessage(reason: unknown, timeoutMs: number): string {
  if (reason instanceof DOMException && reason.name === 'TimeoutError') {
    return `请求超过 ${Math.round(timeoutMs / 1000)} 秒，已自动取消`
  }
  if (reason instanceof TypeError) {
    return '浏览器未能完成请求，请检查网络、URL 与目标服务的 CORS 配置'
  }
  return reason instanceof Error ? reason.message : '请求失败'
}

export async function runSavedRequest(
  saved: SavedRequest,
  api: ApiItem | undefined,
  variables: RuntimeVariableRecord[],
  dependencies: Partial<RequestExecutorDependencies> = {},
): Promise<SavedRequestRun> {
  if (!api) {
    return {
      result: {
        id: saved.id,
        name: saved.name,
        time: 0,
        ok: false,
        testsPassed: 0,
        testsTotal: 0,
        request: { method: 'GET', url: '', headers: {}, body: '' },
        assertions: [],
        extractions: [],
        error: '原始 API 已不存在',
      },
      extracted: [],
    }
  }

  const executor = { ...defaultDependencies, ...dependencies }
  const startedAt = executor.now()
  const timeoutMs = saved.timeoutMs || REQUEST_TIMEOUT_MS
  let requestSnapshot = {
    method: api.method,
    url: api.url,
    headers: {} as Record<string, string>,
    body: '',
  }

  try {
    const rawUrl = resolveVariables(buildRequestUrl(api, saved.paramValues), variables)
    const baseHeaders = resolvedHeaders(saved.headers, variables)
    const authenticated = applyAuth(rawUrl, baseHeaders, saved.auth || { type: 'none' }, variables)
    const body = resolveVariables(saved.body, variables)
    const hasBody = api.method !== 'GET' && body.trim() !== ''
    const hasContentType = Object.keys(authenticated.headers).some(
      (name) => name.toLowerCase() === 'content-type',
    )
    if (hasBody && !hasContentType) authenticated.headers['Content-Type'] = 'application/json'
    requestSnapshot = {
      method: api.method,
      url: authenticated.url,
      headers: { ...authenticated.headers },
      body: hasBody ? body : '',
    }

    let response: Response | null = null
    const attempts = Math.min(3, Math.max(0, saved.retryCount || 0)) + 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await executor.fetch(authenticated.url, {
          method: api.method,
          headers: authenticated.headers,
          body: hasBody ? body : undefined,
          signal: executor.timeoutSignal(timeoutMs),
        })
        if (response.status < 500 || attempt === attempts - 1) break
        await response.body?.cancel()
      } catch (reason) {
        if (attempt === attempts - 1) throw reason
      }
    }
    if (!response) throw new Error('请求没有返回响应')

    const contentType = response.headers.get('content-type') || ''
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value
    })

    let text = ''
    let previewBody = ''
    let size = 0
    let truncated = false
    if (contentType.startsWith('image/') || contentType.includes('application/octet-stream')) {
      const binary = await response.arrayBuffer()
      size = binary.byteLength
      previewBody = `[二进制响应 · ${contentType || '未知类型'} · ${formatBytes(size)}]`
    } else {
      text = await response.text()
      const encoded = new TextEncoder().encode(text)
      size = encoded.byteLength
      truncated = size > MAX_PREVIEW_BYTES
      previewBody = truncated
        ? new TextDecoder().decode(encoded.slice(0, MAX_PREVIEW_BYTES))
        : text
    }

    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      // 非 JSON 响应仍可执行文本断言。
    }
    const elapsed = Math.round(executor.now() - startedAt)
    const assertions = evaluateAssertions(saved.assertions, {
      status: response.status,
      time: elapsed,
      body: text,
    })
    const extractions = evaluateResponseExtractions(data, saved.extractions || [])
    const extracted = extractions
      .filter(
        (item): item is ExtractionResult & { value: string } =>
          item.passed && item.value !== undefined,
      )
      .map((item) => ({ variable: item.variable, value: item.value }))

    return {
      result: {
        id: saved.id,
        name: saved.name,
        status: response.status,
        statusText: response.statusText,
        time: elapsed,
        ok: response.ok && assertions.every((item) => item.passed),
        testsPassed: assertions.filter((item) => item.passed).length,
        testsTotal: assertions.length,
        request: requestSnapshot,
        response: {
          headers: responseHeaders,
          body: previewBody,
          contentType,
          size,
          truncated,
        },
        assertions,
        extractions,
      },
      extracted,
    }
  } catch (reason) {
    return {
      result: {
        id: saved.id,
        name: saved.name,
        time: Math.round(executor.now() - startedAt),
        ok: false,
        testsPassed: 0,
        testsTotal: saved.assertions.filter((item) => item.enabled).length,
        request: requestSnapshot,
        assertions: [],
        extractions: [],
        error: errorMessage(reason, timeoutMs),
      },
      extracted: [],
    }
  }
}
