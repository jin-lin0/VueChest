// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { Response as HappyResponse } from 'happy-dom'

const mocks = vi.hoisted(() => ({
  getStorage: vi.fn(),
  collectSandboxStorage: vi.fn(),
  handleSandboxMessage: vi.fn(),
  fetchAppDetail: vi.fn(),
  ensureBundle: vi.fn(),
  back: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getStorage: mocks.getStorage,
  setStorage: vi.fn(),
  removeStorage: vi.fn(),
}))

vi.mock('@/lib/sandbox-bridge', () => ({
  collectSandboxStorage: mocks.collectSandboxStorage,
  handleSandboxMessage: mocks.handleSandboxMessage,
  HOST_SHARED_KEYS: ['special_days'],
}))

vi.mock('@/stores/market', () => ({
  useMarketStore: () => ({
    installedApps: [
      { id: 42, name: '演示应用', allowNetwork: ['api.example.com'], permissions: [] },
    ],
    fetchAppDetail: mocks.fetchAppDetail,
    ensureBundle: mocks.ensureBundle,
  }),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ back: mocks.back }) }))

import MarketAppSandbox from '../MarketAppSandbox.vue'

let app: App
let root: HTMLElement

function frame(): HTMLIFrameElement {
  const el = document.querySelector('iframe')
  if (!el) throw new Error('沙箱 iframe 未渲染')
  return el as HTMLIFrameElement
}

/** 记下父站发给沙箱的每一条消息。 */
function sent(): unknown[] {
  const out: unknown[] = []
  const cw = frame().contentWindow as Window & { postMessage: (m: unknown) => void }
  cw.postMessage = (msg: unknown) => out.push(msg)
  return out
}

async function mountAndReady(): Promise<unknown[]> {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(MarketAppSandbox, { appId: 42 })
  app.mount(root)
  await nextTick()

  const out = sent()
  const cw = frame().contentWindow
  window.dispatchEvent(new MessageEvent('message', { data: { kind: 'ready' }, source: cw }))
  // bootstrap 里有多个 await，铺开微任务队列
  for (let i = 0; i < 10; i++) await nextTick()
  return out
}

let logError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  // happy-dom 会真的去 fetch iframe 的 src（本地没起服务），失败日志走 console.error，
  // 这里一并挡掉，免得一屏 DOMException 堆栈盖住真正的断言失败。
  logError = vi.spyOn(console, 'error').mockImplementation(() => {})
  // 组件里的 iframe 会真的去加载 sandbox.html；这里拦掉，省得每次销毁 frame
  // 都由 happy-dom 打一屏「aborted」堆栈。
  const happy = (window as unknown as { happyDOM?: { settings: Record<string, unknown> } }).happyDOM
  if (happy) {
    happy.settings.fetch = {
      disableSameOriginPolicy: false,
      disableStrictSSL: false,
      requestHeaders: null,
      virtualServers: null,
      interceptor: {
        beforeAsyncRequest: async () =>
          new HappyResponse('<!DOCTYPE html><html><body></body></html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      },
    }
  }
  mocks.getStorage.mockReturnValue('已缓存的应用包代码')
  mocks.ensureBundle.mockResolvedValue('下载到的应用包代码')
  mocks.fetchAppDetail.mockResolvedValue(null)
  mocks.collectSandboxStorage.mockResolvedValue({})
})

afterEach(() => {
  logError.mockRestore()
  app?.unmount()
  root?.remove()
})

describe('MarketAppSandbox 启动', () => {
  it('正常路径：读出存储快照后把 bootstrap 推给沙箱', async () => {
    mocks.collectSandboxStorage.mockResolvedValue({ notes: [] })
    const out = await mountAndReady()

    expect(out).toEqual([
      expect.objectContaining({ kind: 'bootstrap', appId: 42, bundle: '已缓存的应用包代码' }),
    ])
  })

  it('本地无缓存时先下载应用包再引导', async () => {
    mocks.getStorage.mockReturnValue('')
    const out = await mountAndReady()

    expect(mocks.ensureBundle).toHaveBeenCalledWith(42)
    expect(out[0]).toMatchObject({ kind: 'bootstrap', bundle: '下载到的应用包代码' })
  })

  it('应用包拿不到时明确报错，而不是让 iframe 一直空白', async () => {
    mocks.getStorage.mockReturnValue('')
    mocks.ensureBundle.mockResolvedValue('')
    const out = await mountAndReady()

    expect(out).toEqual([{ kind: 'error', message: '应用无法加载' }])
  })

  it('读本地存储快照失败（IndexedDB 被禁 / 打不开）也必须报错', async () => {
    mocks.collectSandboxStorage.mockRejectedValue(new Error('IndexedDB 打开失败'))
    const out = await mountAndReady()

    expect(out, '读快照失败同样要发 error，否则沙箱永远等不到 bootstrap').toEqual([
      { kind: 'error', message: '应用无法加载' },
    ])
    expect(out).not.toContainEqual(expect.objectContaining({ kind: 'bootstrap' }))
    // 给用户的是「加载失败」，给排查的是真实原因，两者都不能少
    expect(logError).toHaveBeenCalledWith('沙箱应用启动失败:', expect.any(Error))
  })

  it('一次挂载只引导一次', async () => {
    mocks.collectSandboxStorage.mockResolvedValue({})
    const out = await mountAndReady()

    const cw = frame().contentWindow
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'ready' }, source: cw }))
    for (let i = 0; i < 10; i++) await nextTick()

    expect(out).toHaveLength(1)
    expect(mocks.collectSandboxStorage).toHaveBeenCalledTimes(1)
  })

  it('忽略不是本 iframe 发来的消息', async () => {
    await mountAndReady()
    mocks.handleSandboxMessage.mockClear()

    window.dispatchEvent(
      new MessageEvent('message', { data: { kind: 'capability', id: 'x' }, source: window }),
    )
    await nextTick()

    expect(mocks.handleSandboxMessage).not.toHaveBeenCalled()
  })
})
