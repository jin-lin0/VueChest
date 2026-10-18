/**
 * 把 index 处的元素移动到 index + delta 处，返回**新数组**（不修改入参）。
 * 起点或终点越界时返回 null，由调用方决定忽略还是报错——
 * 键盘调整顺序时「已经在首/末位」是正常状态，不是异常。
 */
export function moveWithin<T>(items: readonly T[], index: number, delta: number): T[] | null {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return null

  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}
