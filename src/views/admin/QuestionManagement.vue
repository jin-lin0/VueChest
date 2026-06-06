<template>
  <div class="question-management">
    <div class="page-header">
      <h1>📚 题目管理</h1>
      <button class="btn-primary" @click="showCreateModal">
        + 新建题目
      </button>
    </div>

    <div class="search-bar">
      <input
        v-model="searchKeyword"
        placeholder="搜索题目标题、内容或答案..."
        class="search-input"
      />
      <select v-model="selectedCategory" class="select-input">
        <option value="">全部类别</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">
          {{ cat.name }}
        </option>
      </select>
      <select v-model="selectedDifficulty" class="select-input">
        <option value="">全部难度</option>
        <option value="easy">简单</option>
        <option value="medium">中等</option>
        <option value="hard">困难</option>
      </select>
    </div>

    <div class="question-list">
      <div
        v-for="question in questions"
        :key="question.id"
        class="question-card"
      >
        <div class="question-header">
          <div>
            <h3 class="question-title">{{ question.title }}</h3>
            <div class="question-meta">
              <span
                class="difficulty-badge"
                :class="question.difficulty"
              >
                {{ difficultyText(question.difficulty) }}
              </span>
              <span class="category-tag">
                {{ getCategoryName(question.categoryId) }}
              </span>
              <span v-if="question.tags && question.tags.length" class="tags">
                <span
                  v-for="tag in question.tags"
                  :key="tag"
                  class="tag"
                >
                  {{ tag }}
                </span>
              </span>
              <span class="created-at">
                {{ formatDate(question.createdAt) }}
              </span>
            </div>
          </div>
          <div class="question-actions">
            <button
              class="btn-secondary"
              @click="showEditModal(question)"
            >
              ✏️ 编辑
            </button>
            <button
              class="btn-danger"
              @click="deleteQuestion(question.id)"
            >
              🗑️ 删除
            </button>
          </div>
        </div>
        <div
          v-if="question.content"
          class="question-preview"
          :class="{ expanded: expandedQuestions.includes(question.id) }"
        >
          <div class="preview-content">
            <div class="content-item">
              <strong>题目：</strong>
              <p>{{ question.content }}</p>
            </div>
            <div v-if="question.analysis" class="content-item">
              <strong>解析：</strong>
              <p>{{ question.analysis }}</p>
            </div>
          </div>
          <button
            class="toggle-preview"
            @click="toggleExpand(question.id)"
          >
            {{ expandedQuestions.includes(question.id) ? '收起' : '展开查看答案' }}
          </button>
          <div v-if="expandedQuestions.includes(question.id)" class="answer">
            <strong>答案：</strong>
            <div v-html="renderMarkdown(question.answer)"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button
        class="page-btn"
        :disabled="currentPage <= 1"
        @click="currentPage--"
      >
        上一页
      </button>
      <span class="page-info">
        {{ currentPage }} / {{ totalPages }} (共 {{ total }} 题)
      </span>
      <button
        class="page-btn"
        :disabled="currentPage >= totalPages"
        @click="currentPage++"
      >
        下一页
      </button>
    </div>

    <!-- 创建/编辑题目弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingQuestion ? '编辑题目' : '创建题目' }}</h2>
          <button class="close-btn" @click="showModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>题目标题 *</label>
            <input
              v-model="formData.title"
              class="form-input"
              placeholder="输入题目标题"
            />
          </div>

          <div class="form-group">
            <label>题目内容 *</label>
            <textarea
              v-model="formData.content"
              class="form-textarea"
              rows="4"
              placeholder="输入题目内容"
            ></textarea>
          </div>

          <div class="form-group">
            <label>答案 * (支持 Markdown)</label>
            <textarea
              v-model="formData.answer"
              class="form-textarea"
              rows="8"
              placeholder="输入题目答案，支持 Markdown 格式"
            ></textarea>
          </div>

          <div class="form-group">
            <label>解析</label>
            <textarea
              v-model="formData.analysis"
              class="form-textarea"
              rows="3"
              placeholder="输入题目解析"
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>分类 *</label>
              <select v-model="formData.categoryId" class="form-input">
                <option :value="null">请选择分类</option>
                <option
                  v-for="cat in categories"
                  :key="cat.id"
                  :value="cat.id"
                >
                  {{ cat.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>难度 *</label>
              <select v-model="formData.difficulty" class="form-input">
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>标签 (逗号分隔)</label>
            <input
              v-model="tagsInput"
              class="form-input"
              placeholder="如：JavaScript, Vue, 面试"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="showModal = false">
            取消
          </button>
          <button class="btn-primary" @click="saveQuestion">
            {{ editingQuestion ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// 搜索和筛选
const searchKeyword = ref('')
const selectedCategory = ref<number | ''>('')
const selectedDifficulty = ref<string>('')

// 数据
const questions = ref<any[]>([])
const categories = ref<any[]>([])
const currentPage = ref(1)
const total = ref(0)
const totalPages = ref(1)

// 展开控制
const expandedQuestions = ref<number[]>([])

// 模态框
const showModal = ref(false)
const editingQuestion = ref<any>(null)
const formData = ref<any>({
  title: '',
  content: '',
  answer: '',
  analysis: '',
  difficulty: 'medium',
  categoryId: null,
})
const tagsInput = ref('')

// 初始化
onMounted(async () => {
  await fetchCategories()
  await fetchQuestions()
})

// 监听搜索筛选变化
watch([searchKeyword, selectedCategory, selectedDifficulty, currentPage], () => {
  fetchQuestions()
})

// 获取分类
async function fetchCategories() {
  const response = await fetch(`${API_BASE}/api/questions/categories`)
  categories.value = await response.json()
}

// 获取题目
async function fetchQuestions() {
  const params = new URLSearchParams()
  params.append('page', currentPage.value.toString())
  params.append('limit', '10')

  if (selectedCategory.value)
    params.append('categoryId', selectedCategory.value.toString())
  if (selectedDifficulty.value)
    params.append('difficulty', selectedDifficulty.value)
  if (searchKeyword.value)
    params.append('keyword', searchKeyword.value)

  const response = await fetch(`${API_BASE}/api/questions?${params.toString()}`)
  const data = await response.json()

  questions.value = data.questions
  total.value = data.total
  totalPages.value = data.totalPages
}

// 展开/收起
function toggleExpand(id: number) {
  const index = expandedQuestions.value.indexOf(id)
  if (index > -1) {
    expandedQuestions.value.splice(index, 1)
  } else {
    expandedQuestions.value.push(id)
  }
}

// Markdown 渲染
function renderMarkdown(text: string) {
  marked.setOptions({
    highlight: (code) => hljs.highlightAuto(code).value,
  })
  return marked(text)
}

// 获取分类名称
function getCategoryName(categoryId: number) {
  const cat = categories.value.find((c) => c.id === categoryId)
  return cat?.name || '未分类'
}

// 难度文字
function difficultyText(difficulty: string) {
  const map = { easy: '简单', medium: '中等', hard: '困难' }
  return map[difficulty as keyof typeof map] || difficulty
}

// 格式化日期
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// 显示创建弹窗
function showCreateModal() {
  editingQuestion.value = null
  formData.value = {
    title: '',
    content: '',
    answer: '',
    analysis: '',
    difficulty: 'medium',
    categoryId: null,
  }
  tagsInput.value = ''
  showModal.value = true
}

// 显示编辑弹窗
function showEditModal(question: any) {
  editingQuestion.value = question
  formData.value = { ...question }
  tagsInput.value = (question.tags || []).join(', ')
  showModal.value = true
}

// 保存题目
async function saveQuestion() {
  const data = { ...formData.value }
  if (tagsInput.value) {
    data.tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean)
  } else {
    data.tags = []
  }

  try {
    const url = editingQuestion.value
      ? `${API_BASE}/api/questions/${editingQuestion.value.id}`
      : `${API_BASE}/api/questions`
    const method = editingQuestion.value ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const err = await response.json()
      alert(err.error || '操作失败')
      return
    }

    await fetchQuestions()
    showModal.value = false
  } catch (err) {
    console.error(err)
    alert('保存失败')
  }
}

// 删除题目
async function deleteQuestion(id: number) {
  if (!confirm('确定要删除这道题目吗？')) {
    return
  }

  try {
    const response = await fetch(`${API_BASE}/api/questions/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const err = await response.json()
      alert(err.error || '删除失败')
      return
    }

    await fetchQuestions()
  } catch (err) {
    console.error(err)
    alert('删除失败')
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
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 28px;
}

.search-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 250px;
  padding: 12px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.select-input {
  padding: 12px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: white;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger:hover {
  background: #fecaca;
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.question-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: #1f2937;
}

.question-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.difficulty-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.difficulty-badge.easy {
  background: #d1fae5;
  color: #059669;
}

.difficulty-badge.medium {
  background: #fef3c7;
  color: #d97706;
}

.difficulty-badge.hard {
  background: #fee2e2;
  color: #dc2626;
}

.category-tag {
  padding: 4px 10px;
  border-radius: 20px;
  background: #e0e7ff;
  color: #4f46e5;
  font-size: 12px;
}

.tags {
  display: flex;
  gap: 4px;
}

.tag {
  padding: 3px 8px;
  border-radius: 12px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
}

.created-at {
  color: #9ca3af;
  font-size: 12px;
}

.question-actions {
  display: flex;
  gap: 8px;
}

.question-preview {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.question-preview.collapsed .preview-content {
  max-height: 100px;
  overflow: hidden;
  position: relative;
}

.question-preview.collapsed .preview-content::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(transparent, white);
}

.content-item {
  margin-bottom: 12px;
  color: #4b5563;
}

.content-item p {
  margin: 8px 0 0 0;
  line-height: 1.6;
}

.toggle-preview {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 14px;
  padding: 8px 0;
}

.answer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed #e5e7eb;
  line-height: 1.8;
}

.answer :deep(pre) {
  background: #1f2937;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.answer :deep(code) {
  font-family: 'Monaco', 'Consolas', monospace;
}

.pagination {
  display: flex;
  justify-content: center;
  gap: 16px;
  align-items: center;
  margin-top: 32px;
}

.page-btn {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: #667eea;
  color: #667eea;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #6b7280;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 24px;
}

.modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 22px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #9ca3af;
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.form-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: all 0.2s ease;
}

.form-textarea:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
</style>