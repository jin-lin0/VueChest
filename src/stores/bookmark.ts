import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { debounce, getStorage, setStorage } from '@/utils'
import { STORAGE_KEYS, DEFAULT_BOOKMARKS } from '@/config'

export interface Bookmark {
  id: number
  title: string
  url: string
  category: string
  createdAt: string
}

export const useBookmarkStore = defineStore('bookmark', () => {
  const bookmarks = ref<Bookmark[]>([])
  const searchQuery = ref('')
  const selectedCategory = ref<string | null>(null)

  const loadBookmarks = (): Bookmark[] => {
    return getStorage<Bookmark[]>(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS) || DEFAULT_BOOKMARKS
  }

  const saveBookmarks = () => {
    setStorage(STORAGE_KEYS.BOOKMARKS, bookmarks.value)
  }

  const init = () => {
    bookmarks.value = loadBookmarks()
  }

  const categories = computed(() => {
    const cats = new Set(bookmarks.value.map((b) => b.category).filter(Boolean))
    return Array.from(cats).sort()
  })

  const filteredBookmarks = computed(() => {
    let result = bookmarks.value

    if (selectedCategory.value) {
      result = result.filter((b) => b.category === selectedCategory.value)
    }

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
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    bookmarks.value.push({
      id: Date.now(),
      title: title.trim(),
      url: finalUrl,
      category: category.trim() || '未分类',
      createdAt: new Date().toISOString(),
    })
  }

  const updateBookmark = (id: number, title: string, url: string, category: string) => {
    const index = bookmarks.value.findIndex((b) => b.id === id)
    if (index !== -1) {
      let finalUrl = url.trim()
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl
      }
      bookmarks.value[index] = {
        ...bookmarks.value[index],
        title: title.trim(),
        url: finalUrl,
        category: category.trim() || '未分类',
      }
    }
  }

  const deleteBookmark = (id: number) => {
    bookmarks.value = bookmarks.value.filter((b) => b.id !== id)
  }

  const debouncedSave = debounce(() => saveBookmarks(), 500)
  watch(bookmarks, debouncedSave, { deep: true })

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
