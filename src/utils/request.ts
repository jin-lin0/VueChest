export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
  [key: string]: any
}

export class ApiError extends Error {
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
  body?: any
  headers?: Record<string, string>
  auth?: boolean
}

async function request<T = any>(path: string, config: RequestConfig = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = config

  const fetchHeaders: Record<string, string> = { ...headers }

  if (auth) {
    const token = localStorage.getItem('admin_auth_token')
    if (token) {
      fetchHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  const fetchConfig: RequestInit = { method, headers: fetchHeaders }

  if (body !== undefined && body !== null) {
    fetchHeaders['Content-Type'] = 'application/json'
    fetchConfig.body = JSON.stringify(body)
  }

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
}

const api = {
  get<T = any>(path: string, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'GET' })
  },
  post<T = any>(path: string, body?: any, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'POST', body })
  },
  put<T = any>(path: string, body?: any, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'PUT', body })
  },
  delete<T = any>(path: string, config?: RequestConfig) {
    return request<T>(path, { ...config, method: 'DELETE' })
  },
}

export { api }
export default api
