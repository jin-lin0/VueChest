<template>
  <div class="question-management">
    <div class="page-header">
      <div>
        <h1>📚 题目管理</h1>
        <p class="page-desc">共 {{ total }} 道题目</p>
      </div>
      <button class="btn-primary" @click="showCreateModal">
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
        :model-value="selectedCategory"
        :options="categoryFilterOptions"
        placeholder="全部类别"
        @update:model-value="onFilterCategoryChange"
      />
      <CustomSelect
        :model-value="selectedDifficulty"
        :options="difficultyFilterOptions"
        placeholder="全部难度"
        @update:model-value="onFilterDifficultyChange"
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
      <button class="btn-primary" @click="showCreateModal">创建第一道题目</button>
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
            <button class="btn-text" @click="showEditModal(question)">✏️</button>
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

    <!-- 创建/编辑弹窗 -->
    <transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h2>{{ editingQuestion ? '✏️ 编辑题目' : '📝 新建题目' }}</h2>
            <button class="close-btn" @click="showModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>题目标题 <span class="required">*</span></label>
              <input v-model="formData.title" class="form-input" :class="{ 'input-error': errors.title }" placeholder="输入标题" />
              <span v-if="errors.title" class="error-text">{{ errors.title }}</span>
            </div>

            <div class="form-group">
              <label>题目类型 <span class="required">*</span></label>
              <div class="type-toggle">
                <button
                  class="type-btn"
                  :class="{ active: questionType === 'text' }"
                  @click="questionType = 'text'"
                >📝 问答题</button>
                <button
                  class="type-btn"
                  :class="{ active: questionType === 'choice' }"
                  @click="questionType = 'choice'"
                >🔘 选择题</button>
              </div>
            </div>

            <div class="form-group">
              <label>答案 (Markdown) <span class="required">*</span></label>
              <textarea v-model="formData.answer" class="form-textarea" :class="{ 'input-error': errors.answer }" rows="6" placeholder="支持 Markdown 格式"></textarea>
              <span v-if="errors.answer" class="error-text">{{ errors.answer }}</span>
            </div>

            <div class="form-group">
              <label>解析</label>
              <textarea v-model="formData.analysis" class="form-textarea" rows="3" placeholder="可选"></textarea>
            </div>

            <div class="form-group" v-if="questionType === 'choice'">
              <label>选择题选项 (每行一个) <span class="required">*</span></label>
              <textarea v-model="formData.options" class="form-textarea" :class="{ 'input-error': errors.options }" rows="4" placeholder="每行一个选项"></textarea>
              <span v-if="errors.options" class="error-text">{{ errors.options }}</span>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>分类 <span class="required">*</span></label>
                <CustomSelect
                  :model-value="formData.categoryId || 0"
                  :options="categoryOptions"
                  placeholder="请选择分类"
                  @update:model-value="onCategoryChange"
                />
                <span v-if="errors.categoryId" class="error-text">{{ errors.categoryId }}</span>
              </div>
              <div class="form-group">
                <label>难度 <span class="required">*</span></label>
                <CustomSelect
                  :model-value="formData.difficulty"
                  :options="formDifficultyOptions"
                  placeholder="请选择难度"
                  @update:model-value="onDifficultyChange"
                />
              </div>
            </div>

            <div class="form-group">
              <label>标签 (逗号分隔)</label>
              <input v-model="tagsInput" class="form-input" placeholder="如：JavaScript, Vue, 面试" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showModal = false">取消</button>
            <button class="btn-primary" :disabled="saving" @click="saveQuestion">
              <span v-if="saving" class="loading-spinner-sm"></span>
              {{ editingQuestion ? '保存' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { marked } from 'marked'
import Toast from '@/components/Toast.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import type { SelectOption } from '@/components/CustomSelect.vue'
import type { Question, Category, Difficulty } from '@/types/interview'
import { api } from '@/utils/request'

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
const saving = ref(false)

const expandedIds = ref<number[]>([])
const selectedIds = ref<number[]>([])

const showModal = ref(false)
const editingQuestion = ref<Question | null>(null)
const questionType = ref<'text' | 'choice'>('text')
const formData = ref({
  title: '',
  answer: '',
  analysis: '',
  options: '',
  difficulty: 'medium' as Difficulty,
  categoryId: null as number | null,
  tags: [] as string[],
})
const tagsInput = ref('')
const errors = ref<Record<string, string>>({})

const categoryOptions = computed<SelectOption[]>(() =>
  categories.value.map((c) => ({ value: c.id, label: c.name }))
)

const categoryFilterOptions = computed<SelectOption[]>(() => [
  { value: '', label: '全部类别' },
  ...categoryOptions.value,
])

const difficultyFilterOptions: SelectOption[] = [
  { value: '', label: '全部难度' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

const formDifficultyOptions: SelectOption[] = [
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

function onCategoryChange(val: string | number) {
  formData.value.categoryId = val === 0 ? null : (val as number)
}

function onDifficultyChange(val: string | number) {
  formData.value.difficulty = val as Difficulty
}

function onFilterCategoryChange(val: string | number) {
  selectedCategory.value = val === '' ? '' : (val as number)
}

function onFilterDifficultyChange(val: string | number) {
  selectedDifficulty.value = val as string
}

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

function validate(): boolean {
  const errs: Record<string, string> = {}
  if (!formData.value.title.trim()) errs.title = '请输入标题'
  if (!formData.value.answer.trim()) errs.answer = '请输入答案'
  if (formData.value.categoryId === null) errs.categoryId = '请选择分类'
  if (questionType.value === 'choice' && !formData.value.options.trim()) {
    errs.options = '请填写选择题选项'
  }
  errors.value = errs
  return Object.keys(errs).length === 0
}

function showCreateModal() {
  editingQuestion.value = null
  questionType.value = 'text'
  formData.value = { title: '', answer: '', analysis: '', options: '', difficulty: 'medium', categoryId: null, tags: [] }
  tagsInput.value = ''
  errors.value = {}
  showModal.value = true
}

function showEditModal(question: Question) {
  editingQuestion.value = question
  questionType.value = question.options?.length ? 'choice' : 'text'
  formData.value = {
    title: question.title,
    answer: question.answer,
    analysis: question.analysis || '',
    options: (question.options || []).join('\n'),
    difficulty: question.difficulty,
    categoryId: question.categoryId,
    tags: question.tags || [],
  }
  tagsInput.value = (question.tags || []).join(', ')
  errors.value = {}
  showModal.value = true
}

async function saveQuestion() {
  if (!validate()) return
  saving.value = true
  const data: Record<string, unknown> = {
    title: formData.value.title,
    answer: formData.value.answer,
    analysis: formData.value.analysis,
    difficulty: formData.value.difficulty,
    categoryId: formData.value.categoryId,
  }
  // 解析选项（每行一个）
  if (questionType.value === 'choice') {
    data.options = formData.value.options.split('\n').map((o) => o.trim()).filter(Boolean)
  } else {
    data.options = null
  }
  // 解析标签
  if (tagsInput.value) {
    data.tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean)
  } else {
    data.tags = []
  }
  try {
    if (editingQuestion.value) {
      await api.put(`/api/questions/${editingQuestion.value.id}`, data)
    } else {
      await api.post('/api/questions', data)
    }
    showToast('success', editingQuestion.value ? '已更新' : '已创建')
    await fetchQuestions()
    showModal.value = false
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
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

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover { background: #f3f4f6; border-color: #9ca3af; }

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

.page-info { color: #9ca3af; font-size: 12px; margin-left: 4px; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 24px;
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 640px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 { margin: 0; font-size: 18px; }

.close-btn {
  background: none; border: none; font-size: 24px;
  cursor: pointer; color: #9ca3af;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px; transition: all 0.15s;
}

.close-btn:hover { background: #f3f4f6; color: #374151; }

.modal-body { padding: 20px 24px; }
.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.form-group { margin-bottom: 16px; }

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #374151;
  font-size: 13px;
}

.required { color: #dc2626; }

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: all 0.15s;
  background: white;
  box-sizing: border-box;
}

.form-input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }

.input-error { border-color: #dc2626; }
.input-error:focus { box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1); }

.error-text { display: block; color: #dc2626; font-size: 11px; margin-top: 3px; }

.form-textarea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: all 0.15s;
  background: white;
  box-sizing: border-box;
}

.form-textarea:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

/* Type toggle */
.type-toggle {
  display: flex;
  gap: 8px;
}

.type-btn {
  flex: 1;
  padding: 10px 16px;
  border: 2px solid #d1d5db;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  color: #6b7280;
}

.type-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.type-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.loading-spinner-sm {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Transitions */
.list-enter-active, .list-leave-active { transition: all 0.2s ease; }
.list-enter-from { opacity: 0; transform: translateY(6px); }
.list-leave-to { opacity: 0; transform: translateX(-6px); }

.modal-enter-active { transition: all 0.2s ease; }
.modal-leave-active { transition: all 0.15s ease; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal { transform: scale(0.95) translateY(8px); }
.modal-leave-to { opacity: 0; }
.modal-leave-to .modal { transform: scale(0.95); }
</style>
