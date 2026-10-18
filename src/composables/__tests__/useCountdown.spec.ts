// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useCountdown } from '../useCountdown'

/** 独立推进墙钟和回调次数，模拟后台节流而不依赖真实等待。 */
let now = 0
const live = new Set<() => void>()
let realSetInterval: typeof globalThis.setInterval
let realClearInterval: typeof globalThis.clearInterval

/** 墙钟前进 ms 毫秒。注意：不一定伴随定时器回调 —— 后台节流正在于此。 */
function advanceWallClock(ms: number) {
  now += ms
}

/** 投递 times 轮定时器回调（模拟定时器真正被唤醒的次数）。 */
function fireTicks(times = 1) {
  for (let i = 0; i < times; i++) {
    for (const cb of [...live]) cb()
  }
}

let scope: EffectScope

function setup(seconds = 60) {
  scope = effectScope()
  return scope.run(() => useCountdown(seconds))!
}

beforeEach(() => {
  now = Date.UTC(2026, 9, 15, 0, 0, 0)
  live.clear()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  realSetInterval = globalThis.setInterval
  realClearInterval = globalThis.clearInterval
  globalThis.setInterval = ((cb: () => void) => {
    live.add(cb)
    return cb as unknown as ReturnType<typeof setInterval>
  }) as unknown as typeof globalThis.setInterval
  globalThis.clearInterval = ((id: unknown) => {
    live.delete(id as () => void)
  }) as unknown as typeof globalThis.clearInterval
})

afterEach(() => {
  scope?.stop()
  globalThis.setInterval = realSetInterval
  globalThis.clearInterval = realClearInterval
  vi.restoreAllMocks()
})

describe('验证码倒计时以墙钟为准', () => {
  it('未启动时 count 为 0、active 为 false，也不注册定时器', () => {
    const { count, active } = setup()
    expect(count.value).toBe(0)
    expect(active.value).toBe(false)
    expect(live.size).toBe(0)
  })

  it('前台正常唤醒时逐秒递减，不多扣也不少扣', () => {
    const { count, start } = setup()
    start()

    advanceWallClock(1_000)
    fireTicks(1)
    expect(count.value).toBe(59)

    advanceWallClock(1_000)
    fireTicks(1)
    expect(count.value).toBe(58)
  })

  it('后台被节流时不漂移：隐藏 5 分钟只被唤醒 5 次，60 秒冷却照样结束', () => {
    const { count, active, start } = setup()
    start()

    // 浏览器把定时器节流成每分钟一次：5 分钟墙钟，只有 5 次回调。
    for (let i = 0; i < 5; i++) {
      advanceWallClock(60_000)
      fireTicks(1)
    }

    expect(count.value).toBe(0)
    expect(active.value).toBe(false)
    expect(live.size).toBe(0)
  })

  it('页面重新可见时立即按墙钟校正，不必等下一次唤醒', () => {
    const { count, start } = setup()
    start()

    // 后台 45 秒，一次回调都没投递 —— 按 tick 计数的实现此时纹丝不动。
    advanceWallClock(45_000)
    expect(count.value).toBe(60)

    document.dispatchEvent(new Event('visibilitychange'))
    expect(count.value).toBe(15)
  })

  it('重新可见时若冷却早已结束，立即归零并解除禁用', () => {
    const { count, active, start } = setup()
    start()

    advanceWallClock(90_000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(count.value).toBe(0)
    expect(active.value).toBe(false)
    expect(live.size).toBe(0)
  })

  it('重复 start 会重置倒计时，且不会叠加第二个定时器', () => {
    const { count, start } = setup()
    start()

    advanceWallClock(10_000)
    fireTicks(1)
    expect(count.value).toBe(50)

    start(30)
    expect(count.value).toBe(30)
    expect(live.size).toBe(1)

    advanceWallClock(5_000)
    fireTicks(1)
    expect(count.value).toBe(25)
  })

  it('作用域销毁后清掉定时器与可见性监听，不再倒数', () => {
    const { count, start } = setup()
    start()
    expect(live.size).toBe(1)

    scope.stop()
    expect(live.size).toBe(0)

    const before = count.value
    advanceWallClock(30_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(count.value).toBe(before)
  })
})
