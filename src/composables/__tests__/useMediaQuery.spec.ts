// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { useMediaQuery } from '../useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const state = { matches: initial }
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return state.matches
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }))
  return {
    async cross(next: boolean) {
      state.matches = next
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent))
      for (let i = 0; i < 2; i++) await nextTick()
    },
    listenerCount: () => listeners.size,
  }
}

let app: App
let root: HTMLElement

function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    setup() {
      const compact = useMediaQuery('(max-width: 520px)')
      return () => h('span', String(compact.value))
    },
  })
  app.mount(root)
  return () => root.textContent
}

afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('useMediaQuery', () => {
  it('在 setup 阶段同步读出初始值', async () => {
    installMatchMedia(true)
    const read = mount()

    // 不先 await：首帧就必须是正确形态，否则窄屏会先按宽屏渲染再跳变
    expect(read()).toBe('true')
  })

  it('跟随断点变化更新', async () => {
    const media = installMatchMedia(false)
    const read = mount()
    expect(read()).toBe('false')

    await media.cross(true)
    expect(read()).toBe('true')

    await media.cross(false)
    expect(read()).toBe('false')
  })

  it('卸载时摘掉监听', async () => {
    const media = installMatchMedia(false)
    mount()
    expect(media.listenerCount()).toBe(1)

    app.unmount()
    await nextTick()

    expect(media.listenerCount()).toBe(0)
  })

  it('matchMedia 不可用时退化为 false', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const read = mount()

    expect(read()).toBe('false')
  })
})
