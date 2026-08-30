import { describe, expect, it } from 'vitest'
import { getHorizontalDropdownLayout, getVerticalDropdownLayout } from '../custom-select-layout'

describe('CustomSelect dropdown layout', () => {
  it('为窄触发器保留可读的浮层宽度', () => {
    expect(getHorizontalDropdownLayout(74, 120, 938)).toEqual({ left: 74, width: 200 })
  })

  it('触发器足够宽时保持原宽度和位置', () => {
    expect(getHorizontalDropdownLayout(74, 260, 938)).toEqual({ left: 74, width: 260 })
  })

  it('靠近右侧时把浮层限制在视口内', () => {
    expect(getHorizontalDropdownLayout(900, 200, 1000)).toEqual({ left: 792, width: 200 })
  })

  it('触发器比视口宽时保留两侧安全距离', () => {
    expect(getHorizontalDropdownLayout(0, 1200, 1000)).toEqual({ left: 8, width: 984 })
  })

  it('窄屏下把最小宽度限制在安全区域内', () => {
    expect(getHorizontalDropdownLayout(4, 40, 180)).toEqual({ left: 8, width: 164 })
  })

  it('支持长选项场景自定义更大的最小宽度', () => {
    expect(getHorizontalDropdownLayout(700, 120, 1000, 8, 320)).toEqual({
      left: 672,
      width: 320,
    })
  })

  it('底部空间足够时向下展开', () => {
    expect(getVerticalDropdownLayout(80, 120, 240, 0, 800)).toEqual({
      top: 128,
      maxHeight: 664,
      placement: 'bottom',
    })
  })

  it('底部空间不足时向上展开并保持安全距离', () => {
    expect(getVerticalDropdownLayout(700, 740, 280, 0, 800)).toEqual({
      top: 412,
      maxHeight: 684,
      placement: 'top',
    })
  })

  it('上下都放不下时选择空间较大的一侧并限制高度', () => {
    expect(getVerticalDropdownLayout(180, 220, 400, 0, 360)).toEqual({
      top: 8,
      maxHeight: 164,
      placement: 'top',
    })
  })
})
