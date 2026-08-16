import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useListStore } from '../../shared/useListStore'
import { getStorage } from './utils'

const STORAGE_KEY = 'bookmarks'

const DEFAULT_BOOKMARKS = [
  {
    id: 1,
    title: 'Vue.js 官方文档',
    url: 'https://vuejs.org',
    category: '开发',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'TypeScript 文档',
    url: 'https://www.typescriptlang.org',
    category: '开发',
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    title: 'GitHub',
    url: 'https://github.com',
    category: '工具',
    createdAt: new Date().toISOString(),
  },
]

export interface Bookmark {
  id: number
  title: string
  url: string
  category: string
  createdAt: string
}

export const useBookmarkStore = defineStore('bookmark', () => {
  const list = useListStore<Bookmark>({ storageKey: STORAGE_KEY, defaultValue: DEFAULT_BOOKMARKS })
  const bookmarks = list.items
  const searchQuery = ref('')
  const selectedCategory = ref<string | null>(null)

  const init = () => {
    bookmarks.value = getStorage<Bookmark[]>(STORAGE_KEY, DEFAULT_BOOKMARKS) || DEFAULT_BOOKMARKS
  }

  const categories = computed(() => {
    const cats = new Set(bookmarks.value.map((b) => b.category).filter(Boolean))
    return Array.from(cats).sort()
  })

  const filteredBookmarks = computed(() => {
    let result = bookmarks.value
    if (selectedCategory.value) result = result.filter((b) => b.category === selectedCategory.value)
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q),
      )
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })

  const addBookmark = (title: string, url: string, category: string) => {
    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
    list.add({
      id: Date.now(),
      title: title.trim(),
      url: finalUrl,
      category: category.trim() || '未分类',
      createdAt: new Date().toISOString(),
    })
  }

  const updateBookmark = (id: number, title: string, url: string, category: string) => {
    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
    list.update(id, {
      title: title.trim(),
      url: finalUrl,
      category: category.trim() || '未分类',
    })
  }

  const deleteBookmark = (id: number) => {
    list.remove(id)
  }

  return {
    bookmarks,
    searchQuery,
    selectedCategory,
    categories,
    filteredBookmarks,
    init,
    addBookmark,
    updateBookmark,
    deleteBookmark,
  }
})
