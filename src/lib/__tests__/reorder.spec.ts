import { describe, expect, it } from 'vitest'
import { moveWithin } from '../reorder'

describe('moveWithin', () => {
  const items = ['a', 'b', 'c', 'd']

  it('向后移动一位', () => {
    expect(moveWithin(items, 0, 1)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('向前移动一位', () => {
    expect(moveWithin(items, 2, -1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('移动到末尾', () => {
    expect(moveWithin(items, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('不修改入参', () => {
    const source = [...items]
    moveWithin(source, 0, 2)
    expect(source).toEqual(items)
  })

  it('首尾越界时返回 null（键盘按到头是正常状态）', () => {
    expect(moveWithin(items, 0, -1)).toBeNull()
    expect(moveWithin(items, 3, 1)).toBeNull()
  })

  it('起点越界时返回 null', () => {
    expect(moveWithin(items, -1, 1)).toBeNull()
    expect(moveWithin(items, 4, -1)).toBeNull()
    expect(moveWithin([], 0, 1)).toBeNull()
  })

  it('delta 为 0 时仍返回等价的新数组', () => {
    expect(moveWithin(items, 1, 0)).toEqual(items)
  })
})
