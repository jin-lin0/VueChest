import { ref, watch, type Ref } from 'vue'
import { getStorage, setStorage } from './bridge'

export interface UseListStoreOptions<T> {
  /** 持久化到桥接 storage 的键名 */
  storageKey: string
  /** 无存储数据时的默认值（函数形式）；与 defaultValue 二选一 */
  initial?: () => T[]
  /** 无存储数据时的静态默认值；缺省为 [] */
  defaultValue?: T[]
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
 * 共享列表持久化。Vue watcher 在本轮微任务内合并改动并投递写入。
 * 不用延时防抖：宿主移除 iframe 时，其计时器可能来不及执行，导致刚保存的修改丢失。
 */
export function useListStore<T extends { id: string | number }>(
  options: UseListStoreOptions<T>,
): UseListStoreReturn<T> {
  const { storageKey, initial, defaultValue, idGen, validate } = options

  const fallback = defaultValue ?? initial?.() ?? []
  // ref<T[]>() 会把元素类型深度解包成 UnwrapRefSimple<T>，于是 push(T) 与
  // filter 赋值回 T[] 都对不上（TS2345 / TS2322）。这里的 T 都是普通数据结构
  // （Note / SpecialDay / HistoryRecord…），解包前后同型，显式标回 Ref<T[]> 即可；
  // 不能用 shallowRef —— update() 是原地替换数组元素，只有深度响应式才会触发持久化 watch。
  const items = ref<T[]>(getStorage<T[]>(storageKey, fallback) ?? fallback) as unknown as Ref<T[]>

  const save = () => {
    setStorage(storageKey, items.value)
  }

  watch(items, save, { deep: true })

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
