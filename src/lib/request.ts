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
  const { method = 'GET', body, headers = {}, auth = true, signal, timeoutMs = 0 } = config

  const fetchHeaders: Record<string, string> = { ...headers }
  const requestToken = auth ? getAuthToken() : null

  if (auth) {
    const token = requestToken
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
    if (
      res.status === 401 &&
      requestToken &&
      requestToken === getAuthToken() &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('vc:auth-expired', { detail: requestToken }))
    }

    let json: ApiResponse<T>
    try {
      json = await res.json()
    } catch {
      throw new ApiError('服务器响应格式错误', 'PARSE_ERROR', res.status)
    }

    // 兜底：JSON 合法但不是对象（如 `null` / 数字）时，下面读 success 会抛 TypeError，
    // 那会被当成网络故障，报出与事实不符的提示。
    if (json === null || typeof json !== 'object') {
      throw new ApiError('服务器响应格式错误', 'PARSE_ERROR', res.status)
    }

    // 同时检查 HTTP 状态码和业务 success 字段，避免后端错误响应（无 success 字段）被当成成功
    if (!res.ok || json.success === false) {
      throw new ApiError(
        json.error || json.message || `请求失败 (${res.status})`,
        json.code,
        res.status,
      )
    }

    return json as T
  } catch (error) {
    if (timedOut) throw new ApiError('请求超时，请稍后重试', 'TIMEOUT', 408)
    // fetch 只在网络层没连上时才 reject（断网、DNS 失败、后端没启动、被 CORS 拦下）。
    // 此时浏览器给的是英文 TypeError('Failed to fetch')，Safari 甚至是 'Load failed'，
    // 而调用方普遍是 `showToast('error', e.message)` —— 直接冒泡就是把一句英文丢给用户。
    if (error instanceof TypeError) {
      throw new ApiError('网络连接失败，请检查网络或确认服务已启动', 'NETWORK_ERROR', 0)
    }
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
