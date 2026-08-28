// 共享存储层——通过主应用的 global 桥梁读写 IndexedDB 缓存
// 确保与 Home / 主应用共享同一份数据

interface VueChestStorage {
  getStorage<T>(key: string, defaultValue?: T): T | null
  setStorage(key: string, value: unknown): void
}

interface VueChestRuntime {
  storage?: VueChestStorage
}

const runtimeWindow = window as typeof window & { __VueChest__?: VueChestRuntime }

export function getStorage<T>(key: string, defaultValue?: T): T | null {
  if (runtimeWindow.__VueChest__?.storage) {
    return runtimeWindow.__VueChest__.storage.getStorage(key, defaultValue)
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
  if (runtimeWindow.__VueChest__?.storage) {
    runtimeWindow.__VueChest__.storage.setStorage(key, value)
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignored */
  }
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: TArgs) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
