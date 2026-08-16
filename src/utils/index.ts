// 纯工具函数统一导出入口（库级封装见 src/lib）
export * from './clipboard'
export * from './lunar'
export * from './devtoolbox'

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
 * 将秒数格式化为时钟字符串。
 * < 1h 返回 mm:ss，否则返回 h:mm:ss。用于计时/赛车圈速/聊天时长等。
 */
export const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/**
 * 前端触发文件下载（Blob 方案，兼容文本/二进制）。
 */
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

/**
 * 字节数格式化为可读体积（B / KB / MB / GB）。
 * 入参为字节数（后端 market_apps.size 即字节），0/undefined 返回 '-'。
 */
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

/**
 * 把日期格式化为指定模板字符串。
 * 默认 `YYYY-MM-DD HH:mm:ss`；支持 YYYY / MM / DD / HH / mm / ss 占位符。
 * 入参为 Date | 时间戳(number) | 日期字符串；非法输入返回空串。
 */
export const formatDate = (
  date: Date | number | string,
  fmt = 'YYYY-MM-DD HH:mm:ss',
): string => {
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
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k])
}

/**
 * 角色 code → 中文文案。未知角色原样返回。
 */
export const roleText = (role: string): string => {
  const map: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    user: '普通用户',
  }
  return map[role] ?? role
}
