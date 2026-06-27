import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { debounce, getStorage, setStorage } from './utils'

const STORAGE_KEY = 'todos'

const DEFAULT_TODOS = [
  { id: 1, text: '完成Vue项目', completed: false, createdAt: new Date().toISOString() },
  { id: 2, text: '学习TypeScript', completed: true, createdAt: new Date().toISOString() },
  { id: 3, text: '购买生活用品', completed: false, createdAt: new Date().toISOString() },
]

export interface TodoItem {
  id: number
  text: string
  completed: boolean
  createdAt: string
}

export const useTodoStore = defineStore('todo', () => {
  const todos = ref<TodoItem[]>([])

  const loadTodos = (): TodoItem[] => {
    return getStorage<TodoItem[]>(STORAGE_KEY, DEFAULT_TODOS) || DEFAULT_TODOS
  }

  const saveTodos = () => {
    setStorage(STORAGE_KEY, todos.value)
  }

  const init = () => {
    todos.value = loadTodos()
  }

  const addTodo = (text: string) => {
    if (text.trim()) {
      todos.value.push({
        id: Date.now(),
        text: text.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
      })
    }
  }

  const toggleTodo = (id: number) => {
    const todo = todos.value.find((item) => item.id === id)
    if (todo) {
      todo.completed = !todo.completed
    }
  }

  const removeTodo = (id: number) => {
    todos.value = todos.value.filter((item) => item.id !== id)
  }

  const debouncedSave = debounce(() => saveTodos(), 500)
  watch(todos, debouncedSave, { deep: true })

  return { todos, init, addTodo, toggleTodo, removeTodo }
})
