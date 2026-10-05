/**
 * 通知展示层的纯函数工具。
 *
 * 这里刻意不引入任何浏览器 API / store：类型映射、相对时间、跳转地址推导
 * 都是「输入 → 输出」的纯计算，可以直接单测，组件与 store 只负责调用。
 */

/** 与服务端 services/notificationService.js#serializeNotification 返回结构保持一致 */
export interface AppNotification {
  id: number
  /** 形如 market.review.approved，未知类型应能优雅降级 */
  type: string
  title: string
  body: string
  /** 站内跳转地址，服务端可能给空串 */
  link: string
  appId: number | null
  meta: Record<string, unknown> | null
  read: boolean
  /** 毫秒时间戳（服务端已把 DATE 转成 getTime()） */
  createdAt: number
}

export interface NotificationPagination {
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export type NotificationTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

export interface NotificationPreset {
  icon: string
  label: string
  tone: NotificationTone
}

/** 服务端事件 → 前端展示语义的唯一映射表；新增通知类型只需在这里加一行 */
const TYPE_PRESETS: Record<string, NotificationPreset> = {
  'market.review.approved': { icon: '✅', label: '审核通过', tone: 'success' },
  'market.review.rejected': { icon: '⛔', label: '审核未通过', tone: 'danger' },
  'market.comment.reply': { icon: '💬', label: '收到回复', tone: 'info' },
  'market.comment.created': { icon: '💬', label: '新评论', tone: 'info' },
  'market.report.created': { icon: '🚩', label: '新举报', tone: 'warning' },
  'market.report.resolved': { icon: '🛡️', label: '举报处理结果', tone: 'neutral' },
}

const FALLBACK_PRESET: NotificationPreset = { icon: '🔔', label: '通知', tone: 'neutral' }

/**
 * 未知类型（例如服务端新增事件而前端还没发版）统一降级为通用铃铛，
 * 绝不抛错、也绝不显示空白，保证「旧前端 + 新后端」不会白屏。
 */
export function describeNotificationType(type: string): NotificationPreset {
  return TYPE_PRESETS[type] ?? FALLBACK_PRESET
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 绝对时间，用于 title / tooltip，避免只显示「3 天前」看不出具体时刻 */
export function formatAbsoluteTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/**
 * 相对时间。未来时间（客户端时钟慢于服务端）一律显示「刚刚」，
 * 而不是出现「-3 分钟前」这种明显是 bug 的文案。
 */
export function formatRelativeTime(createdAt: number, now: number = Date.now()): string {
  if (!Number.isFinite(createdAt)) return ''
  const diff = now - createdAt
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < WEEK) return `${Math.floor(diff / DAY)} 天前`
  const date = new Date(createdAt)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 解析跳转地址。服务端可能只给了 appId 而没给 link（例如未来新增的事件忘了填），
 * 此时兜底到应用详情页；两者都没有就回通知中心，避免出现「点了没反应」。
 */
export function resolveNotificationLink(notification: AppNotification): string {
  const link = (notification.link || '').trim()
  if (link) return link
  if (Number.isFinite(notification.appId) && notification.appId) {
    return `/market/${notification.appId}`
  }
  return '/notifications'
}

/**
 * 只允许站内跳转：后端数据理论上可信，但 link 是「会被直接 router.push 的字符串」，
 * 一旦被写入 `https://evil.com` 就会变成开放重定向。这里做一次白名单校验。
 *
 * ⚠️ 两个必须挡住的形态：
 * 1. 协议相对 URL：`//evil.com` 会被当成 `https://evil.com`。
 * 2. **控制字符与反斜杠**：浏览器解析 URL 前会把它们剥掉，
 *    于是 `/\t/evil.com`、`/\n/evil.com`、`/\evil.com` 都会退化成 `//evil.com` 跳到外站。
 *    `trim()` 只能去掉首尾空白，中间的控制字符必须显式拒绝。
 */
export function isSafeInternalLink(link: string): boolean {
  const value = (link || '').trim()
  if (!value.startsWith('/')) return false
  // 含控制字符或反斜杠一律拒绝（它们在 URL 解析阶段会被剥掉，绕过前缀判断）
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return false
  return !value.startsWith('//')
}

export const UNREAD_BADGE_MAX = 99

/** 角标文案：超过 99 统一显示 99+，避免把铃铛撑变形 */
export function formatUnreadBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(count)
}
