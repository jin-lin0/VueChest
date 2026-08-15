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
