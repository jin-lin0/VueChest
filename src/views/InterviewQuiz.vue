<template>
  <div class="interview-quiz">
    <header class="quiz-header">
      <button class="back-button" @click="goBack">← 返回</button>
      <h1>📚 面试题库</h1>
      <p class="subtitle">前端面试高频题目，支持随机抽题和分类练习</p>
    </header>

    <!-- 统计卡片 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-number">{{ stats.totalQuestions }}</div>
        <div class="stat-label">总题数</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ stats.totalCategories }}</div>
        <div class="stat-label">分类数</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ stats.practiced }}</div>
        <div class="stat-label">已练习</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ stats.mastered }}</div>
        <div class="stat-label">已掌握</div>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜索面试题..."
          class="search-input"
          @input="handleSearch"
        />
        <button v-if="searchKeyword" class="clear-btn" @click="clearSearch">✕</button>
      </div>
    </div>

    <!-- 操作区 -->
    <div class="action-bar">
      <button class="btn btn-primary" @click="randomQuiz">🎲 随机抽题</button>
      <CustomSelect v-model="selectedCategory" :options="categoryOptions" placeholder="全部分类" />
      <CustomSelect
        v-model="selectedDifficulty"
        :options="difficultyOptions"
        placeholder="全部难度"
      />
      <CustomSelect v-model="selectedStatus" :options="statusOptions" placeholder="全部状态" />
    </div>

    <!-- 题目列表 -->
    <div class="questions-list" v-if="!showDetail">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>
      <div v-else-if="questions.length === 0" class="empty-state">
        <p>暂无题目</p>
      </div>
      <div v-else class="question-cards">
        <div
          v-for="question in questions"
          :key="question.id"
          class="question-card"
          :class="{ practiced: practicedIds.has(question.id) }"
          @click="showQuestionDetail(question)"
        >
          <div class="card-header">
            <span class="difficulty-badge" :class="question.difficulty">
              {{ getDifficultyLabel(question.difficulty) }}
            </span>
            <span class="category-tag">{{ getCategoryName(question.categoryId) }}</span>
          </div>
          <h3 class="question-title">{{ question.title }}</h3>
          <p class="question-preview">{{ question.content }}</p>
          <div class="card-footer">
            <span class="practiced-status" v-if="practicedIds.has(question.id)"> ✓ 已练习 </span>
            <span class="click-hint">点击查看 →</span>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div class="pagination" v-if="totalPages > 1">
        <button class="page-btn" :disabled="currentPage === 1" @click="changePage(currentPage - 1)">
          上一页
        </button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button
          class="page-btn"
          :disabled="currentPage === totalPages"
          @click="changePage(currentPage + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 题目详情 -->
    <div class="question-detail" v-else>
      <button class="btn-back" @click="closeDetail">← 返回列表</button>

      <div class="detail-card">
        <div class="detail-header">
          <span class="difficulty-badge" :class="currentQuestion.difficulty">
            {{ getDifficultyLabel(currentQuestion.difficulty) }}
          </span>
          <span class="category-tag">{{ getCategoryName(currentQuestion.categoryId) }}</span>
          <div class="tags" v-if="currentQuestion.tags">
            <span v-for="tag in currentQuestion.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>

        <h2 class="detail-title">{{ currentQuestion.title }}</h2>
        <div class="detail-content">
          <h4>题目：</h4>
          <p>{{ currentQuestion.content }}</p>
        </div>

        <div class="answer-section" v-if="showAnswer">
          <h4>答案：</h4>
          <div class="answer-content" v-html="formatAnswer(currentQuestion.answer)"></div>

          <div class="analysis-section" v-if="currentQuestion.analysis">
            <h4>解析：</h4>
            <p>{{ currentQuestion.analysis }}</p>
          </div>
        </div>

        <div class="detail-actions">
          <button class="btn btn-primary" @click="showAnswer = !showAnswer">
            {{ showAnswer ? '隐藏答案' : '显示答案' }}
          </button>
          <button
            class="btn"
            :class="masteredIds.has(currentQuestion.id) ? 'btn-success' : 'btn-outline'"
            @click="toggleMastered(currentQuestion.id)"
          >
            {{ masteredIds.has(currentQuestion.id) ? '已掌握 ✓' : '标记掌握' }}
          </button>
          <button class="btn btn-outline" @click="randomQuiz">🎲 下一题</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import CustomSelect from '@/components/CustomSelect.vue'
import type { SelectOption } from '@/components/CustomSelect.vue'

const router = useRouter()

// 配置 markdown 渲染
marked.setOptions({
  breaks: true,
  gfm: true,
})

const renderer = new marked.Renderer()
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
}

marked.use({ renderer })

