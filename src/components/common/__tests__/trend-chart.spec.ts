import { describe, expect, it } from 'vitest'
import {
  TREND_VIEW_WIDTH,
  buildTrendGeometry,
  formatDayLabel,
  indexToRatio,
  pickTickIndexes,
  ratioToIndex,
} from '../trend-chart'

describe('buildTrendGeometry', () => {
  it('空数据返回空几何，不产生除零', () => {
    const geometry = buildTrendGeometry([], 120)
    expect(geometry.points).toEqual([])
    expect(geometry.linePath).toBe('')
    expect(geometry.total).toBe(0)
    expect(geometry.peakIndex).toBe(-1)
  })

  it('首尾点贴住内边距，最高点贴住顶部', () => {
    const geometry = buildTrendGeometry([0, 10, 0], 100, 6)
    expect(geometry.points[0].x).toBe(6)
    expect(geometry.points[2].x).toBe(TREND_VIEW_WIDTH - 6)
    // 基线 = 100 - 6 = 94，最大值映射到顶部 y = 6
    expect(geometry.points[1].y).toBeCloseTo(6, 5)
    expect(geometry.baseline).toBe(94)
  })

  it('全 0 序列用 1 兜底，线贴在基线上', () => {
    const geometry = buildTrendGeometry([0, 0, 0], 100, 6)
    expect(geometry.max).toBe(1)
    expect(geometry.total).toBe(0)
    expect(geometry.points.every((point) => point.y === 94)).toBe(true)
  })

  it('把负数与非法值归零，只保留有效计数', () => {
    const geometry = buildTrendGeometry([3, -2, Number.NaN, null as unknown as number, 1], 100)
    expect(geometry.total).toBe(4)
    expect(geometry.max).toBe(3)
    expect(geometry.points.map((point) => point.value)).toEqual([3, 0, 0, 0, 1])
  })

  it('单点序列居中显示', () => {
    const geometry = buildTrendGeometry([5], 100)
    expect(geometry.points).toHaveLength(1)
    expect(geometry.points[0].x).toBe(TREND_VIEW_WIDTH / 2)
  })

  it('面积路径闭合到基线，形成可填充的多边形', () => {
    const geometry = buildTrendGeometry([1, 4], 100, 6)
    expect(geometry.areaPath.startsWith(geometry.linePath)).toBe(true)
    expect(geometry.areaPath.endsWith('Z')).toBe(true)
    expect(geometry.areaPath).toContain('94.00')
  })

  it('peakIndex 指向最大值（并列取最早出现的）', () => {
    expect(buildTrendGeometry([1, 9, 9, 2], 100).peakIndex).toBe(1)
    expect(buildTrendGeometry([0, 0, 0], 100).peakIndex).toBe(0)
  })
})

describe('formatDayLabel', () => {
  it('把日期键缩成 M/D', () => {
    expect(formatDayLabel('2026-10-04')).toBe('10/4')
    expect(formatDayLabel('2026-01-09')).toBe('1/9')
  })

  it('非日期输入原样返回，不抛错', () => {
    expect(formatDayLabel('')).toBe('')
    expect(formatDayLabel('2026-10')).toBe('2026-10')
  })
})

describe('pickTickIndexes', () => {
  it('首尾必选，数量受 maxTicks 限制', () => {
    const indexes = pickTickIndexes(120, 5)
    expect(indexes.length).toBeLessThanOrEqual(5)
    expect(indexes[0]).toBe(0)
    expect(indexes[indexes.length - 1]).toBe(119)
  })

  it('点数少于刻度数时全部返回', () => {
    expect(pickTickIndexes(3, 5)).toEqual([0, 1, 2])
  })

  it('单点与空轴不报错', () => {
    expect(pickTickIndexes(1)).toEqual([0])
    expect(pickTickIndexes(0)).toEqual([])
  })
})

describe('ratioToIndex / indexToRatio', () => {
  it('在两端与中点正确映射', () => {
    expect(ratioToIndex(0, 5)).toBe(0)
    expect(ratioToIndex(1, 5)).toBe(4)
    expect(ratioToIndex(0.5, 5)).toBe(2)
  })

  it('越界比例被夹到合法范围', () => {
    expect(ratioToIndex(-3, 5)).toBe(0)
    expect(ratioToIndex(9, 5)).toBe(4)
  })

  it('空序列返回 -1，不返回越界下标', () => {
    expect(ratioToIndex(0.5, 0)).toBe(-1)
    expect(indexToRatio(3, 0)).toBe(0)
  })

  it('与 ratioToIndex 互为逆运算', () => {
    for (let index = 0; index < 10; index += 1) {
      expect(ratioToIndex(indexToRatio(index, 10), 10)).toBe(index)
    }
  })
})
