// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/lib/request'
import { useStockStore } from '@/stores/stock'
import { resolveInstrument } from '../model'
import StockWorkspace from '../App.vue'

const route = vi.hoisted(() => ({ query: {} as Record<string, string> }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/storage', () => ({
  getStorage: (_key: string, fallback: unknown) => fallback,
  setStorage: vi.fn(),
}))
vi.mock('@/lib/request', () => ({ api: { get: vi.fn() } }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('../components/OverviewPanel.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))

let app: App
let root: HTMLDivElement
async function flush() {
  for (let index = 0; index < 20; index++) await nextTick()
}
async function mount() {
  const pinia = createPinia()
  setActivePinia(pinia)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(StockWorkspace)
  app.use(pinia)
  app.mount(root)
  await flush()
  return useStockStore(pinia)
}
beforeEach(() => {
  route.query = {}
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (path.includes('/search'))
      return { data: [{ ...resolveInstrument('sh000001'), name: 'Index' }] }
    if (path.includes('/quotes'))
      return {
        data: [
          {
            ...resolveInstrument('sh000001'),
            name: 'Index',
            source: 'tencent',
            price: 3800,
            asOf: '20261009150000',
            fetchedAt: Date.now(),
          },
        ],
      }
    if (path.includes('/kline'))
      return {
        data: [['2026-10-09', '3800', '3800', '3810', '3790', '1000']],
        symbol: 'sh000001',
        period: 'day',
        adjustment: 'none',
        completedThrough: '2026-10-09',
      }
    return { data: [] }
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('canonical identities at workspace entry points', () => {
  it('resolves a six-digit search using the provider identity instead of guessing the exchange', async () => {
    const stock = await mount()
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!
    input.value = '000001'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    const requests = vi.mocked(api.get).mock.calls.map(([path]) => path)
    expect(requests).toContain('/api/research-stocks/search?q=000001')
    expect(requests).toContain('/api/research-stocks/quotes?symbols=sh000001')
    expect(requests.some((path) => path.includes('sz000001'))).toBe(false)
    expect(stock.formattedCode).toBe('sh000001')
    expect(stock.result?.type).toBe('index')
  })

  it('does not translate a bare-code route plus market into a domain identity', async () => {
    route.query = { code: '000001', market: 'sh' }
    const stock = await mount()
    expect(stock.selectedInstrument).toBeNull()
    expect(vi.mocked(api.get).mock.calls.map(([path]) => path)).toEqual([
      '/api/research-stocks/market-overview',
    ])
  })
})
