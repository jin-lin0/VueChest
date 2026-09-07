import type { ApiItem } from './defaults'
import { resolveVariables, type EnvironmentVariable } from './request-utils'

export type RequestBodyMode = 'raw' | 'form-data'
/** 只持久化字段描述；文件内容保留在当前页面内存中。 */
export interface RequestFormField {
  id: string
  name: string
  value: string
  type: 'text' | 'file'
  enabled: boolean
  filename?: string
  contentType?: string
}
export type RequestFiles = Record<string, File>
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export const canSendBody = (method: ApiItem['method']) => !['GET', 'HEAD'].includes(method)

interface RequestBodyOptions {
  method: ApiItem['method']
  body: string
  bodyMode?: RequestBodyMode
  formFields?: RequestFormField[]
  files?: RequestFiles
  variables?: EnvironmentVariable[]
  headers?: Record<string, string>
}

export function prepareRequestBody({
  method,
  body: raw,
  bodyMode = 'raw',
  formFields = [],
  files = {},
  variables = [],
  headers: initialHeaders = {},
}: RequestBodyOptions): {
  body: BodyInit | undefined
  headers: Record<string, string>
  preview: string
} {
  const headers = { ...initialHeaders }
  if (!canSendBody(method)) return { body: undefined, headers, preview: '' }
  if (bodyMode === 'form-data') {
    const body = new FormData()
    const preview: string[] = []
    for (const field of formFields.filter((item) => item.enabled && item.name.trim())) {
      const name = resolveVariables(field.name, variables)
      if (field.type === 'file') {
        const file = files[field.id]
        if (!file) throw new Error(`请重新选择文件：${field.name}（${field.value || '未选择'}）`)
        const filename = resolveVariables(field.filename || file.name, variables)
        body.append(
          name,
          field.contentType
            ? file.slice(0, file.size, resolveVariables(field.contentType, variables))
            : file,
          filename,
        )
        preview.push(`${name} = [文件 ${filename} · ${file.size} B]`)
      } else {
        const value = resolveVariables(field.value, variables)
        body.append(name, value)
        preview.push(`${name} = ${value}`)
      }
    }
    // boundary 必须由浏览器根据本次 FormData 生成，不能复用导入的请求头。
    for (const key of Object.keys(headers))
      if (key.toLowerCase() === 'content-type') delete headers[key]
    return { body, headers, preview: preview.join('\n') }
  }
  const body = resolveVariables(raw, variables)
  if (body.trim() && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json'
  }
  return { body: body.trim() ? body : undefined, headers, preview: body.trim() ? body : '' }
}
