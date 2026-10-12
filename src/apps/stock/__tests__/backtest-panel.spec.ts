// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useStockStore } from '@/stores/stock'
import { resolveInstrument, type KlineData } from '../model'
import BacktestPanel from '../components/BacktestPanel.vue'

const addToast = vi.hoisted(() => vi.fn())
vi.mock('@/lib/storage', () => ({ getStorage: (_key: string, fallback: unknown) => fallback }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../components/ResearchLineChart.vue', () => ({ default: { render: () => null } }))

let app: App
let root: HTMLDivElement
const bars = (values: number[]): KlineData[] =>
  values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: value,
    close: value,
    high: value + 1,
    low: value - 1,
    volume: 1000,
  }))
async function mount(data: KlineData[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const stock = useStockStore(pinia)
  const meta = resolveInstrument('sh600000')
  stock.selectedInstrument = meta
  stock.stockCode = meta.code
  stock.result = {
    ...meta,
    date: '2026-01-07',
    asOf: '2026-01-07 15:00:00',
    fetchedAt: Date.now(),
    changePercent: 0,
    open: 10,
    close: 10,
    high: 11,
    low: 9,
    volume: 1000,
  }
  stock.dailyKlineData = data
  stock.dailyCompletedThrough = '2026-01-12'
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(BacktestPanel)
  app.use(pinia)
  app.mount(root)
  const inputs = root.querySelectorAll<HTMLInputElement>('input[type="number"]')
  for (const [index, value] of [2, 3, 10000].entries()) {
    inputs[index].value = String(value)
    inputs[index].dispatchEvent(new Event('input', { bubbles: true }))
  }
  await nextTick()
}
async function run() {
  root.querySelector<HTMLButtonElement>('.backtest-form button')!.click()
  await nextTick()
}
async function enableCloseSell() {
  const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
  addToast.mockClear()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.useRealTimers()
})

describe('backtest close-sale configuration', () => {
  it('defaults to the next open and reruns with the selected close-sale mode', async () => {
    const data = bars([10, 10, 10, 11, 12, 9, 8])
    data[4].open = 15
    data[4].high = 16
    data[6].open = 7
    data[6].low = 6
    await mount(data)
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
    await run()
    expect(root.querySelector('.trade-list')?.textContent).toContain('2026-01-07 · ¥7.00')
    await enableCloseSell()
    expect(root.querySelector('.trade-list')).toBeNull()
    expect(root.textContent).toContain('未验证真实尾盘成交')
    await run()
    expect(root.querySelector('.trade-list')?.textContent).toContain('2026-01-06 · ¥9.00')
    expect(root.textContent).toContain('卖出模式：尾盘收盘价近似 · T+1')
    expect(addToast).not.toHaveBeenCalled()
  })

  it('keeps the close-sale mode subject to T+1 when a purchase-day sell signal occurs', async () => {
    const data = bars([10, 10, 10, 11, 8, 7])
    data[4].open = 12
    data[4].high = 13
    data[5].open = 9
    data[5].high = 10
    await mount(data)
    await enableCloseSell()
    await run()
    const trade = root.querySelector('.trade-list')?.textContent
    expect(trade).toContain('买入2026-01-05 · ¥12.00')
    expect(trade).toContain('卖出2026-01-06 · ¥9.00')
    expect(addToast).not.toHaveBeenCalled()
  })
})
