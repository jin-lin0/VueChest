// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App as VueApp } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import App from '../App.vue'
import { useSpecialDaysStore } from '../store'


let app: VueApp | null = null
let root: HTMLDivElement | null = null
let store: ReturnType<typeof useSpecialDaysStore>
let pinia: Pinia

/** 每个用例重置沙箱存储桥，避免持久化数据污染下一用例。 */
const writes: Array<{ key: string; value: unknown }> = []

function installFakeBridge() {
  ;(window as unknown as Record<string, unknown>).__VueChest__ = {
    storage: {
      getStorage: () => null,
      // 与沙箱侧一致地做快照（`sandbox.html` 的 setStorage 就是 JSON 往返）：
      // 直接记引用会让先前那条记录的 value 随后续 push 一起变。
      setStorage: (key: string, value: unknown) => {
        writes.push({ key, value: JSON.parse(JSON.stringify(value)) })
      },
    },
  }
}

function mountApp() {
  root = document.createElement('div')
  document.body.appendChild(root)
  pinia = createPinia()
  setActivePinia(pinia)
  app = createApp(App)
  app.use(pinia)
  app.mount(root)
  store = useSpecialDaysStore()
  return root
}

/** 打开新增弹窗并填好名字/日期 */
function openForm(patch: Record<string, unknown>) {
  store.openAddForm()
  Object.assign(store.form, { name: '奶奶生日', ...patch })
}

const saveButton = () => root!.querySelector<HTMLButtonElement>('.save-btn')!
const errorBox = () => root!.querySelector('.form-error')

/** 当前渲染出来的「日」下拉选项 */
function dayOptions(): number[] {
  const pickers = root!.querySelectorAll('.date-picker')
  const selects = pickers[pickers.length - 1].querySelectorAll('select')
  const daySelect = selects[selects.length - 1]
  return Array.from(daySelect.querySelectorAll('option')).map((o) => Number(o.value))
}

/** 当前渲染出来的第 index 个下拉的选项文本 */
function selectTexts(index: number): string[] {
  const pickers = root!.querySelectorAll('.date-picker')
  const selects = pickers[pickers.length - 1].querySelectorAll('select')
  return Array.from(selects[index].querySelectorAll('option')).map((o) => o.textContent || '')
}

beforeEach(async () => {
  document.body.innerHTML = ''
  writes.length = 0
  installFakeBridge()
  mountApp()
  // 挂载时 store.init() 会把刚读到的快照回写一次（这里读到的是空），那是「打开应用」
  // 而不是「保存」。它异步落队，要等第一个 nextTick 才刷出来，所以先让它跑完再从零起算。
  await nextTick()
  writes.length = 0
})

