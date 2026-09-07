// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import ChatApp from '../App.vue'
import { fetchConversation, fetchConversationPage } from '../config'
import { useChatStream } from '../composables/useChatStream'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/db', () => ({
  dbSet: vi.fn().mockResolvedValue(undefined),
  dbGet: vi.fn().mockResolvedValue(undefined),
  dbDelete: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/components/common/MarkdownView.vue', () => ({
  default: defineComponent({ props: ['content'], setup: (props) => () => h('div', props.content) }),
}))
vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}))
vi.mock('@/components/common/Drawer.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}))
vi.mock('../components/ChatSidebar.vue', () => ({
  default: defineComponent({
    props: ['sessions', 'loading'],
    emits: ['select', 'new', 'search'],
    setup(props, { emit }) {
      return () =>
        h('nav', { 'aria-busy': props.loading }, [
          h('button', { 'data-new': '', onClick: () => emit('new') }, 'new'),
          h('input', {
            'data-search': '',
            onInput: (e: Event) => emit('search', (e.target as HTMLInputElement).value),
          }),
          ...props.sessions.map((session: { id: string; title: string }) =>
            h(
              'button',
              { 'data-session': session.id, onClick: () => emit('select', session.id) },
              session.title,
            ),
          ),
        ])
    },
  }),
}))
vi.mock('../config', async (original) => ({
  ...(await original<typeof import('../config')>()),
  fetchProviders: async () => [
    { id: 'test', name: 'Test', defaultModel: 'model', models: [{ id: 'model', name: 'Model' }] },
  ],
  fetchConversationPage: vi.fn(),
  fetchConversation: vi.fn(),
}))
vi.mock('../composables/useChatStream', async (original) => ({
  ...(await original<typeof import('../composables/useChatStream')>()),
  useChatStream: vi.fn(),
}))
let app: App
let root: HTMLElement
const history = vi.mocked(fetchConversation)
const pages = vi.mocked(fetchConversationPage)
const chat = vi.fn()
const session = (id: string) => ({
  id,
  title: `Session ${id}`,
  provider: 'test',
  model: 'model',
  createdAt: 1,
  updatedAt: id === 'A' ? 2 : 1,
})
const conversation = (content: string) => ({
  ...session('A'),
  messages: [{ role: 'assistant' as const, content, id: 1 }],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function flush() {
  for (let i = 0; i < 10; i++) await nextTick()
}
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ChatApp)
  app.mount(root)
  await flush()
}
async function click(selector: string) {
  root.querySelector<HTMLButtonElement>(selector)!.click()
  await flush()
}
async function send(text: string) {
  const input = root.querySelector('textarea')!
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flush()
  await click('.send-btn')
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  chat.mockReset()
  pages.mockResolvedValue({
    items: [session('A'), session('B')],
    page: 1,
    hasMore: false,
    total: 2,
  })
  history.mockResolvedValue(conversation('Initial history'))
  vi.mocked(useChatStream).mockReturnValue({ streamChat: chat })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('chat UI concurrent actions', () => {
  it('keeps the most recently selected history even when an old request resolves last', async () => {
    await mount()
    const slow = deferred<Awaited<ReturnType<typeof fetchConversation>>>()
    history
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(conversation('Current B'))
    await click('[data-session="A"]')
    const oldSignal = history.mock.calls.at(-1)?.[1]
    await click('[data-session="B"]')
    expect(oldSignal?.aborted).toBe(true)
    slow.resolve(conversation('Stale A'))
    await flush()
    expect(root.textContent).toContain('Current B')
    expect(root.textContent).not.toContain('Stale A')
  })

  it('keeps the latest history when the user switches away and back to the same conversation', async () => {
    await mount()
    const slow = deferred<Awaited<ReturnType<typeof fetchConversation>>>()
    history
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(conversation('Current B'))
      .mockResolvedValueOnce(conversation('Latest A'))
    await click('[data-session="A"]')
    await click('[data-session="B"]')
    await click('[data-session="A"]')
    slow.resolve(conversation('Stale A'))
    await flush()
    expect(root.textContent).toContain('Latest A')
    expect(root.textContent).not.toContain('Stale A')
  })

  it.each(['success', 'failure'] as const)(
    'ignores an outdated search %s while the latest search is still loading',
    async (outcome) => {
      await mount()
      const old = deferred<Awaited<ReturnType<typeof fetchConversationPage>>>()
      const current = deferred<Awaited<ReturnType<typeof fetchConversationPage>>>()
      pages.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise)
      const input = root.querySelector<HTMLInputElement>('[data-search]')!
      for (const query of ['old', 'latest']) {
        input.value = query
        input.dispatchEvent(new Event('input'))
        await flush()
      }
      if (outcome === 'success') {
        old.resolve({ items: [session('Stale')], page: 1, hasMore: false, total: 1 })
      } else {
        old.reject(new Error('Outdated search failed'))
      }
      await flush()
      expect(root.querySelector('[data-session="Stale"]')).toBeNull()
      expect(root.querySelector('.error-bar')).toBeNull()
      expect(root.querySelector('nav')?.getAttribute('aria-busy')).toBe('true')

      current.resolve({ items: [session('Latest')], page: 1, hasMore: false, total: 1 })
      await flush()
      expect(root.querySelector('[data-session="Latest"]')).not.toBeNull()
      expect(root.querySelector('nav')?.getAttribute('aria-busy')).toBe('false')
    },
  )

  it('ignores an old stream failure and its finally after a new conversation starts generating', async () => {
    await mount()
    const old = deferred<string>()
    const current = deferred<string>()
    chat
      .mockImplementationOnce(async function* () {
        yield await old.promise
      })
      .mockImplementationOnce(async function* () {
        yield await current.promise
      })
    await send('Old question')
    await click('[data-new]')
    await send('New question')
    expect(chat).toHaveBeenCalledTimes(2)
    old.reject(new Error('Late network error'))
    await flush()
    expect(root.querySelector('.stop')).not.toBeNull()
    expect(root.querySelector('.error-bar')).toBeNull()
    expect(root.textContent).toContain('New question')
    current.resolve('New answer')
    await flush()
    expect(root.textContent).toContain('New answer')
    expect(root.querySelector('.stop')).toBeNull()
  })

  it('cancels pending history when starting a new conversation and permits sending immediately', async () => {
    await mount()
    const old = deferred<Awaited<ReturnType<typeof fetchConversation>>>()
    history.mockImplementationOnce(() => old.promise)
    await click('[data-session="A"]')
    await click('[data-new]')
    old.reject(new Error('Old history failed'))
    chat.mockImplementationOnce(async function* () {
      yield 'New answer'
    })
    await send('New question')
    expect(root.querySelector('.error-bar')).toBeNull()
    expect(root.textContent).toContain('New answer')
  })

  it('retains partial output on failure and restores unsent input when nothing arrived', async () => {
    await mount()
    chat.mockImplementationOnce(async function* () {
      yield 'Useful partial'
      throw new Error('disconnect')
    })
    await send('Question')
    expect(root.textContent).toContain('Useful partial')
    expect(root.querySelector('.error-bar')).not.toBeNull()
    chat.mockImplementationOnce(async function* () {
      throw new Error('disconnect')
      yield ''
    })
    await send('Retry me')
    expect(root.querySelector('textarea')!.value).toBe('Retry me')
    expect(root.querySelectorAll('.message.user')).toHaveLength(1)
  })

  it('does not submit Enter while the user is composing Chinese text', async () => {
    await mount()
    const input = root.querySelector('textarea')!
    input.value = '中文'
    input.dispatchEvent(new Event('input'))
    await flush()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))
    await flush()
    expect(chat).not.toHaveBeenCalled()
  })
})
