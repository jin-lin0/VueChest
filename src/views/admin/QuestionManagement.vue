<template>
  <div class="question-management">
    <div class="page-header">
      <div>
        <h1>📚 题目管理</h1>
        <p class="page-desc">共 {{ total }} 道题目</p>
      </div>
      <button class="btn-primary" @click="goCreate">
        <span class="btn-icon">+</span> 新建题目
      </button>
    </div>

    <div class="search-bar">
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchKeyword"
          placeholder="搜索题目..."
          class="search-input"
          @input="triggerSearch"
        />
        <button v-if="searchKeyword" class="search-clear" @click="searchKeyword = ''; triggerSearch()">&times;</button>
      </div>
      <CustomSelect
        v-model="selectedCategory"
        :options="categoryFilterOptions"
        placeholder="全部类别"
      />
      <CustomSelect
        v-model="selectedDifficulty"
        :options="difficultyFilterOptions"
        placeholder="全部难度"
      />
    </div>

    <!-- 批量操作 -->
    <div v-if="selectedIds.length > 0" class="batch-bar">
      <span class="batch-info">已选 {{ selectedIds.length }} 项</span>
      <button class="btn-danger btn-sm" @click="batchDelete">🗑️ 批量删除</button>
      <button class="btn-secondary btn-sm" @click="selectedIds = []">取消选择</button>
    </div>

    <!-- 加载态 -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="questions.length === 0" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>暂无题目</p>
      <button class="btn-primary" @click="goCreate">创建第一道题目</button>
    </div>

    <!-- 题目列表（紧凑） -->
    <div v-else class="question-list">
      <transition-group name="list">
        <div v-for="question in questions" :key="question.id" class="question-row" @click="toggleExpand(question.id)">
          <div class="row-check" @click.stop>
            <input
              type="checkbox"
              :checked="selectedIds.includes(question.id)"
              @change="toggleSelect(question.id)"
            />
          </div>
          <div class="row-body">
            <div class="row-title-row">
              <span class="row-title">{{ question.title }}</span>
              <div class="row-meta">
                <span class="diff-badge" :class="question.difficulty">{{ difficultyText(question.difficulty) }}</span>
                <span class="cat-tag">{{ getCategoryName(question.categoryId) }}</span>
                <span v-if="question.tags?.length" class="row-tags">
                  <span v-for="tag in question.tags.slice(0, 2)" :key="tag" class="row-tag">{{ tag }}</span>
                  <span v-if="question.tags.length > 2" class="row-tag-more">+{{ question.tags.length - 2 }}</span>
                </span>
              </div>
            </div>
            <div v-if="expandedIds.includes(question.id)" class="row-detail" @click.stop>
              <div v-if="question.analysis" class="detail-section">
                <strong>解析：</strong>
                <p>{{ question.analysis }}</p>
              </div>
              <div class="detail-section detail-answer">
                <strong>📝 答案：</strong>
                <div class="answer-body" v-html="renderMarkdown(question.answer)"></div>
              </div>
            </div>
          </div>
          <div class="row-actions" @click.stop>
            <button class="btn-text" @click="goEdit(question)">✏️</button>
            <button class="btn-text-danger" @click="confirmDelete(question)">🗑️</button>
          </div>
        </div>
      </transition-group>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="currentPage--">← 上一页</button>
      <div class="page-numbers">
        <button v-for="p in visiblePages" :key="p" class="page-num" :class="{ active: p === currentPage }" @click="currentPage = p">{{ p }}</button>
      </div>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="currentPage++">下一页 →</button>
      <span class="page-info">{{ totalPages }} 页 / {{ total }} 题</span>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import Toast from '@/components/Toast.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import type { SelectOption } from '@/components/CustomSelect.vue'
import type { Question, Category } from '@/types/interview'
import { api } from '@/utils/request'

const router = useRouter()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const searchKeyword = ref('')
const selectedCategory = ref<number | ''>('')
const selectedDifficulty = ref<string>('')

const questions = ref<Question[]>([])
const categories = ref<Category[]>([])
const currentPage = ref(1)
const total = ref(0)
const totalPages = ref(1)
const isLoading = ref(false)

const expandedIds = ref<number[]>([])
const selectedIds = ref<number[]>([])

const categoryFilterOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部类别' },
  ...categories.value.map((c) => ({ value: c.id, label: c.name })),
])

