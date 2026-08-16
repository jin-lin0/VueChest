import { defineStore } from 'pinia'
import { useListStore } from '../../shared/useListStore'
import { getStorage } from './utils'

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
  const list = useListStore<TodoItem>({ storageKey: STORAGE_KEY, defaultValue: DEFAULT_TODOS })
  const todos = list.items

  const init = () => {
    todos.value = getStorage<TodoItem[]>(STORAGE_KEY, DEFAULT_TODOS) || DEFAULT_TODOS
  }

  const addTodo = (text: string) => {
    if (text.trim()) {
      list.add({
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
    list.remove(id)
  }

  return { todos, init, addTodo, toggleTodo, removeTodo }
})
