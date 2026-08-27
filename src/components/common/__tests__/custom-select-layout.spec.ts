import { describe, expect, it } from 'vitest'
import { getHorizontalDropdownLayout } from '../custom-select-layout'

describe('CustomSelect dropdown layout', () => {
  it('保持正常触发器的宽度和位置', () => {
    expect(getHorizontalDropdownLayout(74, 120, 938)).toEqual({ left: 74, width: 120 })
  })

  it('靠近右侧时把浮层限制在视口内', () => {
    expect(getHorizontalDropdownLayout(900, 200, 1000)).toEqual({ left: 792, width: 200 })
  })

  it('触发器比视口宽时保留两侧安全距离', () => {
    expect(getHorizontalDropdownLayout(0, 1200, 1000)).toEqual({ left: 8, width: 984 })
  })
})
