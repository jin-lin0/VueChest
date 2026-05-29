import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { debounce, getStorage, setStorage } from '@/utils'
import { STORAGE_KEYS } from '@/config'

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
  const specialDays = ref<SpecialDay[]>([])
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

  const getMaxLunarDay = (): number => {
    return 30
  }

  const solarDayOptions = (month: number) => {
    const max = getMaxSolarDay(month)
    return Array.from({ length: max }, (_, i) => i + 1)
  }

  const lunarDayOptions = () => {
    const max = getMaxLunarDay()
    return Array.from({ length: max }, (_, i) => i + 1)
  }

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

  const loadSpecialDays = (): SpecialDay[] => {
    return getStorage<SpecialDay[]>(STORAGE_KEYS.SPECIAL_DAYS, []) || []
  }

  const saveSpecialDays = () => {
    setStorage(STORAGE_KEYS.SPECIAL_DAYS, specialDays.value)
  }

  const init = () => {
    specialDays.value = loadSpecialDays()
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

  const submitForm = () => {
    if (!form.value.name.trim()) return

    if (editingId.value !== null) {
      const index = specialDays.value.findIndex((d) => d.id === editingId.value)
      if (index !== -1) {
        specialDays.value[index] = {
          ...specialDays.value[index],
          ...form.value,
        }
      }
    } else {
      specialDays.value.push({
        id: Date.now(),
        ...form.value,
        createdAt: new Date().toISOString(),
      })
    }

    showForm.value = false
    resetForm()
  }

  const deleteSpecialDay = (id: number) => {
    specialDays.value = specialDays.value.filter((d) => d.id !== id)
  }

  const debouncedSave = debounce(() => saveSpecialDays(), 500)
  watch(specialDays, debouncedSave, { deep: true })

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
    openAddForm,
    openEditForm,
    closeForm,
    submitForm,
    deleteSpecialDay,
  }
})
