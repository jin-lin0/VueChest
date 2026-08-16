import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useListStore } from '../../shared/useListStore'
import { getStorage } from './utils'

const STORAGE_KEY = 'expenses'

const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '其他']
const INCOME_CATEGORIES = ['工资', '奖金', '兼职', '理财', '红包', '其他']

export interface ExpenseItem {
  id: number
  type: 'income' | 'expense'
  amount: number
  category: string
  note: string
  date: string
}

export const useExpenseStore = defineStore('expense', () => {
  const list = useListStore<ExpenseItem>({ storageKey: STORAGE_KEY, defaultValue: [] })
  const records = list.items
  const showForm = ref(false)
  const formType = ref<'income' | 'expense'>('expense')
  const formAmount = ref('')
  const formCategory = ref('')
  const formNote = ref('')
  const formDate = ref(new Date().toISOString().slice(0, 10))
  const editingId = ref<number | null>(null)

  const init = () => {
    records.value = getStorage<ExpenseItem[]>(STORAGE_KEY, []) || []
  }

  const currentCategories = computed(() =>
    formType.value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES,
  )

  const sortedRecords = computed(() =>
    [...records.value].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id,
    ),
  )

  const groupedRecords = computed(() => {
    const groups: Record<string, ExpenseItem[]> = {}
    for (const record of sortedRecords.value) {
      const dateKey = record.date
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(record)
    }
    return groups
  })

  const totalIncome = computed(() =>
    records.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
  )
  const totalExpense = computed(() =>
    records.value.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
  )
  const balance = computed(() => totalIncome.value - totalExpense.value)

  const monthlyIncome = computed(() => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return records.value
      .filter((r) => r.type === 'income' && r.date.startsWith(monthStr))
      .reduce((s, r) => s + r.amount, 0)
  })
  const monthlyExpense = computed(() => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return records.value
      .filter((r) => r.type === 'expense' && r.date.startsWith(monthStr))
      .reduce((s, r) => s + r.amount, 0)
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
      list.update(editingId.value, {
        type: formType.value,
        amount,
        category: formCategory.value,
        note: formNote.value.trim(),
        date: formDate.value,
      })
    } else {
      list.add({
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
    list.remove(id)
  }

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
