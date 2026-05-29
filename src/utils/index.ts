// 工具函数统一导出入口
export * from './db'
export * from './storage'
export * from './lunar'

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
