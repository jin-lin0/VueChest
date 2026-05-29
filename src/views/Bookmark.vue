<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBookmarkStore } from '@/stores'

defineOptions({ name: 'BookmarkView' })

const router = useRouter()
const bookmarkStore = useBookmarkStore()

const goBack = () => {
  router.push('/')
}

const newTitle = ref('')
const newUrl = ref('')
const newCategory = ref('')
const editingId = ref<number | null>(null)

onMounted(() => {
  bookmarkStore.init()
})

const addBookmark = () => {
  const title = newTitle.value.trim()
  const url = newUrl.value.trim()
  const category = newCategory.value.trim()

  if (!title || !url) return

  if (editingId.value !== null) {
    bookmarkStore.updateBookmark(editingId.value, title, url, category)
    editingId.value = null
  } else {
    bookmarkStore.addBookmark(title, url, category)
  }

  newTitle.value = ''
  newUrl.value = ''
  newCategory.value = ''
}

const editBookmark = (bookmark: { id: number; title: string; url: string; category: string }) => {
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
  bookmarkStore.deleteBookmark(id)
  if (editingId.value === id) cancelEdit()
}

const selectCategory = (cat: string) => {
  bookmarkStore.selectedCategory = bookmarkStore.selectedCategory === cat ? null : cat
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
        <input
          v-model="bookmarkStore.searchQuery"
          type="text"
          placeholder="搜索书签..."
          class="search-input"
        />
        <div class="category-tags">
          <button
            v-for="cat in bookmarkStore.categories"
            :key="cat"
            class="tag-btn"
            :class="{ active: bookmarkStore.selectedCategory === cat }"
            @click="selectCategory(cat)"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <div class="bookmark-list">
        <div
          v-for="bookmark in bookmarkStore.filteredBookmarks"
          :key="bookmark.id"
          class="bookmark-item"
        >
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

        <div v-if="bookmarkStore.filteredBookmarks.length === 0" class="empty-state">
          {{ bookmarkStore.bookmarks.length === 0 ? '还没有书签，添加一个吧！' : '没有匹配的书签' }}
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

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
  }

  .app-header h1 {
    font-size: 1.4rem;
  }

  .back-button {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
  }

  .add-section {
    padding: 1rem;
  }

  .form-row input {
    min-width: 100%;
  }

  .form-row {
    flex-direction: column;
    gap: 0.6rem;
  }

  .add-btn,
  .cancel-btn {
    width: 100%;
    padding: 0.7rem;
  }

  .bookmark-item {
    padding: 0.6rem 0.8rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .bookmark-link {
    flex: 1 0 0%;
    min-width: 0;
    gap: 0.5rem;
  }

  .bookmark-info {
    min-width: 0;
    overflow: hidden;
  }

  .bookmark-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bookmark-meta {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .bookmark-actions {
    margin-left: 0;
    justify-content: flex-end;
    opacity: 1;
    flex-shrink: 0;
  }
}
</style>
