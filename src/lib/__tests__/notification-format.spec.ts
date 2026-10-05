import { describe, expect, it } from 'vitest'
import {
  describeNotificationType,
  formatAbsoluteTime,
  formatRelativeTime,
  formatUnreadBadge,
  isSafeInternalLink,
  resolveNotificationLink,
  type AppNotification,
} from '../notification-format'

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    type: 'market.comment.created',
    title: '标题',
    body: '',
    link: '',
    appId: null,
    meta: null,
    read: false,
    createdAt: 0,
    ...overrides,
  }
}

describe('describeNotificationType', () => {
  it('maps known server event types to an icon / label / tone', () => {
    expect(describeNotificationType('market.review.approved')).toEqual({
      icon: '✅',
      label: '审核通过',
      tone: 'success',
    })
    expect(describeNotificationType('market.report.created').tone).toBe('warning')
  })

  it('degrades unknown types to a generic bell instead of throwing', () => {
    expect(describeNotificationType('brand.new.event')).toEqual({
      icon: '🔔',
      label: '通知',
      tone: 'neutral',
    })
  })
})

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 9, 4, 12, 0, 0)

  it('collapses anything under a minute to 刚刚', () => {
    expect(formatRelativeTime(now, now)).toBe('刚刚')
    expect(formatRelativeTime(now - 59_000, now)).toBe('刚刚')
  })

  it('clamps future timestamps caused by client clock skew', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('刚刚')
  })

  it('walks minutes, hours and days', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前')
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2 天前')
  })

  it('switches to an absolute date after a week', () => {
    const old = Date.UTC(2026, 0, 2, 3, 4, 0)
    expect(formatRelativeTime(old, now)).toBe('2026-01-02')
  })

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeTime(Number.NaN, now)).toBe('')
  })
})

describe('formatAbsoluteTime', () => {
  it('zero-pads month, day, hour and minute', () => {
    const date = new Date(2026, 0, 2, 3, 4)
    expect(formatAbsoluteTime(date.getTime())).toBe('2026-01-02 03:04')
  })

  it('returns an empty string for invalid input', () => {
    expect(formatAbsoluteTime(Number.NaN)).toBe('')
  })
})

describe('resolveNotificationLink', () => {
  it('prefers the server-provided link', () => {
    expect(resolveNotificationLink(makeNotification({ link: '/market/9' }))).toBe('/market/9')
  })

  it('falls back to the app detail page when only appId is present', () => {
    expect(resolveNotificationLink(makeNotification({ appId: 12 }))).toBe('/market/12')
  })

  it('falls back to the notification center when nothing is usable', () => {
    expect(resolveNotificationLink(makeNotification())).toBe('/notifications')
    expect(resolveNotificationLink(makeNotification({ appId: 0 }))).toBe('/notifications')
  })
})

describe('isSafeInternalLink', () => {
  it('accepts absolute in-site paths', () => {
    expect(isSafeInternalLink('/market/9')).toBe(true)
    expect(isSafeInternalLink('/notifications')).toBe(true)
  })

  it('rejects protocol-relative and external urls to prevent open redirects', () => {
    expect(isSafeInternalLink('//evil.com')).toBe(false)
    expect(isSafeInternalLink('/\\evil.com')).toBe(false)
    expect(isSafeInternalLink('https://evil.com')).toBe(false)
    expect(isSafeInternalLink('javascript:alert(1)')).toBe(false)
    expect(isSafeInternalLink('')).toBe(false)
  })

  it('rejects links containing control characters that browsers strip before parsing', () => {
    // 浏览器解析 URL 前会剥掉 \t \n \r，`/\t/evil.com` 因此退化成 `//evil.com` 跳到外站
    expect(isSafeInternalLink('/\t/evil.com')).toBe(false)
    expect(isSafeInternalLink('/\n/evil.com')).toBe(false)
    expect(isSafeInternalLink('/\r/evil.com')).toBe(false)
    expect(isSafeInternalLink('/\u0000/evil.com')).toBe(false)
    // 前后空白仍按原样 trim 后判定
    expect(isSafeInternalLink('  /notifications  ')).toBe(true)
  })
})

describe('formatUnreadBadge', () => {
  it('hides the badge when there is nothing unread', () => {
    expect(formatUnreadBadge(0)).toBe('')
    expect(formatUnreadBadge(-3)).toBe('')
    expect(formatUnreadBadge(Number.NaN)).toBe('')
  })

  it('caps at 99+ so the bell never gets stretched', () => {
    expect(formatUnreadBadge(7)).toBe('7')
    expect(formatUnreadBadge(99)).toBe('99')
    expect(formatUnreadBadge(100)).toBe('99+')
  })
})
