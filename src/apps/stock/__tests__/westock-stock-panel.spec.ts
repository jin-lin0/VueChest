// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useStockStore } from '@/stores/stock'
import { westockCommand, type WestockResult } from '@/stores/westock'
import WestockStockPanel from '../components/WestockStockPanel.vue'

vi.mock('@/lib/storage', () => ({ getStorage: (_key: string, fallback: unknown) => fallback }))
vi.mock('@/stores/westock', async (original) => ({
  ...(await original<typeof import('@/stores/westock')>()),
  westockCommand: vi.fn(),
}))
vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: ['to'],
    setup:
      (props, { slots }) =>
      () =>
        h('a', { href: props.to }, slots.default?.()),
  }),
}))

const command = vi.mocked(westockCommand)
const result = (text: string): WestockResult => ({
  success: true,
  engine: 'data',
  args: [],
  kind: 'text',
  text,
})
let app: App
let root: HTMLDivElement
const selected = ref<'quote' | 'finance' | 'notice'>('quote')

async function flush() {
  for (let i = 0; i < 8; i += 1) await nextTick()
}
async function mount(initial: 'quote' | 'finance' | 'notice') {
  selected.value = initial
  const pinia = createPinia()
  setActivePinia(pinia)
  useStockStore().stockCode = '600000'
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ setup: () => () => h(WestockStockPanel, { initialCommand: selected.value }) })
  app.use(pinia)
  app.mount(root)
  await flush()
}
beforeEach(() => {
  command.mockReset()
  command.mockResolvedValue(result('Sample'))
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('financial and notice entries reuse authenticated westock commands', () => {
  it('opens financial data directly with initialized main-report selectors', async () => {
    await mount('finance')
    expect(command).toHaveBeenCalledExactlyOnceWith('finance', {
      code: 'sh600000',
      type: 'main',
      num: '4',
    })
    expect(root.querySelector('select')?.value).toBe('main')
  })
  it('opens notices directly without calling another provider', async () => {
    await mount('notice')
    expect(command).toHaveBeenCalledExactlyOnceWith('notice', {
      code: 'sh600000',
      sub: 'list',
      limit: '10',
    })
  })
  it('switches entries and rejects the late result from the previous command', async () => {
    let resolve!: (value: WestockResult) => void
    const pending = new Promise<WestockResult>((yes) => {
      resolve = yes
    })
    command.mockImplementation(async (name) =>
      name === 'finance' ? pending : result('Notice response'),
    )
    await mount('finance')
    selected.value = 'notice'
    await flush()
    expect(root.textContent).toContain('Notice response')
    resolve(result('Old financial response'))
    await flush()
    expect(root.textContent).toContain('Notice response')
    expect(root.textContent).not.toContain('Old financial response')
    expect(command).toHaveBeenCalledTimes(2)
  })
  it('provides the existing login entry when westock requires authentication', async () => {
    command.mockRejectedValue(Object.assign(new Error('Please log in'), { status: 401 }))
    await mount('finance')
    expect(root.querySelector('a[href="/login"]')).not.toBeNull()
    expect(root.textContent).toContain('Please log in')
  })
})
