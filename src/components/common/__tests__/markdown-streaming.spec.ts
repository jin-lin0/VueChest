// @vitest-environment happy-dom
import { createApp, h, nextTick, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownView from '../MarkdownView.vue'
const render = vi.hoisted(() => vi.fn((text: string) => text))
vi.mock('@/lib/markdown', () => ({ renderMarkdown: render }))
afterEach(() => vi.unstubAllGlobals())

describe('streaming markdown render budget', () => {
  it('parses a burst once per frame, flushes the final text, and releases pending work', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let id = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
    const state = reactive({ content: '', streaming: true })
    const root = document.createElement('div')
    const app = createApp({ render: () => h(MarkdownView, state) })
    render.mockClear()
    app.mount(root)
    for (let i = 0; i < 30; i++) {
      state.content += 'a'
      await nextTick()
    }
    expect(render).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(1)
    const callback = [...frames.values()][0]
    frames.clear()
    callback(16)
    await nextTick()
    expect(render).toHaveBeenCalledTimes(2)
    expect(root.textContent).toBe('a'.repeat(30))
    state.content += '末尾'
    await nextTick()
    state.streaming = false
    await nextTick()
    expect(frames.size).toBe(0)
    expect(root.textContent).toBe('a'.repeat(30) + '末尾')
    state.streaming = true
    state.content += '下轮'
    await nextTick()
    app.unmount()
    expect(frames.size).toBe(0)
  })
})
