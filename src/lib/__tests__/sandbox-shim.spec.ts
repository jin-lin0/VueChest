// @vitest-environment happy-dom

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// happy-dom 环境下 import.meta.url 不是 file: URL，按 vitest 的 root（前端工程根）定位。
const SANDBOX_HTML = resolve(process.cwd(), 'public/sandbox.html')
if (!existsSync(SANDBOX_HTML)) {
  throw new Error(`找不到沙箱页：${SANDBOX_HTML}（请在 VueChest 目录下运行 vitest）`)
}
const html = readFileSync(SANDBOX_HTML, 'utf8')

/** 取出内联脚本（不带 src 的 <script>）。 */
function shimScript(): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('sandbox.html 里找不到内联脚本')
  return match[1]
}

const win = window as unknown as Record<string, unknown>

interface Outgoing {
  kind: string
  id?: string
  name?: string
  message?: string
}

let outbox: Outgoing[] = []

function errorBox(): HTMLElement {
  return document.getElementById('sandbox-error') as HTMLElement
}

/** 造一个只记录 mount 的 Vue 桩。 */
function makeVue(onMount: () => void = () => {}) {
  return {
    createApp: () => ({
      use() {
        return this
      },
      mount() {
        onMount()
      },
    }),
  }
}

function boot(vue: unknown = makeVue()) {
  document.body.innerHTML = '<div id="app"></div><div id="sandbox-error">&nbsp;</div>'
  win.Vue = vue
  win.Pinia = undefined
  delete win.MarketApp
  outbox = []
  // 沙箱页用裸标识符 `parent` 发消息；这里换成收件箱，断言不需要真的跨窗口。
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: { postMessage: (msg: Outgoing) => outbox.push(msg) },
  })
  new Function(shimScript())()
}

function hostSends(data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data }))
}

function bridge<T = Record<string, unknown>>(): T {
  return win.__VueChest__ as T
}

beforeEach(() => {
  outbox = []
})

afterEach(() => {
  delete win.MarketApp
})

describe('sandbox.html 与宿主的消息协议', () => {
  it('宿主发来 error 时渲染错误态，而不是留一个空白 iframe', () => {
    boot()
    expect(errorBox().style.display).not.toBe('block')

    hostSends({ kind: 'error', message: '应用无法加载' })

    expect(errorBox().style.display).toBe('block')
    expect(errorBox().textContent).toContain('应用无法加载')
  })

  it('error 消息没带文案时也有兜底文案', () => {
    boot()

    hostSends({ kind: 'error' })

    expect(errorBox().style.display).toBe('block')
    expect(errorBox().textContent).toContain('应用无法加载')
  })

  it('Vue 全局构建缺失时立刻给出可读的失败原因', () => {
    boot(null)

    expect(errorBox().style.display).toBe('block')
    expect(errorBox().textContent).toContain('Vue')
  })

  it('启动即向宿主报到，等 bootstrap', () => {
    boot()

    expect(outbox).toEqual([{ kind: 'ready' }])
    expect(errorBox().style.display).not.toBe('block')
  })

  it('bootstrap 注入存储快照 / 权限 / 主题，并挂载应用', () => {
    let mounted = false
    boot(makeVue(() => (mounted = true)))
    win.MarketApp = { default: { component: { render: () => null } } }

    hostSends({
      kind: 'bootstrap',
      bundle: '',
      storage: { notes: [{ id: 1 }] },
      permissions: ['notify'],
      theme: true,
      parentOrigin: 'https://vuechest.example',
    })

    expect(mounted, 'bootstrap 后必须挂载应用').toBe(true)
    const b = bridge<{
      permissions: string[]
      storage: { getStorage: (k: string, d?: unknown) => unknown }
    }>()
    expect(b.permissions).toEqual(['notify'])
    expect(b.storage.getStorage('notes', [])).toEqual([{ id: 1 }])
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(errorBox().style.display).not.toBe('block')
  })

  it('theme 只切主题，不重复引导', () => {
    let mounts = 0
    boot(makeVue(() => mounts++))
    win.MarketApp = { default: { component: { render: () => null } } }
    hostSends({ kind: 'bootstrap', bundle: '', theme: false, parentOrigin: 'https://a' })
    expect(mounts).toBe(1)

    hostSends({ kind: 'theme', isDark: true })

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(mounts, 'theme 不应触发第二次挂载').toBe(1)
  })

  it('应用包缺 component 入口时走错误态', () => {
    boot()
    win.MarketApp = { default: {} }

    hostSends({ kind: 'bootstrap', bundle: '', parentOrigin: 'https://a' })

    expect(errorBox().style.display).toBe('block')
    expect(errorBox().textContent).toContain('component')
  })

  it('能力请求带 id 上报宿主，回包按 id 归还 Promise', async () => {
    boot()
    const b = bridge<{
      cloud: { get: (k: string) => Promise<unknown> }
      user: { profile: () => Promise<unknown> }
    }>()

    const pending = [b.cloud.get('k'), b.user.profile()]
    const requests = outbox.filter((m) => m.kind === 'capability')
    expect(requests.map((m) => m.name)).toEqual(['cloud.get', 'profile'])
    const [first, second] = requests
    expect(first.kind).toBe('capability')
    expect(first.id).not.toBe(second.id)

    hostSends({ kind: 'capability-response', id: first.id, value: 'v' })
    await expect(pending[0]).resolves.toBe('v')

    hostSends({ kind: 'capability-response', id: second.id, error: '未授权的能力: profile' })
    await expect(pending[1]).rejects.toThrow('未授权的能力: profile')
  })

  it('storage.set 经能力通道落到宿主，不在沙箱里自建一套存储', () => {
    boot()
    const b = bridge<{ storage: { setStorage: (k: string, v: unknown) => void } }>()

    b.storage.setStorage('todos', [1, 2])

    const posted = outbox.find((m) => m.name === 'storage.set')
    expect(posted, '本地存储必须走宿主桥（沙箱是 opaque origin，没有自己的库）').toBeDefined()
    expect(posted?.kind).toBe('capability')
  })

  it('未知消息被忽略，不会把页面打崩', () => {
    boot()

    hostSends({ kind: 'nonsense', payload: 1 })
    hostSends(null)
    hostSends('字符串')

    expect(errorBox().style.display).not.toBe('block')
    expect(outbox).toEqual([{ kind: 'ready' }])
  })
})