interface Category {
  id: number
  name: string
  description: string
}

interface Question {
  id: number
  title: string
  content: string
  options: string[] | null
  answer: string
  analysis: string
  difficulty: 'easy' | 'medium' | 'hard'
  categoryId: number
  tags: string[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// 下拉选项
const categoryOptions = ref<SelectOption[]>([])
const difficultyOptions: SelectOption[] = [
  { value: '', label: '全部难度', icon: '📊' },
  { value: 'easy', label: '简单', icon: '🟢' },
  { value: 'medium', label: '中等', icon: '🟡' },
  { value: 'hard', label: '困难', icon: '🔴' },
]
const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态', icon: '📋' },
  { value: 'practiced', label: '已练习', icon: '📝' },
  { value: 'mastered', label: '已掌握', icon: '✅' },
  { value: 'unpracticed', label: '未练习', icon: '❓' },
]

// 状态
const questions = ref<Question[]>([])
const categories = ref<Category[]>([])
const currentQuestion = ref<Question>({} as Question)
const loading = ref(false)
const showDetail = ref(false)
const showAnswer = ref(false)
const selectedCategory = ref('')
const selectedDifficulty = ref('')
const selectedStatus = ref('')
const searchKeyword = ref('')
const currentPage = ref(1)
const totalPages = ref(1)

let searchTimer: ReturnType<typeof setTimeout> | null = null

// 本地存储的练习和掌握状态
const practicedIds = ref<Set<number>>(new Set())
const masteredIds = ref<Set<number>>(new Set())

// 统计
const stats = ref({
  totalQuestions: 0,
  totalCategories: 0,
  practiced: 0,
  mastered: 0,
})

// 返回首页
const goBack = () => {
  router.push('/')
}

// 搜索处理（防抖）
const handleSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchAllQuestions()
  }, 300)
}

// 清除搜索
const clearSearch = () => {
  searchKeyword.value = ''
  currentPage.value = 1
  fetchAllQuestions()
}

// 加载本地存储
const loadLocalState = () => {
  try {
    const practiced = localStorage.getItem('interview_practiced')
    const mastered = localStorage.getItem('interview_mastered')
    if (practiced) practicedIds.value = new Set(JSON.parse(practiced))
    if (mastered) masteredIds.value = new Set(JSON.parse(mastered))
  } catch (e) {
    console.error('加载本地状态失败:', e)
  }
}

// 保存本地存储
const saveLocalState = () => {
  localStorage.setItem('interview_practiced', JSON.stringify([...practicedIds.value]))
  localStorage.setItem('interview_mastered', JSON.stringify([...masteredIds.value]))
}

