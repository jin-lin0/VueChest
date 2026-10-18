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


/** 阳历每月天数；二月按 28 天，闰年另算。 */
const SOLAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** 指定年份时取实际月长；每年重复时二月允许选择 29 日。 */
export function getMaxSolarDay(month: number, year: number | null = null): number {
  const base = SOLAR_MONTH_DAYS[month - 1] || 31
  if (month !== 2) return base
  if (year === null) return 29
  return isLeapYear(year) ? 29 : 28
}

/** 指定年份时取实际农历月长；每年重复时允许选择 30 日。 */
export function getMaxLunarDay(month: number, year: number | null = null): number {
  if (year === null) return 30
  try {
    return getLunarMonthDays(year, month)
  } catch {
    // 年份越界或月份非法：退化为最大值，选项列表不能因此崩掉
    return 30
  }
}

/** 保留超出当前月长的已存日数，避免静默改写；保存时再校验。 */
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
 * 将表单日期换算为公历锚点，非法日期抛出可展示的 RangeError。
 * 重复农历日期寻找下一个存在的年份；一次性公历日期禁止自动溢出到下月。
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