const difficultyFilterOptions: SelectOption[] = [
  { value: '', label: '全部难度' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

const visiblePages = computed(() => {
  const pages: number[] = []
  const start = Math.max(1, currentPage.value - 2)
  const end = Math.min(totalPages.value, currentPage.value + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

let searchTimer: ReturnType<typeof setTimeout>

function triggerSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchQuestions()
  }, 400)
}

watch([searchKeyword, selectedCategory, selectedDifficulty], () => {
  triggerSearch()
})

watch(currentPage, () => {
  fetchQuestions()
})

onMounted(async () => {
  await Promise.all([fetchCategories(), fetchQuestions()])
})

async function fetchCategories() {
  try {
    categories.value = await api.get<Category[]>('/api/questions/categories')
  } catch {
    showToast('error', '获取分类失败')
  }
}

async function fetchQuestions() {
  isLoading.value = true
  const params = new URLSearchParams()
  params.append('page', currentPage.value.toString())
  params.append('limit', '10')
  if (selectedCategory.value) params.append('categoryId', selectedCategory.value.toString())
  if (selectedDifficulty.value) params.append('difficulty', selectedDifficulty.value)
  if (searchKeyword.value) params.append('keyword', searchKeyword.value)
  try {
    const data = await api.get<{ questions: Question[]; total: number; totalPages: number }>(`/api/questions?${params}`, { auth: false })
    questions.value = data.questions
    total.value = data.total
    totalPages.value = data.totalPages
    selectedIds.value = []
  } catch {
    showToast('error', '获取题目失败')
  } finally {
    isLoading.value = false
  }
}

function toggleExpand(id: number) {
  const idx = expandedIds.value.indexOf(id)
  if (idx > -1) expandedIds.value.splice(idx, 1)
  else expandedIds.value.push(id)
}

function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function renderMarkdown(text: string) {
  return marked(text)
}

function getCategoryName(categoryId: number) {
  const cat = categories.value.find((c) => c.id === categoryId)
  return cat?.name || '未分类'
}

function difficultyText(difficulty: string) {
  const map = { easy: '简单', medium: '中等', hard: '困难' }
  return map[difficulty as keyof typeof map] || difficulty
}

function goCreate() {
  router.push('/admin/questions/create')
}

function goEdit(question: Question) {
  router.push(`/admin/questions/${question.id}/edit`)
}

function confirmDelete(question: Question) {
  if (!window.confirm(`确定删除「${question.title}」？`)) return
  deleteQuestion(question.id)
}

async function deleteQuestion(id: number) {
  try {
    await api.delete(`/api/questions/${id}`)
    showToast('success', '已删除')
    await fetchQuestions()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '删除失败')
  }
}

async function batchDelete() {
  if (!window.confirm(`确定删除 ${selectedIds.value.length} 道题目？`)) return
  try {
    await Promise.all(selectedIds.value.map((id) => api.delete(`/api/questions/${id}`)))
    showToast('success', `已删除 ${selectedIds.value.length} 道题目`)
    selectedIds.value = []
    await fetchQuestions()
  } catch {
    showToast('error', '批量删除失败')
  }
}
</script>

<style scoped>
.question-management {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: #111827;
}

.page-desc {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.btn-icon { font-size: 18px; font-weight: 300; }

/* Search */
.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-input-wrapper {
  flex: 1;
  min-width: 200px;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  font-size: 14px;
  opacity: 0.4;
}

.search-input {
  width: 100%;
  padding: 9px 34px 9px 34px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
  background: white;
}

.search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #9ca3af;
  line-height: 1;
}

/* Batch */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  margin-bottom: 12px;
}

.batch-info {
  font-size: 13px;
  font-weight: 500;
  color: #4f46e5;
  flex: 1;
}

/* Buttons */
.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 10px 22px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danger:hover { background: #fecaca; }

.btn-sm { padding: 6px 12px; font-size: 12px; }

/* Loading / Empty */
.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: #6b7280;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty-icon { font-size: 40px; }
.empty-state p { font-size: 14px; margin: 0; }

/* Compact question list */
.question-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.question-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  border: 1px solid transparent;
  transition: all 0.15s;
  cursor: pointer;
}

.question-row:hover {
  border-color: #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.row-check input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #667eea;
  display: block;
}

.row-body {
  flex: 1;
  min-width: 0;
}

.row-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-meta {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.diff-badge {
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
.diff-badge.easy { background: #d1fae5; color: #059669; }
.diff-badge.medium { background: #fef3c7; color: #d97706; }
.diff-badge.hard { background: #fee2e2; color: #dc2626; }

.cat-tag {
  padding: 1px 7px;
  border-radius: 10px;
  background: #e0e7ff;
  color: #4f46e5;
  font-size: 11px;
}

.row-tags { display: flex; gap: 3px; }
.row-tag {
  padding: 1px 6px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 10px;
}
.row-tag-more {
  font-size: 10px;
  color: #9ca3af;
}

.row-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.btn-text {
  background: none;
  border: none;
  font-size: 15px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.5;
  transition: all 0.15s;
}

.btn-text:hover { opacity: 1; background: #f3f4f6; }

.btn-text-danger {
  background: none;
  border: none;
  font-size: 15px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.5;
  transition: all 0.15s;
}

.btn-text-danger:hover { opacity: 1; background: #fee2e2; }

/* Expanded detail */
.row-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
  font-size: 13px;
  color: #4b5563;
}

.detail-section { margin-bottom: 10px; }
.detail-section strong { font-size: 12px; color: #6b7280; }
.detail-section p { margin: 4px 0 0; line-height: 1.6; }

.detail-answer {
  background: #f9fafb;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.answer-body { line-height: 1.7; font-size: 13px; }
.answer-body :deep(pre) {
  background: #1f2937; padding: 10px; border-radius: 6px;
  overflow-x: auto; margin: 6px 0;
}
.answer-body :deep(code) { font-family: Monaco, Consolas, monospace; font-size: 12px; }
.answer-body :deep(p) { margin: 6px 0; }

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  gap: 8px;
  align-items: center;
  margin-top: 20px;
  flex-wrap: wrap;
}

.page-btn {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px;
}

.page-btn:hover:not(:disabled) { border-color: #667eea; color: #667eea; }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.page-numbers { display: flex; gap: 3px; }

.page-num {
  width: 32px; height: 32px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.page-num:hover { border-color: #667eea; color: #667eea; }

.page-num.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border-color: transparent;
}

/* Transitions */
.list-enter-active, .list-leave-active { transition: all 0.2s ease; }
.list-enter-from { opacity: 0; transform: translateY(6px); }
.list-leave-to { opacity: 0; transform: translateX(-6px); }
</style>
