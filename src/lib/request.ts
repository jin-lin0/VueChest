import { TOKEN_KEY } from '@/lib/constants'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/** 统一的鉴权 token 读取入口，避免各处硬编码 key（改名只改这一处） */
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
  [key: string]: unknown
}

class ApiError extends Error {
  code: string
  status: number
  constructor(message: string, code = 'UNKNOWN', status = 500) {
    super(message)
    this.code = code
    this.status = status
  }
}

interface RequestConfig {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  auth?: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

async function request<T = unknown>(path: string, config: RequestConfig = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    auth = true,
    signal,
    timeoutMs = 0,
  } = config

  const fetchHeaders: Record<string, string> = { ...headers }

  if (auth) {
    const token = getAuthToken()
    if (token) {
      fetchHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : undefined

  const fetchConfig: RequestInit = { method, headers: fetchHeaders, signal: controller.signal }

  if (body !== undefined && body !== null) {
    fetchHeaders['Content-Type'] = 'application/json'
    fetchConfig.body = JSON.stringify(body)
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, fetchConfig)

    let json: ApiResponse<T>
    try {
      json = await res.json()
    } catch {
      throw new ApiError('服务器响应格式错误', 'PARSE_ERROR', res.status)
    }

    // 同时检查 HTTP 状态码和业务 success 字段，避免后端错误响应（无 success 字段）被当成成功
    if (!res.ok || json.success === false) {
      throw new ApiError(json.error || `请求失败 (${res.status})`, json.code, res.status)
    }

    return json as T
  } catch (error) {
    if (timedOut) throw new ApiError('请求超时，请稍后重试', 'TIMEOUT', 408)
    throw error
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

const api = {
  get<T = unknown>(path: string, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'GET' })
  },
  post<T = unknown>(path: string, body?: unknown, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'POST', body })
  },
  put<T = unknown>(path: string, body?: unknown, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'PUT', body })
  },
  delete<T = unknown>(path: string, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'DELETE' })
  },
}

export { api }
