import { api } from '@/lib/request'

export type WestockEngine = 'data' | 'screen'
export type WestockKind = 'json' | 'table' | 'text'

export interface WestockTableRow {
  [key: string]: string
}

export interface WestockResult {
  success: boolean
  engine: WestockEngine
  args: string[]
  kind: WestockKind
  data?: unknown
  title?: string
  meta?: string
  columns?: string[]
  rows?: WestockTableRow[]
  text?: string
  stdout?: string
  error?: string
}

export interface WestockCatalogCommand {
  id: string
  engine: WestockEngine
  label: string
  desc: string
  example: string
}

export interface WestockCatalog {
  success: boolean
  engines: WestockEngine[]
  commands: WestockCatalogCommand[]
}

/** 通用执行器：直接拼接参数 spawn westock CLI，覆盖全部命令。 */
export async function westockExec(
  engine: WestockEngine,
  args: string[],
): Promise<WestockResult> {
  return api.post<WestockResult>('/api/westock/exec', { engine, args })
}

/** 命名接口：把 query 参数转成 westock 命令（薄封装到通用执行器）。 */
export async function westockCommand(
  command: string,
  params: Record<string, string> = {},
): Promise<WestockResult> {
  const query = new URLSearchParams(params).toString()
  const path = `/api/westock/${encodeURIComponent(command)}${query ? `?${query}` : ''}`
  return api.get<WestockResult>(path)
}

/** 命令目录：供面板动态渲染快捷入口。 */
export async function fetchWestockCatalog(): Promise<WestockCatalog> {
  return api.get<WestockCatalog>('/api/westock/catalog')
}

/**
 * 判断异常是否为「未登录 / 登录已过期」。
 * westock 接口都会 spawn 子进程，因此整体要求登录，未登录时面板需要给出登录入口
 * 而不是只显示一句报错。
 */
export function isWestockAuthError(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 401
}
