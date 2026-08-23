import { describe, expect, it } from 'vitest'
import { BOSS_TIMES, RUN_DURATION } from '../engine'

describe('星渊幸存者流程配置', () => {
  it('每两分钟进入一次核心战，最终流程持续六分钟', () => {
    expect([...BOSS_TIMES]).toEqual([120, 240, 360])
    expect(RUN_DURATION).toBe(360)
  })

  it('核心阶段时间严格递增', () => {
    expect(BOSS_TIMES.every((time, index) => index === 0 || time > BOSS_TIMES[index - 1])).toBe(
      true,
    )
  })
})
