import { ref, watch, type Ref } from 'vue'
import { getStorage, setStorage, debounce } from './bridge'

export interface UseListStoreOptions<T> {
  /** 持久化到桥接 storage 的键名 */
  storageKey: string
  /** 无存储数据时的默认值（函数形式）；与 defaultValue 二选一 */
  initial?: () => T[]
  /** 无存储数据时的静态默认值；缺省为 [] */
  defaultValue?: T[]
  /** 防抖时长（毫秒），默认 500 */
  debounceMs?: number
  /** 生成 id 的函数，仅当添加的对象未携带 id 时调用；默认 crypto.randomUUID() */
  idGen?: () => string | number
  /** 校验函数：返回 false 时不会写入该条目 */
  validate?: (item: T) => boolean
}

export interface UseListStoreReturn<T extends { id: string | number }> {
  items: Ref<T[]>
  add: (item: T) => T
  remove: (id: string | number) => void
  update: (id: string | number, patch: Partial<T>) => void
  clear: () => void
  save: () => void
}

/**
 * 通用「列表 + 增删改 + 防抖持久化」composable。
 * 各 market-app 通过它复用同构的 store 逻辑，自身只保留领域校验/表单状态等差异部分。
 */
export function useListStore<T extends { id: string | number }>(
  options: UseListStoreOptions<T>,
): UseListStoreReturn<T> {
  const { storageKey, initial, defaultValue, debounceMs = 500, idGen, validate } = options

  const fallback = defaultValue ?? initial?.() ?? []
  const items = ref<T[]>(getStorage<T[]>(storageKey, fallback) ?? fallback)

  const save = () => {
    setStorage(storageKey, items.value)
  }
  const debouncedSave = debounce(save, debounceMs)
  watch(items, debouncedSave, { deep: true })

  const add = (item: T): T => {
    const finalItem: T =
      item.id != null ? item : ({ ...item, id: idGen ? idGen() : crypto.randomUUID() } as T)
    if (validate && !validate(finalItem)) return finalItem
    items.value.push(finalItem)
    return finalItem
  }

  const remove = (id: string | number) => {
    items.value = items.value.filter((i) => i.id !== id)
  }

  const update = (id: string | number, patch: Partial<T>) => {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], ...patch }
  }

  const clear = () => {
    items.value = []
  }

  return { items, add, remove, update, clear, save }
}
