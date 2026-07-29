import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, formatClock } from '../index'

/* ----------------------------- 时钟格式化 ----------------------------- */
describe('formatClock', () => {
  it('不足 1 小时返回 mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(5)).toBe('00:05')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(599)).toBe('09:59')
  })

  it('达到 1 小时返回 h:mm:ss', () => {
    expect(formatClock(3600)).toBe('1:00:00')
    expect(formatClock(3661)).toBe('1:01:01')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(36000)).toBe('10:00:00')
  })

  it('负数被夹到 0（不出现负时钟）', () => {
    expect(formatClock(-1)).toBe('00:00')
    expect(formatClock(-9999)).toBe('00:00')
  })

  it('小数向下取整到整秒', () => {
    expect(formatClock(5.9)).toBe('00:05')
    expect(formatClock(65.4)).toBe('01:05')
  })
})

/* ------------------------------- 防抖 --------------------------------- */
describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连续触发只在停止 delay 后执行最后一次', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d(1)
    d(2)
    d(3)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
  })

  it('每次窗口内再次触发都会重置计时', () => {
    const fn = vi.fn()
    const d = debounce(fn, 50)
    d('a')
    vi.advanceTimersByTime(30)
    d('b')
    vi.advanceTimersByTime(30) // 距上次仅 30ms，尚未到 50ms
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20) // 累计 50ms
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('间隔超过 delay 会触发多次', () => {
    const fn = vi.fn()
    const d = debounce(fn, 50)
    d(1)
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
    d(2)
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(1, 1)
    expect(fn).toHaveBeenNthCalledWith(2, 2)
  })
})
