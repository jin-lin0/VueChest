// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePomodoroStore } from '../store'

/**
 * 复现 Chrome 88+ 的后台定时器节流：页面隐藏超过 5 分钟、链式回调计数 ≥5、
 * 且页面静音 30 秒后，浏览器对定时器改为**每分钟只检查一次**
 * （见 https://developer.chrome.com/blog/timer-throttling-in-chrome-88）。
 *
 * 手法：只接管 setInterval 的**注册**，回调仍是应用自己那个函数；
 * 墙钟（Date.now）由测试推进，回调按文档所述的频率投递。
 * 于是「墙钟走多久」与「回调被唤醒几次」成为两个独立变量 ——
 * 这正是真实浏览器节流下的处境，而测试完全确定、不依赖机器速度。
 */
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

/** 建一个已 init 的 store，并把「专注时长」定为 workMinutes 分钟。 */
function setup(workMinutes: number) {
  const store = usePomodoroStore()
  store.init()
  // init() 会从存储/默认值重置 settings，所以必须先 init 再改设置。
  store.settings.work = workMinutes
  store.applySettings()
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
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
  globalThis.setInterval = realSetInterval
  globalThis.clearInterval = realClearInterval
  vi.restoreAllMocks()
})

describe('番茄钟计时以墙钟为准', () => {
  it('前台正常唤醒时按墙钟递减，不多扣也不少扣', () => {
    const store = setup(25)
    store.startTimer()

    advanceWallClock(1_000)
    fireTicks(1)
    expect(store.timeLeft).toBe(1_499)

    advanceWallClock(1_000)
    fireTicks(1)
    expect(store.timeLeft).toBe(1_498)
  })

  it('后台被节流时不漂移：隐藏 5 分钟只被唤醒 5 次，1 分钟的专注照样按时结束', () => {
    const store = setup(1)
    store.startTimer()

    // 浏览器把定时器节流成每分钟一次：5 分钟墙钟，只有 5 次回调。
    for (let i = 0; i < 5; i++) {
      advanceWallClock(60_000)
      fireTicks(1)
    }

    expect(store.history).toHaveLength(1)
    expect(store.history[0].type).toBe('work')
    expect(store.history[0].duration).toBe(60)
    expect(store.sessionType).toBe('break')
  })

  it('暂停按墙钟结算剩余时间，而不是按回调次数', () => {
    const store = setup(25)
    store.startTimer()

    // 墙钟走了 10 秒，但后台只被唤醒一次。
    advanceWallClock(10_000)
    fireTicks(1)
    store.pauseTimer()

    expect(store.timeLeft).toBe(25 * 60 - 10)
    expect(store.isRunning).toBe(false)
  })

  it('暂停发生在两次唤醒之间时，也按墙钟结算（不能依赖上一次回调已经算对）', () => {
    const store = setup(25)
    store.startTimer()

    // 后台 45 秒，回调一次都没投递：此时 timeLeft 还是起始值，
    // 只有 pause 时按墙钟结算才能把这段时间算进去。
    advanceWallClock(45_000)
    expect(store.timeLeft).toBe(25 * 60)

    store.pauseTimer()
    expect(store.timeLeft).toBe(25 * 60 - 45)
  })

  it('页面重新可见时立即按墙钟校正，不必等下一次唤醒', () => {
    const store = setup(25)
    store.startTimer()

    // 后台 30 秒，一次回调都没投递 —— 按 tick 计数的实现此时纹丝不动。
    advanceWallClock(30_000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(store.timeLeft).toBe(25 * 60 - 30)
  })

  it('回到前台时若已过截止时刻，立即结束本次专注', () => {
    const store = setup(1)
    store.startTimer()

    advanceWallClock(90_000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(store.history).toHaveLength(1)
    expect(store.sessionType).toBe('break')
  })

  it('结束后停掉定时器，不补做多个番茄钟', () => {
    const store = setup(1)
    store.startTimer()

    advanceWallClock(3 * 60_000)
    fireTicks(5)

    expect(store.history).toHaveLength(1)
    expect(store.isRunning).toBe(false)
    expect(live.size).toBe(0)
  })

  it('重置回到本阶段的完整时长', () => {
    const store = setup(25)
    store.startTimer()

    advanceWallClock(10_000)
    store.resetTimer()

    expect(store.timeLeft).toBe(25 * 60)
    expect(store.isRunning).toBe(false)
    expect(live.size).toBe(0)
  })

  it('暂停后再开始，从剩余时间接着走；暂停期间墙钟不参与计时', () => {
    const store = setup(25)
    store.startTimer()

    advanceWallClock(10_000)
    fireTicks(1)
    store.pauseTimer()
    expect(store.timeLeft).toBe(1_490)

    // 暂停期间过了 5 分钟，不应被计入。
    advanceWallClock(5 * 60_000)
    store.startTimer()
    expect(store.timeLeft).toBe(1_490)

    advanceWallClock(20_000)
    fireTicks(1)
    expect(store.timeLeft).toBe(1_470)
  })

  it('卸载时清掉定时器与可见性监听', () => {
    const store = setup(25)
    store.startTimer()
    expect(live.size).toBe(1)

    store.cleanup()
    expect(live.size).toBe(0)

    // 监听已摘除：卸载后再触发可见性事件不应改动剩余时间。
    const before = store.timeLeft
    advanceWallClock(30_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.timeLeft).toBe(before)
  })
})
