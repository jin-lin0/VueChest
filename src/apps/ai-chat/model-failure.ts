import type { ModelOption } from './config'

export interface ModelFailureNotice {
  message: string
  failedModelId: string
  failedModelName: string
  suggestedModel: ModelOption | null
}

const SWITCHABLE_CODES = new Set([
  'NETWORK_ERROR',
  'INCOMPLETE_STREAM',
  'STREAM_INTERRUPTED',
  'RATE_LIMIT',
  'QUOTA_EXHAUSTED',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_NETWORK',
  'AI_TIMEOUT',
  'EMPTY_RESPONSE',
  'MODEL_NOT_ALLOWED',
  'UPSTREAM_ERROR',
  'AI_STREAM_ERROR',
  'AI_REQUEST_FAILED',
])

function failureReason(code: string) {
  switch (code) {
    case 'INCOMPLETE_STREAM':
    case 'STREAM_INTERRUPTED':
    case 'NETWORK_ERROR':
      return '连接中断，未收到完整响应'
    case 'RATE_LIMIT':
      return '当前请求过多，已触发频率限制'
    case 'QUOTA_EXHAUSTED':
      return '当前免费额度暂时不可用'
    case 'UPSTREAM_UNAVAILABLE':
    case 'UPSTREAM_NETWORK':
      return '上游服务暂时不可用'
    case 'AI_TIMEOUT':
      return '响应超时'
    case 'EMPTY_RESPONSE':
      return '没有返回有效内容'
    case 'MODEL_NOT_ALLOWED':
      return '已不在当前可用模型列表中'
    case 'CONTEXT_TOO_LONG':
      return '无法处理当前对话：上下文过长，请新建对话或精简内容'
    case 'CONTENT_REJECTED':
      return '拒绝了当前内容，请调整问题后重试'
    default:
      return '请求失败'
  }
}

function standaloneMessage(code: string) {
  switch (code) {
    case 'UPSTREAM_AUTH':
      return 'AI 平台配置异常，请联系管理员检查 API Key。'
    case 'UNAUTHORIZED':
    case 'TOKEN_EXPIRED':
    case 'SESSION_REVOKED':
      return '登录状态已失效，请重新登录。'
    case 'PERSISTENCE_FAILED':
      return '回答已生成，但保存会话失败，请刷新后检查记录。'
    case 'INVALID_REPLACEMENT':
    case 'VALIDATION':
      return '当前操作状态已变化，请刷新会话后重试。'
    case 'FORBIDDEN':
      return '无权访问当前会话。'
    default:
      return ''
  }
}

export function findNextAvailableModel(
  models: ModelOption[],
  failedModelId: string,
): ModelOption | null {
  if (models.length < 2) return null
  const failedIndex = models.findIndex((model) => model.id === failedModelId)
  const ordered =
    failedIndex >= 0 ? [...models.slice(failedIndex + 1), ...models.slice(0, failedIndex)] : models
  return ordered.find((model) => model.id !== failedModelId && model.health !== 'cooldown') ?? null
}

export function resolveModelFailure(
  models: ModelOption[],
  failedModelId: string,
  code = 'AI_STREAM_ERROR',
): ModelFailureNotice {
  const failedModel = models.find((model) => model.id === failedModelId)
  const failedModelName = failedModel?.name || failedModelId || '当前模型'
  const standalone = standaloneMessage(code)
  if (standalone) {
    return {
      message: standalone,
      failedModelId,
      failedModelName,
      suggestedModel: null,
    }
  }
  const suggestedModel = SWITCHABLE_CODES.has(code)
    ? findNextAvailableModel(models, failedModelId)
    : null
  const base = `模型「${failedModelName}」${failureReason(code)}`
  const message = suggestedModel
    ? `${base}。建议切换到「${suggestedModel.name}」后重试。`
    : `${base}。`

  return { message, failedModelId, failedModelName, suggestedModel }
}
