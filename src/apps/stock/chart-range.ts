export interface LogicalRange {
  from: number
  to: number
}

export function recentLogicalRange(length: number, visibleBars = 120): LogicalRange | null {
  if (!Number.isFinite(length) || length <= 0) return null
  const safeLength = Math.floor(length)
  const safeVisible = Math.max(1, Math.min(safeLength, Math.floor(visibleBars)))
  return {
    from: safeLength - safeVisible,
    to: safeLength - 1,
  }
}

export function minimumBarSpacing(containerWidth: number, length: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || length <= 0) return 2
  return Math.min(8, Math.max(2, containerWidth / length))
}
