/** 返回将 index 移至 index + delta 的新数组；起点或终点越界时返回 null。 */
export function moveWithin<T>(items: readonly T[], index: number, delta: number): T[] | null {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return null

  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}
