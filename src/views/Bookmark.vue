<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { debounce } from '@/utils'

defineOptions({ name: 'BookmarkView' })

interface Bookmark {
  id: number
  title: string
  url: string
  category: string
  createdAt: string
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const bookmarks = ref<Bookmark[]>([])
const newTitle = ref('')
const newUrl = ref('')
const newCategory = ref('')
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)
const editingId = ref<number | null>(null)

const loadBookmarks = (): Bookmark[] => {
  const saved = localStorage.getItem('bookmarks')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      console.error('解析书签数据失败:', e)
      return []
    }
  }
  return [
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
}

const saveBookmarks = () => {
  localStorage.setItem('bookmarks', JSON.stringify(bookmarks.value))
}

onMounted(() => {
  bookmarks.value = loadBookmarks()
})

const debouncedSaveBookmarks = debounce(() => saveBookmarks(), 500)
watch(bookmarks, debouncedSaveBookmarks, { deep: true })

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

const addBookmark = () => {
  const title = newTitle.value.trim()
  let url = newUrl.value.trim()
  const category = newCategory.value.trim() || '未分类'

  if (!title || !url) return

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }

  if (editingId.value !== null) {
    const index = bookmarks.value.findIndex((b) => b.id === editingId.value)
    if (index !== -1) {
      bookmarks.value[index] = { ...bookmarks.value[index], title, url, category }
    }
    editingId.value = null
  } else {
    bookmarks.value.push({
      id: Date.now(),
      title,
      url,
      category,
      createdAt: new Date().toISOString(),
    })
  }

  newTitle.value = ''
  newUrl.value = ''
  newCategory.value = ''
}

const editBookmark = (bookmark: Bookmark) => {
  editingId.value = bookmark.id
  newTitle.value = bookmark.title
  newUrl.value = bookmark.url
  newCategory.value = bookmark.category === '未分类' ? '' : bookmark.category
}

const cancelEdit = () => {
  editingId.value = null
  newTitle.value = ''
  newUrl.value = ''
  newCategory.value = ''
}

const deleteBookmark = (id: number) => {
  bookmarks.value = bookmarks.value.filter((b) => b.id !== id)
  if (editingId.value === id) cancelEdit()
}

const selectCategory = (cat: string) => {
  selectedCategory.value = selectedCategory.value === cat ? null : cat
}

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const getFaviconUrl = (url: string) => {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>书签管理</h1>
    </header>

    <main class="bookmark-content">
      <div class="add-section">
        <div class="form-row">
          <input v-model="newTitle" type="text" placeholder="标题" @keyup.enter="addBookmark" />
          <input v-model="newUrl" type="text" placeholder="网址" @keyup.enter="addBookmark" />
          <input
            v-model="newCategory"
            type="text"
            placeholder="分类（可选）"
            @keyup.enter="addBookmark"
          />
          <button class="add-btn" @click="addBookmark">
            {{ editingId !== null ? '更新' : '添加' }}
          </button>
          <button v-if="editingId !== null" class="cancel-btn" @click="cancelEdit">取消</button>
        </div>
      </div>

      <div class="toolbar">
        <input v-model="searchQuery" type="text" placeholder="搜索书签..." class="search-input" />
        <div class="category-tags">
          <button
            v-for="cat in categories"
            :key="cat"
            class="tag-btn"
            :class="{ active: selectedCategory === cat }"
            @click="selectCategory(cat)"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <div class="bookmark-list">
        <div v-for="bookmark in filteredBookmarks" :key="bookmark.id" class="bookmark-item">
          <a :href="bookmark.url" target="_blank" rel="noopener noreferrer" class="bookmark-link">
            <img
              :src="getFaviconUrl(bookmark.url)"
              :alt="bookmark.title"
              class="favicon"
              width="20"
              height="20"
            />
            <div class="bookmark-info">
              <div class="bookmark-title">{{ bookmark.title }}</div>
              <div class="bookmark-meta">
                <span class="bookmark-domain">{{ getDomain(bookmark.url) }}</span>
                <span class="bookmark-category">{{ bookmark.category }}</span>
                <span class="bookmark-date">{{ formatDate(bookmark.createdAt) }}</span>
              </div>
            </div>
          </a>
          <div class="bookmark-actions">
            <button class="action-btn edit" @click="editBookmark(bookmark)">编辑</button>
            <button class="action-btn delete" @click="deleteBookmark(bookmark.id)">删除</button>
          </div>
        </div>

        <div v-if="filteredBookmarks.length === 0" class="empty-state">
          {{ bookmarks.length === 0 ? '还没有书签，添加一个吧！' : '没有匹配的书签' }}
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.back-button {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #2c3e50;
}

.add-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.form-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.form-row input {
  flex: 1;
  min-width: 140px;
  padding: 0.7rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
}

.add-btn {
  background-color: #2ecc71;
  color: white;
  border: none;
  padding: 0 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  white-space: nowrap;
}

.add-btn:hover {
  background-color: #27ae60;
}

.cancel-btn {
  background-color: #95a5a6;
  color: white;
  border: none;
  padding: 0 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  white-space: nowrap;
}

.cancel-btn:hover {
  background-color: #7f8c8d;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
  box-sizing: border-box;
}

.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-btn {
  background-color: #f1f1f1;
  border: none;
  padding: 0.3rem 0.7rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #2c3e50;
  transition: all 0.2s;
}

.tag-btn:hover {
  background-color: #e0e0e0;
}

.tag-btn.active {
  background-color: #3498db;
  color: white;
}

.bookmark-list {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.bookmark-item {
  display: flex;
  align-items: center;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #eee;
  transition: background-color 0.2s;
}

.bookmark-item:last-child {
  border-bottom: none;
}

.bookmark-item:hover {
  background-color: #f9f9f9;
}

.bookmark-link {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}

.favicon {
  flex-shrink: 0;
  border-radius: 4px;
}

.bookmark-info {
  min-width: 0;
}

.bookmark-title {
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.2rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bookmark-meta {
  display: flex;
  gap: 0.8rem;
  font-size: 0.78rem;
  color: #95a5a6;
}

.bookmark-category {
  color: #3498db;
}

.bookmark-actions {
  display: flex;
  gap: 0.4rem;
  margin-left: 0.8rem;
  flex-shrink: 0;
}

.action-btn {
  border: none;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  color: white;
}

.action-btn.edit {
  background-color: #3498db;
}

.action-btn.edit:hover {
  background-color: #2980b9;
}

.action-btn.delete {
  background-color: #e74c3c;
}

.action-btn.delete:hover {
  background-color: #c0392b;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
}
</style>
