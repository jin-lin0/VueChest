/**
 * 未读角标的两个出口：
 *   1. 标签页图标（favicon）叠加数字 —— 全平台可用；
 *   2. Badging API（navigator.setAppBadge）—— 已安装为 PWA 时任务栏/程序坞也能显示。
 *
 * 两者都是「锦上添花」，任一失败都必须静默吞掉：角标画不出来绝不能让页面报错。
 */

const LIGHTNING = '⚡'
const BADGE_COLOR = '#e5484d'

/**
 * 未读为 0 时的回退图标。
 *
 * 渲染结果与 index.html 里 <link rel="icon"> 的默认值相同，但**字符串不相等**：
 * 这里走 `encodeURIComponent`，index.html 是手写的 `%22` 转义（`<`、空格原样保留）。
 * 因此首次同步会把 favicon 标签重写一次 —— 无害，但别指望两者能字符串比较相等。
 */
export const DEFAULT_FAVICON = buildFaviconDataUri(
  `<text y=".9em" font-size="90">${LIGHTNING}</text>`,
)

function buildFaviconDataUri(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function badgeFontSize(text: string): number {
  if (text.length >= 3) return 46
  if (text.length === 2) return 54
  return 60
}

/**
 * 生成带未读数字的 favicon data URI。count <= 0 或非法时返回默认图标，
 * 因此调用方无需自己判断「要不要清空角标」。
 */
export function buildBadgedFavicon(count: number): string {
  const value = Number.isFinite(count) ? Math.floor(count) : 0
  if (value <= 0) return DEFAULT_FAVICON
  const text = value > 99 ? '99+' : String(value)
  const circle = [
    `<circle cx="74" cy="26" r="24" fill="${BADGE_COLOR}"/>`,
    `<text x="74" y="27" text-anchor="middle" dominant-baseline="central"`,
    ` font-size="${badgeFontSize(text)}" font-weight="700" fill="#fff"`,
    ` font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif">${text}</text>`,
  ].join('')
  return buildFaviconDataUri(`<text y=".9em" font-size="78">${LIGHTNING}</text>${circle}`)
}

function applyFavicon(count: number) {
  if (typeof document === 'undefined') return
  const next = buildBadgedFavicon(count)
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    // 理论上 index.html 一定写了 icon；缺失时补一个，避免角标静默失效
    const created = document.createElement('link')
    created.rel = 'icon'
    created.href = next
    document.head.appendChild(created)
    return
  }
  if (link.href !== next) link.href = next
}

function applyAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  const badge = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  try {
    if (count > 0) void badge.setAppBadge?.(count)?.catch(() => {})
    else void badge.clearAppBadge?.()?.catch(() => {})
  } catch {
    // 非安全上下文（http 且非 localhost）下部分实现会直接抛错，忽略即可
  }
}

/** 唯一的角标写入入口；store 只调它，不直接碰 DOM */
export function syncDocumentBadge(count: number): void {
  const value = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  applyFavicon(value)
  applyAppBadge(value)
}