// 获取分类列表
const fetchCategories = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/questions/categories`)
    const data = await res.json()
    categories.value = data
    stats.value.totalCategories = data.length
    // 转换为下拉选项格式
    categoryOptions.value = [
      { value: '', label: '全部分类', icon: '📚' },
      ...data.map((cat: Category) => ({
        value: cat.id,
        label: cat.name,
        icon: getCategoryIcon(cat.name),
      })),
    ]
  } catch (e) {
    console.error('获取分类失败:', e)
  }
}

// 获取分类图标
const getCategoryIcon = (name: string) => {
  const iconMap: Record<string, string> = {
    JavaScript基础: '🟨',
    'Vue.js': '💚',
    'CSS/HTML': '🎨',
    React: '⚛️',
    网络与性能优化: '🚀',
    TypeScript: '🔷',
    工程化与工具: '🛠️',
    算法与数据结构: '🧮',
  }
  return iconMap[name] || '📖'
}

// 所有题目缓存
const allQuestions = ref<Question[]>([])

// 获取所有题目
const fetchAllQuestions = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: '1',
      limit: '1000', // 获取所有题目
    })
    if (selectedCategory.value) params.append('categoryId', selectedCategory.value)
    if (selectedDifficulty.value) params.append('difficulty', selectedDifficulty.value)
    if (searchKeyword.value) params.append('keyword', searchKeyword.value)

    const res = await fetch(`${API_BASE}/api/questions?${params}`)
    const data = await res.json()
    allQuestions.value = data.questions
    stats.value.totalQuestions = data.total

    // 应用筛选和分页
    applyFilterAndPaginate()
  } catch (e) {
    console.error('获取题目失败:', e)
  } finally {
    loading.value = false
  }
}

// 应用筛选和分页
const applyFilterAndPaginate = () => {
  let filtered = [...allQuestions.value]

  // 前端状态筛选
  if (selectedStatus.value === 'practiced') {
    filtered = filtered.filter((q) => practicedIds.value.has(q.id))
  } else if (selectedStatus.value === 'mastered') {
    filtered = filtered.filter((q) => masteredIds.value.has(q.id))
  } else if (selectedStatus.value === 'unpracticed') {
    filtered = filtered.filter((q) => !practicedIds.value.has(q.id))
  }

  // 计算分页
  const pageSize = 12
  totalPages.value = Math.ceil(filtered.length / pageSize)

  // 确保当前页码有效
  if (currentPage.value > totalPages.value) {
    currentPage.value = Math.max(1, totalPages.value)
  }

  // 截取当前页数据
  const startIndex = (currentPage.value - 1) * pageSize
  questions.value = filtered.slice(startIndex, startIndex + pageSize)
}

// 随机抽题
const randomQuiz = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (selectedCategory.value) params.append('categoryId', selectedCategory.value)
    if (selectedDifficulty.value) params.append('difficulty', selectedDifficulty.value)

    const res = await fetch(`${API_BASE}/api/questions/random/1?${params}`)
    const data = await res.json()
    if (data && data.length > 0) {
      currentQuestion.value = data[0]
      showDetail.value = true
      showAnswer.value = false
      // 标记为已练习
      practicedIds.value.add(data[0].id)
      saveLocalState()
    }
  } catch (e) {
    console.error('随机抽题失败:', e)
  } finally {
    loading.value = false
  }
}

// 显示题目详情
const showQuestionDetail = (question: Question) => {
  currentQuestion.value = question
  showDetail.value = true
  showAnswer.value = false
  // 标记为已练习
  practicedIds.value.add(question.id)
  saveLocalState()
}

// 关闭详情
const closeDetail = () => {
  showDetail.value = false
}

// 切换掌握状态
const toggleMastered = (id: number) => {
  if (masteredIds.value.has(id)) {
    masteredIds.value.delete(id)
  } else {
    masteredIds.value.add(id)
  }
  saveLocalState()
  updateStats()
}

// 切换页码
const changePage = (page: number) => {
  currentPage.value = page
  applyFilterAndPaginate()
}

// 获取难度标签
const getDifficultyLabel = (difficulty: string) => {
  const labels: Record<string, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
  }
  return labels[difficulty] || difficulty
}

// 获取分类名称
const getCategoryName = (categoryId: number) => {
  const cat = categories.value.find((c) => c.id === categoryId)
  return cat ? cat.name : '未分类'
}

// 格式化答案（使用 markdown 渲染）
const formatAnswer = (answer: string) => {
  if (!answer) return ''
  return marked.parse(answer) as string
}

// 更新统计
const updateStats = () => {
  stats.value.practiced = practicedIds.value.size
  stats.value.mastered = masteredIds.value.size
}

// 监听分类和难度变化（需要重新请求后端）
watch([selectedCategory, selectedDifficulty], () => {
  currentPage.value = 1
  fetchAllQuestions()
})

// 监听状态变化（前端筛选）
watch(selectedStatus, () => {
  currentPage.value = 1
  applyFilterAndPaginate()
})

onMounted(() => {
  loadLocalState()
  fetchCategories()
  fetchAllQuestions()
  updateStats()
})
</script>

<style scoped>
.interview-quiz {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.quiz-header {
  text-align: center;
  margin-bottom: 30px;
  position: relative;
}

.back-button {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  background-color: #667eea;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.back-button:hover {
  background-color: #764ba2;
  transform: translateY(-50%) translateX(-2px);
}

.quiz-header h1 {
  font-size: 2.5rem;
  color: #1a1a1a;
  margin-bottom: 10px;
}

.subtitle {
  color: #666;
  font-size: 1.1rem;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.stat-number {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.9;
}

/* 搜索栏 */
.search-bar {
  margin-bottom: 20px;
}

.search-input-wrapper {
  position: relative;
  max-width: 600px;
  margin: 0 auto;
}

.search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.1rem;
}

.search-input {
  width: 100%;
  padding: 14px 44px 14px 48px;
  border: 2px solid #e0e0e0;
  border-radius: 16px;
  font-size: 1rem;
  background: white;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.15);
}

.search-input::placeholder {
  color: #999;
}

.clear-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: #e0e0e0;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: #667eea;
  color: white;
}

/* 操作区 */
.action-bar {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.btn {
  padding: 12px 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-success {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  color: white;
}

.btn-outline {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.btn-outline:hover {
  background: #667eea;
  color: white;
}

/* 题目卡片 */
.question-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.question-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.question-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
  border-color: #667eea;
}

.question-card.practiced {
  border-left: 4px solid #38ef7d;
}

.card-header {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.difficulty-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
}

.difficulty-badge.easy {
  background: #d4edda;
  color: #155724;
}

.difficulty-badge.medium {
  background: #fff3cd;
  color: #856404;
}

.difficulty-badge.hard {
  background: #f8d7da;
  color: #721c24;
}

.category-tag {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  background: #e8eaf6;
  color: #3f51b5;
}

.question-title {
  font-size: 1.1rem;
  color: #1a1a1a;
  margin-bottom: 8px;
  line-height: 1.4;
}

.question-preview {
  color: #666;
  font-size: 0.95rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.practiced-status {
  color: #38ef7d;
  font-weight: 600;
  font-size: 0.9rem;
}

.click-hint {
  color: #999;
  font-size: 0.85rem;
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 30px;
}

.page-btn {
  padding: 10px 20px;
  border-radius: 10px;
  border: 2px solid #667eea;
  background: white;
  color: #667eea;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}

.page-btn:hover:not(:disabled) {
  background: #667eea;
  color: white;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 1rem;
  color: #666;
}

/* 题目详情 */
.question-detail {
  max-width: 800px;
  margin: 0 auto;
}

.btn-back {
  background: none;
  border: none;
  color: #667eea;
  font-size: 1.1rem;
  cursor: pointer;
  margin-bottom: 20px;
  font-weight: 600;
}

.btn-back:hover {
  color: #764ba2;
}

.detail-card {
  background: white;
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.detail-header {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 10px;
  border-radius: 15px;
  font-size: 0.8rem;
  background: #f5f5f5;
  color: #666;
}

.detail-title {
  font-size: 1.5rem;
  color: #1a1a1a;
  margin-bottom: 20px;
  line-height: 1.4;
}

.detail-content {
  margin-bottom: 20px;
}

.detail-content h4 {
  color: #333;
  margin-bottom: 10px;
}

.detail-content p {
  color: #555;
  line-height: 1.8;
}

.answer-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 25px;
  margin: 20px 0;
}

.answer-section h4 {
  color: #333;
  margin-bottom: 15px;
  font-size: 1.1rem;
}

.answer-content {
  color: #444;
  line-height: 1.8;
  font-size: 0.95rem;
}

/* Markdown 渲染样式 */
.answer-content :deep(h1),
.answer-content :deep(h2),
.answer-content :deep(h3),
.answer-content :deep(h4),
.answer-content :deep(h5),
.answer-content :deep(h6) {
  margin-top: 1.2em;
  margin-bottom: 0.6em;
  color: #1a1a1a;
  font-weight: 600;
}

.answer-content :deep(h1) {
  font-size: 1.5em;
}
.answer-content :deep(h2) {
  font-size: 1.3em;
}
.answer-content :deep(h3) {
  font-size: 1.15em;
}

.answer-content :deep(p) {
  margin-bottom: 1em;
}

.answer-content :deep(ul),
.answer-content :deep(ol) {
  margin-bottom: 1em;
  padding-left: 2em;
}

.answer-content :deep(li) {
  margin-bottom: 0.4em;
}

.answer-content :deep(code) {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 0.9em;
  color: #e53935;
}

.answer-content :deep(pre) {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin-bottom: 1em;
}

.answer-content :deep(pre code) {
  background: transparent;
  color: #d4d4d4;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.6;
}

.answer-content :deep(blockquote) {
  border-left: 4px solid #667eea;
  padding-left: 16px;
  margin: 1em 0;
  color: #666;
  background: #f8f9fa;
  padding: 12px 16px;
  border-radius: 0 8px 8px 0;
}

.answer-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 1em;
}

.answer-content :deep(th),
.answer-content :deep(td) {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.answer-content :deep(th) {
  background: #f5f5f5;
  font-weight: 600;
}

.answer-content :deep(strong) {
  color: #1a1a1a;
  font-weight: 600;
}

.answer-content :deep(a) {
  color: #667eea;
  text-decoration: none;
}

.answer-content :deep(a:hover) {
  text-decoration: underline;
}

.answer-content :deep(hr) {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 1.5em 0;
}

.analysis-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

.analysis-section p {
  color: #555;
  line-height: 1.6;
}

.detail-actions {
  display: flex;
  gap: 15px;
  margin-top: 25px;
  flex-wrap: wrap;
}

/* 加载和空状态 */
.loading,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .quiz-header {
    padding-top: 50px;
  }

  .quiz-header h1 {
    font-size: 1.8rem;
  }

  .back-button {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin-bottom: 10px;
  }

  .back-button:hover {
    transform: translateX(-2px);
  }

  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .question-cards {
    grid-template-columns: 1fr;
  }

  .action-bar {
    flex-direction: column;
  }

  .detail-card {
    padding: 20px;
  }

  .detail-actions {
    flex-direction: column;
  }

  .detail-actions .btn {
    width: 100%;
  }
}
</style>
