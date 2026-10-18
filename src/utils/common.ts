export const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): ((...args: Parameters<T>) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * 「只认最后一次」竞态守卫：同一类请求只允许**最后发起的那次**写入结果。
 *
 * 用法——发起前领票，落地前验票：
 *
 *   const beginSearch = createLatestOnly()
 *   const isCurrent = beginSearch()
 *   const data = await fetchSomething()
 *   if (!isCurrent()) return   // 已有更新的请求，本次结果作废
 *   results.value = data
 *
 * 为什么必须有它：先发的请求不保证先返回。若结果 ref 是共享的，后到的旧响应会盖掉新结果；
 * 更隐蔽的是旧请求走 catch 时会把新结果清空、走 finally 时会把还在加载的 loading 提前熄掉。
 * 所以成功、失败、收尾三条路径都要验票，而不是只守成功那条。
 *
 * 与 composables/useLatestRequest 的分工：那个依赖 onScopeDispose + AbortSignal，
 * 面向组件作用域、会真的取消请求；这里不取消（音乐数据层 lib/musicApi.ts 的请求不收 signal），
 * 只做「本次结果是否已过期」的判定，因此能在 store 这种没有可销毁作用域的地方用。
 */
export const createLatestOnly = (): (() => () => boolean) => {
  let latest = 0
  return () => {
    const ticket = ++latest
    return () => ticket === latest
  }
}

/** 将秒数格式化为时钟字符串。 */
export const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** 前端触发文件下载（Blob 方案，兼容文本/二进制）。 */
export const downloadFile = (
  filename: string,
  content: string | Blob,
  mime = 'text/plain',
): void => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 字节数格式化为可读体积（B / KB / MB / GB）。 */
export const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let val = bytes
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 按模板格式化日期；非法输入返回空串。 */
export const formatDate = (date: Date | number | string, fmt = 'YYYY-MM-DD HH:mm:ss'): string => {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    DD: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0'),
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (key) => map[key])
}

/** 角色 code → 中文文案。 */
export const roleText = (role: string): string => {
  const map: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    user: '普通用户',
  }
  return map[role] ?? role
}
