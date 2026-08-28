import { describe, expect, it } from 'vitest'
import type { RacingCar } from '../config'
import { carTrait, formatLap, itemLabel, liveryOptionsFor } from '../presentation'

const car = {
  id: 1,
  name: 'Test',
  color: '#fff',
  speed: 180,
  handling: 90,
} as RacingCar

describe('racing presentation helpers', () => {
  it('格式化圈速和道具名称', () => {
    expect(formatLap(0)).toBe('00:00.0')
    expect(formatLap(62.34)).toBe('01:02.3')
    expect(itemLabel('missile')).toBe('追踪导弹')
    expect(itemLabel(null)).toBe('等待拾取')
  })

  it('计算车辆定位与涂装解锁状态', () => {
    expect(carTrait(car)).toBe('操控型')
    const options = liveryOptionsFor(car, ['classic', 'glacier'])
    expect(options.find((option) => option.id === 'glacier')?.unlocked).toBe(true)
    expect(options.find((option) => option.id === 'duotone')?.unlocked).toBe(false)
  })
})
