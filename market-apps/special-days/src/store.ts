import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useListStore } from '../../shared/useListStore'
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

  const getMaxSolarDay = (month: number): number => {
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return daysInMonth[month - 1] || 31
  }
  const getMaxLunarDay = (): number => 30

  const solarDayOptions = (month: number) =>
    Array.from({ length: getMaxSolarDay(month) }, (_, i) => i + 1)
  const lunarDayOptions = () => Array.from({ length: getMaxLunarDay() }, (_, i) => i + 1)

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
    solarDayOptions,
    lunarDayOptions,
    getMaxSolarDay,
    getMaxLunarDay,
    openAddForm,
    openEditForm,
    closeForm,
    deleteSpecialDay,
  }
})
