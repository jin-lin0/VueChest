// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { createApp, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RhythmApp from '../App.vue'
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/storage', () => ({
  getStorage: (_key: string, fallback?: unknown) => fallback,
  setStorage: vi.fn(),
  removeStorage: vi.fn(),
}))
vi.mock('@/apps/game-center/profile', () => ({ recordGameResult: vi.fn() }))
vi.mock('../core/analyze', () => ({ analyze: vi.fn(), gridAlignment: vi.fn() }))
let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

describe('rhythm analysis lifecycle', () => {
  it('does not create an AudioContext after a pending file read completes on a closed page', async () => {
    const createContext = vi.fn()
    vi.stubGlobal('AudioContext', createContext)
    const root = document.createElement('div')
    app = createApp(RhythmApp)
    app.mount(root)
    const picker = root.querySelector<HTMLInputElement>('input[accept="audio/*"]')!
    let finish!: (value: ArrayBuffer) => void
    const file = {
      name: 'pending.wav',
      size: 44,
      lastModified: 1,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        }),
    }
    Object.defineProperty(picker, 'files', { value: [file] })
    picker.dispatchEvent(new Event('change'))
    await nextTick()
    expect(root.textContent).toContain('获取')
    app.unmount()
    app = undefined
    finish(new ArrayBuffer(44))
    await nextTick()
    await nextTick()
    expect(createContext).not.toHaveBeenCalled()
    expect(document.querySelectorAll('link[data-rhythm-font]')).toHaveLength(0)
  })
})
