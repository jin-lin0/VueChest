// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useStockStore } from '@/stores/stock'
import { resolveInstrument } from '../model'
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
const selected = ref<'research' | 'finance' | 'notice'>('research')

async function flush() {
  for (let i = 0; i < 8; i += 1) await nextTick()
}
function selectTrigger(label: string) {
  return root.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`)!
}
async function choose(label: string, optionText: string) {
  selectTrigger(label).click()
  await flush()
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (element) => element.textContent?.includes(optionText),
  )!
  expect(option).toBeDefined()
  option.click()
  await flush()
}
async function mount(initial: 'research' | 'finance' | 'notice', symbol = 'sh600000') {
  selected.value = initial
  const pinia = createPinia()
  setActivePinia(pinia)
  const stock = useStockStore(pinia)
  const meta = resolveInstrument(symbol)
  stock.stockCode = meta.code
  stock.selectedInstrument = meta
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ setup: () => () => h(WestockStockPanel, { mode: selected.value }) })
  app.use(pinia)
  app.mount(root)
  await flush()
  return stock
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
  it('opens financial data with the a single income statement instead of combining different report tables', async () => {
    await mount('finance')
    expect(command).toHaveBeenCalledExactlyOnceWith('finance', {
      code: 'sh600000',
      type: 'lrb',
      num: '4',
    })
    expect(root.querySelector('[role=combobox][aria-label="报表类型"]')?.textContent).toContain(
      '利润表',
    )
    expect(root.querySelector('nav')).toBeNull()
    expect(root.querySelector('[aria-label="研究项目"]')).toBeNull()
    expect(root.querySelector('select')).toBeNull()
  })
  it('opens notices directly without calling another provider', async () => {
    await mount('notice')
    expect(command).toHaveBeenCalledExactlyOnceWith('notice', {
      code: 'sh600000',
      sub: 'list',
      limit: '10',
    })
    expect(root.querySelector('nav')).toBeNull()
    expect(root.querySelector('[aria-label="研究项目"]')).toBeNull()
    expect(root.querySelector('.ws-run')?.textContent).toContain('刷新数据')
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
  it('does not infer a load-more action for a panel without pagination', async () => {
    command.mockResolvedValue({
      ...result(''),
      kind: 'table',
      columns: ['code', 'name'],
      rows: [{ code: 'sh600000', name: 'Sample' }],
      meta: '共 40 条 | 显示 1-20/40',
    })
    await mount('finance')
    expect(root.textContent).toContain('Sample')
    expect(root.textContent).not.toContain('加载更多')
  })
  it('guides ETF users to fund reports without querying company financial statements', async () => {
    await mount('finance', 'sh560860')
    expect(command).not.toHaveBeenCalled()
    expect(root.textContent).toContain('基金财务信息请查阅基金定期报告')
    expect(root.querySelector('.ws-toolbar')).toBeNull()
    expect(root.querySelector('.ws-result')).toBeNull()
  })
  it('does not query company financial statements for an index', async () => {
    await mount('finance', 'sh000001')
    expect(command).not.toHaveBeenCalled()
    expect(root.textContent).toContain('请选择成分股查看公司财务')
  })
  it('loads company financials after switching from an ETF to a stock', async () => {
    const stock = await mount('finance', 'sh560860')
    stock.stockCode = '600000'
    stock.selectedInstrument = resolveInstrument('sh600000')
    await flush()
    expect(command).toHaveBeenCalledExactlyOnceWith('finance', {
      code: 'sh600000',
      type: 'lrb',
      num: '4',
    })
    expect(root.textContent).toContain('Sample')
    expect(root.querySelector('.ws-finance-hint')).toBeNull()
  })
  it('ignores a pending company response after switching to an ETF', async () => {
    let resolve!: (value: WestockResult) => void
    command.mockReturnValue(
      new Promise<WestockResult>((yes) => {
        resolve = yes
      }),
    )
    const stock = await mount('finance')
    stock.stockCode = '560860'
    stock.selectedInstrument = resolveInstrument('sh560860')
    await flush()
    resolve(result('Old company financials'))
    await flush()
    expect(command).toHaveBeenCalledTimes(1)
    expect(root.textContent).toContain('基金定期报告')
    expect(root.textContent).not.toContain('Old company financials')
  })
})

describe('research project and shared selectors', () => {
  it('offers searchable research projects without duplicating financials or notices', async () => {
    await mount('research')
    expect(command).toHaveBeenCalledExactlyOnceWith('technical', { code: 'sh600000', group: 'all' })
    expect(root.querySelector('nav')).toBeNull()
    selectTrigger('研究项目').click()
    await flush()
    const options = document.querySelector('[role="listbox"]')!
    expect(options.textContent).toContain('行情数据 · K线')
    expect(options.textContent).not.toContain('财务数据')
    expect(options.textContent).not.toContain('公司公告')
    const search = document.querySelector<HTMLInputElement>('[aria-label="搜索选项"]')!
    search.value = 'K线'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1)
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(command).toHaveBeenLastCalledWith('kline', {
      code: 'sh600000',
      period: 'day',
      fq: 'qfq',
      limit: '120',
    })
    expect(document.activeElement).toBe(selectTrigger('研究项目'))
    expect(root.querySelector('h2')?.textContent).toBe('K线')
    expect(root.querySelector('select')).toBeNull()
    await choose('周期', '周线')
    await choose('复权', '不复权')
    expect(command).toHaveBeenLastCalledWith('kline', {
      code: 'sh600000',
      period: 'week',
      fq: 'bfq',
      limit: '120',
    })
  })
  it('uses the shared keyboard selector for indicator groups', async () => {
    await mount('research')
    const trigger = selectTrigger('指标组')
    trigger.focus()
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await flush()
    }
    expect(command).toHaveBeenLastCalledWith('technical', { code: 'sh600000', group: 'macd' })
    trigger.click()
    await flush()
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    expect(command).toHaveBeenCalledTimes(2)
  })
  it('requests the selected financial report and period count, with readable report metadata', async () => {
    command.mockResolvedValue({
      ...result(''),
      kind: 'table',
      title: 'zcfz',
      meta: '区间内 1 个交易日',
      columns: ['EndDate'],
      rows: [{ EndDate: '2026-06-30' }],
    })
    await mount('finance')
    await choose('报表类型', '资产负债表')
    await choose('期数', '最近 8 期')
    expect(command).toHaveBeenLastCalledWith('finance', {
      code: 'sh600000',
      type: 'zcfz',
      num: '8',
    })
    expect(root.textContent).toContain('资产负债表')
    expect(root.textContent).toContain('1 期报表记录')
    expect(root.textContent).not.toContain('交易日')
    expect(root.textContent).not.toContain('zcfz')
  })
  it('identifies market-wide research without binding it to the selected stock', async () => {
    await mount('research')
    await choose('研究项目', '脱水研报')
    expect(command).toHaveBeenLastCalledWith('dehydrated', { limit: '10' })
    expect(root.querySelector('.ws-target')?.textContent).toContain('全市场')
    expect(root.querySelector('.ws-target')?.textContent).not.toContain('sh600000')
  })
})
