import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useListStore } from '../../shared/useListStore'
import { findLunarDate, getLunarMonthDays, lunarToSolar } from './lunar'
import { getStorage } from './utils'

const STORAGE_KEY = 'special_days'

export interface SpecialDay {
  id: number
  name: string
  repeatType: 'yearly' | 'once'
  calendarType: 'solar' | 'lunar'
  solarYear: number | null
  solarMonth: number
  solarDay: number
  lunarMonth: number
  lunarDay: number
  emoji: string
  createdAt: string
}

export interface EditForm {
  name: string
  repeatType: 'yearly' | 'once'
  calendarType: 'solar' | 'lunar'
  solarYear: number | null
  solarMonth: number
  solarDay: number
  lunarMonth: number
  lunarDay: number
  emoji: string
}

/**
 * 日期换算相关的纯函数都放在模块级，而不是 store 的方法里：
 * 它们不依赖任何响应式状态，放在这里才能脱离 pinia 直接测。
 */

/** 阳历每月天数；二月按 28 天，闰年另算。 */
const SOLAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/**
 * 阳历某月的天数。
 *
 * `year` 为 `null`（「每年重复」，不知道具体哪一年）时给出**最大可能**值：二月按 29 天，
 * 否则闰年那一次就选不到了。给了年份就按该年真实天数，选项里不会出现 2 月 29 日。
 */
export function getMaxSolarDay(month: number, year: number | null = null): number {
  const base = SOLAR_MONTH_DAYS[month - 1] || 31
  if (month !== 2) return base
  if (year === null) return 29
  return isLeapYear(year) ? 29 : 28
}

/**
 * 农历某月的天数。
 *
 * 农历月只有 29 或 30 天，且**同一个月在不同年份天数不同**（1900-2100 年间各月都有
 * 70~110 个年份只有 29 天）。给了年份就按该年真实天数；没给年份就取最大值 30 —— 因为
 * 「每年重复」的「七月三十」虽然今年（2026）不存在，但别的年份存在，不能把它从选项里删掉。
 */
export function getMaxLunarDay(month: number, year: number | null = null): number {
  if (year === null) return 30
  try {
    return getLunarMonthDays(year, month)
  } catch {
    // 年份越界或月份非法：退化为最大值，选项列表不能因此崩掉
    return 30
  }
}

/**
 * 生成 1..max 的日选项，但**保留超出上限的当前值**。
 *
 * 已存的数据可能超出当前年份的合法范围（例如往年存下的「七月三十」，或改年份后没跟着改日）。
 * 这种情况不能静默改写用户的数据，也不能让下拉框显示空白——把原值留在选项里，
 * 由保存时的校验给出明确说明。
 */
export function buildDayOptions(max: number, current: number): number[] {
  const upper = Number.isFinite(current) && current > max ? Math.trunc(current) : max
  return Array.from({ length: upper }, (_, i) => i + 1)
}

export interface DayAnchor {
  /** 存进 `SpecialDay.solarYear`：只有「只此一次」才有具体年份 */
  year: number | null
  solarMonth: number
  solarDay: number
}

/**
 * 把表单里的日期换算成要落库的公历锚点。日期不合法时抛 `RangeError`，文案可直接展示。
 *
 * 这里修掉两个「静默出错」：
 * - 「每年重复」的农历日期用今年当锚点，遇上该月当年没有三十（如 2026 年七月）会抛错，
 *   而被事件处理器吞掉 → 保存什么也没发生。现在改用 `findLunarDate` 落到之后第一个真实存在的年份。
 * - 「只此一次」的阳历 2 月 29 日 + 平年，`new Date()` 会**悄悄挪到 3 月 1 日**。现在明确报错。
 */
export function resolveAnchor(form: EditForm, now: Date = new Date()): DayAnchor {
  const year = form.repeatType === 'once' ? form.solarYear || now.getFullYear() : null

  if (form.calendarType === 'lunar') {
    if (year === null) {
      const solar = findLunarDate(now.getFullYear(), form.lunarMonth, form.lunarDay)
      if (!solar) {
        throw new RangeError(`农历${form.lunarMonth}月${form.lunarDay}日在今后 3 年内都不存在`)
      }
      return { year: null, solarMonth: solar.month, solarDay: solar.day }
    }
    const solar = lunarToSolar(year, form.lunarMonth, form.lunarDay)
    return { year: solar.year, solarMonth: solar.month, solarDay: solar.day }
  }

  const maxDay = getMaxSolarDay(form.solarMonth, year)
  if (form.solarDay > maxDay) {
    throw new RangeError(
      year === null
        ? `阳历 ${form.solarMonth} 月没有 ${form.solarDay} 日`
        : `${year} 年 ${form.solarMonth} 月只有 ${maxDay} 天`,
    )
  }
  return { year, solarMonth: form.solarMonth, solarDay: form.solarDay }
}

export const useSpecialDaysStore = defineStore('special-days', () => {
  const list = useListStore<SpecialDay>({ storageKey: STORAGE_KEY, defaultValue: [] })
  const specialDays = list.items
  const showForm = ref(false)
  const editingId = ref<number | null>(null)

  const emojiOptions = [
    '🎂',
    '💕',
    '🎉',
    '🎄',
    '🧧',
    '🌸',
    '🎓',
    '💼',
    '🏠',
    '✈️',
    '⭐',
    '🎯',
    '📅',
    '🗓️',
    '💝',
    '🎊',
  ]
  const solarMonthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  const lunarMonthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  // 日期换算相关的纯函数（getMaxSolarDay / getMaxLunarDay / buildDayOptions / resolveAnchor）
  // 都在模块级：它们不依赖响应式状态，放那里才能脱离 pinia 直接测。
  // 选项数组由 App.vue 用 computed 生成 —— 原先 store 里另有一份 solarDayOptions/
  // lunarDayOptions 从未被调用，和 App.vue 形成两份会各自漂移的真相，已删。

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 50 }, (_, i) => currentYear - 10 + i)

  const defaultForm = (): EditForm => ({
    name: '',
    repeatType: 'yearly',
    calendarType: 'solar',
    solarYear: null,
    solarMonth: new Date().getMonth() + 1,
    solarDay: new Date().getDate(),
    lunarMonth: 1,
    lunarDay: 1,
    emoji: '🎉',
  })

  const form = ref<EditForm>(defaultForm())

  const init = () => {
    specialDays.value = getStorage<SpecialDay[]>(STORAGE_KEY, []) || []
  }
  const resetForm = () => {
    form.value = defaultForm()
    editingId.value = null
  }

  const openAddForm = () => {
    resetForm()
    showForm.value = true
  }
  const openEditForm = (day: SpecialDay) => {
    editingId.value = day.id
    form.value = {
      name: day.name,
      repeatType: day.repeatType || 'yearly',
      calendarType: day.calendarType,
      solarYear: day.solarYear || null,
      solarMonth: day.solarMonth,
      solarDay: day.solarDay,
      lunarMonth: day.lunarMonth,
      lunarDay: day.lunarDay,
      emoji: day.emoji,
    }
    showForm.value = true
  }
  const closeForm = () => {
    showForm.value = false
    resetForm()
  }

  const deleteSpecialDay = (id: number) => {
    list.remove(id)
  }

  return {
    specialDays,
    showForm,
    editingId,
    form,
    emojiOptions,
    solarMonthOptions,
    lunarMonthOptions,
    yearOptions,
    init,
    openAddForm,
    openEditForm,
    closeForm,
    deleteSpecialDay,
  }
})
