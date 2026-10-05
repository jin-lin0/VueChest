/**
 * 趋势图的纯几何计算。
 *
 * 单独抽出来是为了可测试：SVG 只负责把算好的路径画出来，
 * 缩放、基线、极值这些容易出错的算术都放在这里。
 *
 * 坐标系说明：viewBox 宽度固定为 TREND_VIEW_WIDTH（600），高度按需传入，
 * 渲染时用 preserveAspectRatio="none" 横向拉伸铺满容器，
 * 配合 path 上的 vector-effect="non-scaling-stroke" 保证描边不被拉粗。
 */

export const TREND_VIEW_WIDTH = 600

export interface TrendPoint {
  index: number
  value: number
  x: number
  y: number
}

export interface TrendGeometry {
  points: TrendPoint[]
  linePath: string
  areaPath: string
  max: number
  total: number
  peakIndex: number
  baseline: number
}

/** 负值、NaN、null 一律归零：趋势图只表达「发生了多少次」。 */
function sanitize(values: number[] | null | undefined): number[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
  })
}

export function buildTrendGeometry(
  values: number[] | null | undefined,
  height: number,
  padding = 6,
): TrendGeometry {
  const series = sanitize(values)
  const safeHeight = Math.max(1, Math.round(height))
  const inset = Math.min(padding, safeHeight / 2, TREND_VIEW_WIDTH / 2)
  const baseline = safeHeight - inset

  if (!series.length) {
    return {
      points: [],
      linePath: '',
      areaPath: '',
      max: 0,
      total: 0,
      peakIndex: -1,
      baseline,
    }
  }

  const usableHeight = Math.max(1, safeHeight - inset * 2)
  // 全 0 时用 1 兜底，避免除零，同时让线贴底
  const max = Math.max(...series, 1)
  const step =
    series.length > 1 ? (TREND_VIEW_WIDTH - inset * 2) / (series.length - 1) : 0

  const points = series.map((value, index) => ({
    index,
    value,
    x: series.length > 1 ? inset + step * index : TREND_VIEW_WIDTH / 2,
    y: baseline - (value / max) * usableHeight,
  }))

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ')

  const first = points[0]
  const last = points[points.length - 1]
  const areaPath = `${linePath} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`

  let peakIndex = 0
  series.forEach((value, index) => {
    if (value > series[peakIndex]) peakIndex = index
  })

  return {
    points,
    linePath,
    areaPath,
    max,
    total: series.reduce((sum, value) => sum + value, 0),
    peakIndex,
    baseline,
  }
}

/** 把 `2026-10-04` 缩成 `10/4`，用于 X 轴刻度与 tooltip。 */
export function formatDayLabel(dateKey: string): string {
  const parts = String(dateKey ?? '').split('-')
  if (parts.length !== 3) return String(dateKey ?? '')
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!Number.isFinite(month) || !Number.isFinite(day)) return String(dateKey)
  return `${month}/${day}`
}

/**
 * 从日期轴上挑若干个刻度点（首、尾必选，中间尽量均匀），
 * 避免 120 天的图挤满 120 个标签。
 */
export function pickTickIndexes(length: number, maxTicks = 5): number[] {
  if (!Number.isFinite(length) || length <= 0) return []
  const count = Math.max(2, Math.min(Math.floor(maxTicks) || 5, length))
  if (length === 1) return [0]
  const indexes = new Set<number>([0, length - 1])
  const step = (length - 1) / (count - 1)
  for (let i = 1; i < count - 1; i += 1) {
    indexes.add(Math.round(step * i))
  }
  return [...indexes].sort((left, right) => left - right)
}

/** 鼠标横向比例 → 数据点下标（柱状图按区间取整，折线图取最近点）。 */
export function ratioToIndex(ratio: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return -1
  if (length === 1) return 0
  const clamped = Math.min(1, Math.max(0, Number(ratio) || 0))
  return Math.min(length - 1, Math.round(clamped * (length - 1)))
}

/** 下标 → 横向比例，用于定位 tooltip 与竖向指示线。 */
export function indexToRatio(index: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0 || index < 0) return 0
  if (length === 1) return 0.5
  return index / (length - 1)
}
