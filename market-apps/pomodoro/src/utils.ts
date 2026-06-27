// 共享存储层——通过主应用的 global 桥梁读写 IndexedDB 缓存
// 确保与 Home / 主应用共享同一份数据

const win = window as any

export function getStorage<T>(key: string, defaultValue?: T): T | null {
  if (win.__VueChest__?.storage) {
    return win.__VueChest__.storage.getStorage(key, defaultValue)
  }
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) return JSON.parse(raw) as T
  } catch {
    /* ignored */
  }
  return defaultValue ?? null
}

export function setStorage(key: string, value: unknown): void {
  if (win.__VueChest__?.storage) {
    win.__VueChest__.storage.setStorage(key, value)
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignored */
  }
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}
