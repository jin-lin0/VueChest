import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 提示通道自己也会「静默丢消息」。
 *
 * `useToast()` 原来写的是 `host?.addToast(...)`：宿主（App.vue 的 onMounted 里注册）还没
 * 挂载时，调用会被无声吞掉 —— 不是延后、不是报错，是**彻底不存在**。
 * 而 `main.ts` 的 `bootstrap()` 在 `app.mount()` 之前就 await 了 `initStorage()`、
 * `initAuth()`，启动期恰好是最需要把「本地数据库打不开」这类话送到用户眼前的时刻。
 *
 * 这些用例锁的是行为本身：注册前发出的提示必须留着，并在注册那一刻按原顺序补发。
 */

beforeEach(() => {
  // 模块级单例（host / pending）跨用例会残留，每个用例都重新加载模块
  vi.resetModules()
})

async function loadToast() {
  return import('../useToast')
}

function fakeHost() {
  return { addToast: vi.fn(), removeToast: vi.fn() }
}

describe('useToast 在宿主注册之前', () => {
  it('宿主未注册时发出的提示不丢：注册时按原顺序补发', async () => {
    const { useToast, registerToastHost } = await loadToast()
    const { addToast } = useToast()

    addToast('error', '先把这条存住')
    addToast('warning', '第二条')

    const host = fakeHost()
    registerToastHost(host)

    expect(host.addToast).toHaveBeenCalledTimes(2)
    expect(host.addToast).toHaveBeenNthCalledWith(1, 'error', '先把这条存住', undefined)
    expect(host.addToast).toHaveBeenNthCalledWith(2, 'warning', '第二条', undefined)
  })

  it('duration 一并保留，不会被补发丢掉', async () => {
    const { useToast, registerToastHost } = await loadToast()
    useToast().addToast('error', '要读很久的一句话', 10_000)

    const host = fakeHost()
    registerToastHost(host)

    expect(host.addToast).toHaveBeenCalledWith('error', '要读很久的一句话', 10_000)
  })

  it('注册之后直接透传，不再进队列', async () => {
    const { useToast, registerToastHost } = await loadToast()
    const host = fakeHost()
    registerToastHost(host)

    useToast().addToast('success', '立即显示')

    expect(host.addToast).toHaveBeenCalledWith('success', '立即显示', undefined)
  })

  it('补发后队列清空：重复注册不会把旧提示重放一遍', async () => {
    const { useToast, registerToastHost } = await loadToast()
    useToast().addToast('info', '只该出现一次')

    const first = fakeHost()
    registerToastHost(first)
    const second = fakeHost()
    registerToastHost(second)

    expect(first.addToast).toHaveBeenCalledTimes(1)
    expect(second.addToast).not.toHaveBeenCalled()
  })

  it('排队超过上限时丢弃新的、保留最早的（根因比症状重要）', async () => {
    const { useToast, registerToastHost } = await loadToast()
    const { addToast } = useToast()
    for (let i = 0; i < 25; i += 1) addToast('error', `第 ${i} 条`)

    const host = fakeHost()
    registerToastHost(host)

    expect(host.addToast).toHaveBeenCalledTimes(20)
    expect(host.addToast).toHaveBeenNthCalledWith(1, 'error', '第 0 条', undefined)
    expect(host.addToast).toHaveBeenLastCalledWith('error', '第 19 条', undefined)
  })

  it('注销宿主（null）不会清空已排队的提示', async () => {
    const { useToast, registerToastHost } = await loadToast()
    useToast().addToast('error', '排队中')

    registerToastHost(null)
    const host = fakeHost()
    registerToastHost(host)

    expect(host.addToast).toHaveBeenCalledWith('error', '排队中', undefined)
  })

  it('没有宿主时 removeToast 只是无事可做，不抛错', async () => {
    const { useToast } = await loadToast()
    expect(() => useToast().removeToast(1)).not.toThrow()
  })
})