describe('special-days 保存流程', () => {
  it('「每年重复 + 农历七月三十」能存进去（2026 年七月只有 29 天，以前是静默失败）', async () => {
    openForm({ calendarType: 'lunar', lunarMonth: 7, lunarDay: 30 })
    await nextTick()

    saveButton().click()
    await nextTick()

    expect(store.specialDays).toHaveLength(1)
    const saved = store.specialDays[0]
    expect(saved).toMatchObject({ lunarMonth: 7, lunarDay: 30, solarYear: null })
    // 锚点落在之后第一个真实存在的年份，而不是 2026（2026 年七月只有 29 天）
    expect(saved.solarMonth).toBeGreaterThan(0)
    expect(saved.solarDay).toBeGreaterThan(0)
    expect(store.showForm).toBe(false)
    expect(errorBox()).toBeNull()
    // 而且要真的落到桥接上：只推进微任务、不等任何计时器。
    // 旧实现（500ms 防抖）在这一步是 0 次写入 —— 用户在这 500ms 内点「返回」就整条丢掉。
    expect(writes).toEqual([{ key: 'special_days', value: [saved] }])
  })

  it('「只此一次 + 2026 年 + 农历七月三十」失败时给出中文说明，弹窗不关、不写脏数据', async () => {
    openForm({
      repeatType: 'once',
      solarYear: 2026,
      calendarType: 'lunar',
      lunarMonth: 7,
      lunarDay: 30,
    })
    await nextTick()

    saveButton().click()
    await nextTick()

    expect(store.specialDays).toHaveLength(0)
    expect(store.showForm).toBe(true)
    expect(errorBox()?.textContent?.trim()).toBe('农历 2026 年七月只有 29 天')
    expect(errorBox()?.getAttribute('role')).toBe('alert')
    // 保存失败时连桥接都不该被碰
    expect(writes).toEqual([])
  })

  it('存进去之后卡片立刻显示未来的倒计时（不再是「已过」或空白）', async () => {
    openForm({ calendarType: 'lunar', lunarMonth: 7, lunarDay: 30 })
    await nextTick()
    saveButton().click()
    await nextTick()

    const card = root!.querySelector('.day-card')
    expect(card).not.toBeNull()
    expect(card!.querySelector('.day-name')?.textContent).toBe('奶奶生日')
    expect(card!.querySelector('.day-date')?.textContent).toContain('农历七月三十')
    // 2026 年没有七月三十，但 2027 年有 —— 倒计时必须是未来的天数
    expect(Number(card!.querySelector('.countdown-number')?.textContent)).toBeGreaterThan(0)
    expect(card!.querySelector('.countdown-text')?.textContent).toMatch(/^还有 \d+ 天$/)
  })

  it('重新打开弹窗会清掉上一次的错误提示', async () => {
    openForm({
      repeatType: 'once',
      solarYear: 2026,
      calendarType: 'lunar',
      lunarMonth: 7,
      lunarDay: 30,
    })
    await nextTick()
    saveButton().click()
    await nextTick()
    expect(errorBox()).not.toBeNull()

    store.closeForm()
    await nextTick()
    openForm({})
    await nextTick()

    expect(errorBox()).toBeNull()
  })

  it('农历月份下拉显示中文月名（不再内联一份月名数组）', async () => {
    openForm({ calendarType: 'lunar', lunarMonth: 7, lunarDay: 15 })
    await nextTick()

    expect(selectTexts(0)).toEqual([
      '正月',
      '二月',
      '三月',
      '四月',
      '五月',
      '六月',
      '七月',
      '八月',
      '九月',
      '十月',
      '冬月',
      '腊月',
    ])
  })

  it('「只此一次」选好年份后，日期选项不再给出那年不存在的日期', async () => {
    openForm({
      repeatType: 'once',
      solarYear: 2026,
      calendarType: 'lunar',
      lunarMonth: 7,
      lunarDay: 15,
    })
    await nextTick()
    expect(dayOptions()).toHaveLength(29)
    expect(dayOptions()).not.toContain(30)

    // 换成「每年重复」后三十必须重新可选：2026 年没有，但别的年份有
    store.form.repeatType = 'yearly'
    await nextTick()
    expect(dayOptions()).toContain(30)
  })

  it('阳历二月按年份给选项：平年 28 天、闰年 29 天', async () => {
    openForm({
      repeatType: 'once',
      solarYear: 2026,
      calendarType: 'solar',
      solarMonth: 2,
      solarDay: 1,
    })
    await nextTick()
    expect(dayOptions()).toHaveLength(28)

    store.form.solarYear = 2024
    await nextTick()
    expect(dayOptions()).toHaveLength(29)
  })

  it('用户把月份改小后，超范围的天数被收回来（沿用原有的钳制行为）', async () => {
    openForm({
      repeatType: 'once',
      solarYear: 2026,
      calendarType: 'solar',
      solarMonth: 1,
      solarDay: 31,
    })
    await nextTick()

    const monthSelect = root!.querySelectorAll('.date-picker select')[0] as HTMLSelectElement
    monthSelect.value = '2'
    monthSelect.dispatchEvent(new Event('change'))
    await nextTick()

    expect(store.form.solarMonth).toBe(2)
    expect(store.form.solarDay).toBe(28)
  })
})

// 每个用例结束都拆掉，避免上一个用例的 DOM 和 app 影响下一个
afterEach(() => {
  app?.unmount()
  app = null
  root?.remove()
  root = null
})
