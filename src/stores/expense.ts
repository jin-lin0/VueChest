import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { debounce, getStorage, setStorage } from '@/utils'
import { STORAGE_KEYS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/config'

export interface ExpenseItem {
  id: number
  type: 'income' | 'expense'
  amount: number
  category: string
  note: string
  date: string
}

export const useExpenseStore = defineStore('expense', () => {
  const records = ref<ExpenseItem[]>([])
  const showForm = ref(false)
  const formType = ref<'income' | 'expense'>('expense')
  const formAmount = ref('')
  const formCategory = ref('')
  const formNote = ref('')
  const formDate = ref(new Date().toISOString().slice(0, 10))
  const editingId = ref<number | null>(null)

  const loadRecords = (): ExpenseItem[] => {
    return getStorage<ExpenseItem[]>(STORAGE_KEYS.EXPENSES, []) || []
  }

  const saveRecords = () => {
    setStorage(STORAGE_KEYS.EXPENSES, records.value)
  }

  const init = () => {
    records.value = loadRecords()
  }

  const currentCategories = computed(() => {
    return formType.value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  })

  const sortedRecords = computed(() => {
    return [...records.value].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id,
    )
  })

  const groupedRecords = computed(() => {
    const groups: Record<string, ExpenseItem[]> = {}
    for (const record of sortedRecords.value) {
      const dateKey = record.date
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(record)
    }
    return groups
  })

  const totalIncome = computed(() => {
    return records.value.filter((r) => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)
  })

  const totalExpense = computed(() => {
    return records.value.filter((r) => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0)
  })

  const balance = computed(() => totalIncome.value - totalExpense.value)

  const monthlyIncome = computed(() => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return records.value
      .filter((r) => r.type === 'income' && r.date.startsWith(monthStr))
      .reduce((sum, r) => sum + r.amount, 0)
  })

  const monthlyExpense = computed(() => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return records.value
      .filter((r) => r.type === 'expense' && r.date.startsWith(monthStr))
      .reduce((sum, r) => sum + r.amount, 0)
  })

  const switchType = (type: 'income' | 'expense') => {
    formType.value = type
    formCategory.value = ''
  }

  const openForm = (record?: ExpenseItem) => {
    if (record) {
      editingId.value = record.id
      formType.value = record.type
      formAmount.value = String(record.amount)
      formCategory.value = record.category
      formNote.value = record.note
      formDate.value = record.date
    } else {
      editingId.value = null
      formType.value = 'expense'
      formAmount.value = ''
      formCategory.value = ''
      formNote.value = ''
      formDate.value = new Date().toISOString().slice(0, 10)
    }
    showForm.value = true
  }

  const closeForm = () => {
    showForm.value = false
  }

  const submitForm = () => {
    const amount = parseFloat(formAmount.value)
    if (!amount || amount <= 0) return
    if (!formCategory.value) return

    if (editingId.value !== null) {
      const index = records.value.findIndex((r) => r.id === editingId.value)
      if (index !== -1) {
        records.value[index] = {
          ...records.value[index],
          type: formType.value,
          amount,
          category: formCategory.value,
          note: formNote.value.trim(),
          date: formDate.value,
        }
      }
    } else {
      records.value.push({
        id: Date.now(),
        type: formType.value,
        amount,
        category: formCategory.value,
        note: formNote.value.trim(),
        date: formDate.value,
      })
    }

    showForm.value = false
  }

  const deleteRecord = (id: number) => {
    records.value = records.value.filter((r) => r.id !== id)
  }

  const debouncedSave = debounce(() => saveRecords(), 500)
  watch(records, debouncedSave, { deep: true })

  return {
    records,
    showForm,
    formType,
    formAmount,
    formCategory,
    formNote,
    formDate,
    editingId,
    currentCategories,
    sortedRecords,
    groupedRecords,
    totalIncome,
    totalExpense,
    balance,
    monthlyIncome,
    monthlyExpense,
    init,
    switchType,
    openForm,
    closeForm,
    submitForm,
    deleteRecord,
  }
})
