<template>
  <div class="interview-workbench">
    <header class="workbench-bar">
      <button class="icon-button" type="button" aria-label="返回工作台" @click="goBack">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>

      <div class="brand-lockup">
        <span class="brand-mark">Q</span>
        <span><strong>Interview Studio</strong><small>面试训练台</small></span>
      </div>

      <div class="bar-actions">
        <button v-if="authStore.isAdmin" class="text-button" type="button" @click="goDocs">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
          </svg>
          知识文档
        </button>
      </div>
    </header>

    <main v-if="!showDetail" class="dashboard-shell">
      <section class="hero-panel" aria-labelledby="interview-title">
        <div class="hero-copy">
          <span class="eyebrow">YOUR INTERVIEW TRAINING SPACE</span>
          <h1 id="interview-title">把会的说清楚，把不会的练熟</h1>
          <p>按专项建立知识结构，用自评记录真实掌握度。每次先口述，再对照标准答案复盘。</p>

          <div class="hero-actions">
            <button
              class="primary-action"
              type="button"
              :disabled="busyMode !== null"
              @click="startPractice(primaryPracticeMode)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg>
              {{ busyMode === primaryPracticeMode ? '正在准备…' : primaryActionLabel }}
            </button>
            <button
              v-if="hasLastQuestion"
              class="secondary-action"
              type="button"
              :disabled="busyMode !== null"
              @click="continueLastQuestion"
            >
              继续上次
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <button
              v-else
              class="secondary-action"
              type="button"
              :disabled="busyMode !== null"
              @click="startPractice('all')"
            >
              随机抽题
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <div class="hero-progress">
          <div
            class="progress-ring"
            role="progressbar"
            aria-label="题库掌握进度"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="learningStats.progress"
            :style="progressRingStyle"
          >
            <div>
              <strong>{{ learningStats.progress }}%</strong><span>掌握进度</span>
            </div>
          </div>
          <div class="hero-summary">
            <span
              ><strong>{{ learningStats.mastered }}</strong> 已掌握</span
            >
            <span
              ><strong>{{ learningStats.unpracticed }}</strong> 待探索</span
            >
          </div>
        </div>
      </section>

      <section class="metric-grid" aria-label="学习数据概览">
        <article class="metric-card metric-total">
          <span class="metric-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            </svg>
          </span>
          <div>
            <strong>{{ catalogTotal }}</strong
            ><span>题目总量</span>
          </div>
          <small>{{ categories.length }} 个专项分类</small>
        </article>
        <article class="metric-card metric-learning">
          <span class="metric-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
          </span>
          <div>
            <strong>{{ learningStats.practiced }}</strong
            ><span>已经练习</span>
          </div>
          <small>{{ learningStats.learning }} 道仍在巩固</small>
        </article>
        <article class="metric-card metric-review">
          <span class="metric-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </span>
          <div>
            <strong>{{ learningStats.review }}</strong
            ><span>需要复习</span>
          </div>
          <small>优先处理薄弱项</small>
        </article>
        <article class="metric-card metric-favorite">
          <span class="metric-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.3L5.8 21 7 14.1l-5-4.8 6.9-1Z" />
            </svg>
          </span>
          <div>
            <strong>{{ learningStats.favorites }}</strong
            ><span>重点收藏</span>
          </div>
          <small>沉淀高价值题目</small>
        </article>
      </section>

      <section class="content-section" aria-labelledby="training-mode-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">PRACTICE MODE</span>
            <h2 id="training-mode-title">选择今天的训练方式</h2>
          </div>
          <p>短时间也能完成一次有效练习</p>
        </div>

        <div class="mode-grid">
          <button
            class="mode-card mode-new"
            type="button"
            :disabled="busyMode !== null || learningStats.unpracticed === 0"
            @click="startPractice('unpracticed')"
          >
            <span class="mode-index">01</span>
            <span class="mode-copy">
              <strong>探索新题</strong>
              <small>{{
                learningStats.unpracticed ? '从未练题目中随机开始' : '当前范围的新题已练完'
              }}</small>
            </span>
            <span class="mode-count">{{ learningStats.unpracticed }}</span>
            <svg class="mode-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button
            class="mode-card mode-review"
            type="button"
            :disabled="busyMode !== null || learningStats.review === 0"
            @click="startPractice('review')"
          >
            <span class="mode-index">02</span>
            <span class="mode-copy">
              <strong>薄弱复习</strong>
              <small>{{ learningStats.review ? '集中清理待复习题目' : '暂无待复习题目' }}</small>
            </span>
            <span class="mode-count">{{ learningStats.review }}</span>
            <svg class="mode-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button
            class="mode-card mode-random"
            type="button"
            :disabled="busyMode !== null"
            @click="startPractice('all')"
          >
            <span class="mode-index">03</span>
            <span class="mode-copy"
              ><strong>随机模拟</strong><small>模拟面试官临场抽题</small></span
            >
            <span class="mode-count">∞</span>
            <svg class="mode-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </section>

      <section v-if="categories.length" class="content-section" aria-labelledby="category-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">FOCUS BY TOPIC</span>
            <h2 id="category-title">专项训练</h2>
          </div>
          <p>按知识域逐个击破</p>
        </div>

        <div class="category-grid">
          <button
            v-for="(category, index) in categories"
            :key="category.id"
            class="category-card"
            :class="[`tone-${index % 4}`, { active: selectedCategory === category.id }]"
            type="button"
            @click="focusCategory(category.id)"
          >
            <span class="category-symbol">{{ getCategoryIcon(category.name) }}</span>
            <span class="category-copy">
              <strong>{{ category.name }}</strong
              ><small>{{ categoryQuestionCount(category) }} 道题</small>
            </span>
            <span class="category-progress">
              <span><i :style="{ width: `${categoryProgress(category)}%` }"></i></span>
              <small>{{ categoryProgress(category) }}%</small>
            </span>
          </button>
        </div>
      </section>

      <section ref="catalogRef" class="catalog-section" aria-labelledby="catalog-title">
        <div class="catalog-heading">
          <div>
            <span class="section-kicker">QUESTION LIBRARY</span>
            <h2 id="catalog-title">{{ catalogTitle }}</h2>
            <p>{{ filteredTotal }} 道结果 · 点击题目进入口述练习</p>
          </div>
          <button
            class="shuffle-button"
            type="button"
            :disabled="busyMode !== null"
            @click="startPractice('all')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 3h5v5" />
              <path d="M4 20 21 3" />
              <path d="M21 16v5h-5" />
              <path d="m15 15 6 6" />
              <path d="M4 4 9 9" />
            </svg>
            随机一题
          </button>
        </div>

        <div class="filter-panel">
          <div class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              v-model="searchKeyword"
              type="search"
              aria-label="搜索题目、答案或标签"
              placeholder="搜索题目、答案或标签"
              @input="handleSearch"
              @keydown.enter="handleSearchImmediate"
            />
            <kbd>/</kbd>
          </div>

          <div class="filter-row">
            <CustomSelect
              v-model="selectedCategory"
              :options="categoryOptions"
              placeholder="全部分类"
              width="190px"
            />
            <CustomSelect
              v-model="selectedDifficulty"
              :options="difficultyOptions"
              placeholder="全部难度"
              width="160px"
            />
            <CustomSelect
              v-model="selectedStatus"
              :options="statusOptions"
              placeholder="全部状态"
              width="170px"
            />
            <button
              v-if="activeFilterCount"
              class="reset-button"
              type="button"
              @click="resetFilters"
            >
              清除 {{ activeFilterCount }} 项筛选
            </button>
          </div>
        </div>

        <div v-if="loading" class="question-list loading-list" aria-label="题目加载中">
          <div v-for="item in 4" :key="item" class="question-row skeleton-row">
            <Skeleton :width="54" :height="54" />
            <div class="skeleton-lines">
              <Skeleton :width="180" :height="13" text />
              <Skeleton :width="320" :height="18" text />
            </div>
          </div>
        </div>

        <div v-else-if="fetchError" class="catalog-state error-state">
          <span>!</span>
          <div>
            <strong>题目加载失败</strong>
            <p>{{ fetchError }}</p>
          </div>
          <button type="button" @click="fetchQuestions">重新加载</button>
        </div>

        <EmptyState
          v-else-if="questions.length === 0"
          icon=""
          title="没有符合条件的题目"
          description="换一个关键词或清除筛选后再试试"
          class="catalog-state"
        >
          <button class="reset-button" type="button" @click="resetFilters">清除筛选</button>
        </EmptyState>

        <div v-else class="question-list">
          <article
            v-for="(question, index) in questions"
            :key="question.id"
            class="question-row"
            :class="`status-${getQuestionStatus(question.id) || 'new'}`"
          >
            <span class="question-number">{{
              String((currentPage - 1) * pageSize + index + 1).padStart(2, '0')
            }}</span>
            <div class="question-main">
              <div class="question-meta">
                <span class="difficulty-pill" :class="question.difficulty">{{
                  getDifficultyLabel(question.difficulty)
                }}</span>
                <span>{{ getCategoryName(question.categoryId) }}</span>
                <span class="status-dot" :class="getQuestionStatus(question.id) || 'new'">
                  {{ getStatusLabel(getQuestionStatus(question.id)) }}
                </span>
              </div>
              <button class="question-title" type="button" @click="openQuestion(question)">
                {{ question.title }}
              </button>
              <div v-if="question.tags?.length" class="question-tags">
                <span v-for="tag in question.tags.slice(0, 3)" :key="tag"># {{ tag }}</span>
              </div>
            </div>
            <button
              class="favorite-button"
              type="button"
              :class="{ active: favoriteIds.has(question.id) }"
              :aria-label="favoriteIds.has(question.id) ? '取消收藏' : '收藏题目'"
              :aria-pressed="favoriteIds.has(question.id)"
              @click="toggleQuestionFavorite(question.id)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.3L5.8 21 7 14.1l-5-4.8 6.9-1Z" />
              </svg>
            </button>
            <button class="open-button" type="button" @click="openQuestion(question)">
              开始作答
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </article>
        </div>

        <nav v-if="totalPages > 1" class="pagination" aria-label="题库分页">
          <button
            type="button"
            :disabled="currentPage === 1"
            aria-label="上一页"
            @click="changePage(currentPage - 1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span
            >第 <strong>{{ currentPage }}</strong> / {{ totalPages }} 页</span
          >
          <button
            type="button"
            :disabled="currentPage === totalPages"
            aria-label="下一页"
            @click="changePage(currentPage + 1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </nav>
      </section>
    </main>

    <main v-else class="detail-shell">
      <div class="detail-topbar">
        <button class="back-to-list" type="button" @click="closeDetail">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          返回题库
        </button>
        <span>先独立口述，再核对答案</span>
        <button
          class="detail-favorite"
          type="button"
          :class="{ active: favoriteIds.has(currentQuestion.id) }"
          :aria-pressed="favoriteIds.has(currentQuestion.id)"
          @click="toggleQuestionFavorite(currentQuestion.id)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.3L5.8 21 7 14.1l-5-4.8 6.9-1Z" />
          </svg>
          {{ favoriteIds.has(currentQuestion.id) ? '已收藏' : '收藏' }}
        </button>
      </div>

      <div class="detail-layout">
        <article class="detail-card">
          <div class="detail-meta">
            <span class="difficulty-pill" :class="currentQuestion.difficulty">{{
              getDifficultyLabel(currentQuestion.difficulty)
            }}</span>
            <span>{{ getCategoryName(currentQuestion.categoryId) }}</span>
            <span v-for="tag in currentQuestion.tags?.slice(0, 3)" :key="tag"># {{ tag }}</span>
          </div>

          <p class="question-label">INTERVIEW QUESTION</p>
          <h1>{{ currentQuestion.title }}</h1>

          <div class="thinking-guide">
            <span class="thinking-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path
                  d="M8.5 14.5A7 7 0 1 1 15.5 14.5C14.5 15.3 14 16 14 18h-4c0-2-.5-2.7-1.5-3.5Z"
                />
              </svg>
            </span>
            <div>
              <strong>建议先口述 60–90 秒</strong>
              <p>按“结论 → 原理 → 工程实践 → 边界”组织答案，再打开参考答案。</p>
            </div>
          </div>

          <div v-if="currentQuestion.options?.length" class="options-section">
            <button
              v-for="(option, index) in currentQuestion.options"
              :key="option"
              class="option-item"
              :class="{ selected: selectedAnswer === option }"
              type="button"
              @click="selectOption(option)"
            >
              <span>{{ String.fromCharCode(65 + index) }}</span
              >{{ option }}
            </button>
          </div>

          <button class="reveal-button" type="button" @click="toggleAnswer">
            <svg v-if="!showAnswer" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 3 18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.1 3.2" />
              <path d="M6.2 6.2C3.5 8 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 3-.5" />
            </svg>
            {{ showAnswer ? '收起参考答案' : '完成口述，查看参考答案' }}
          </button>

          <Transition name="answer">
            <section v-if="showAnswer" class="answer-section">
              <div class="answer-heading">
                <span>STANDARD ANSWER</span>
                <h2>参考答案</h2>
              </div>
              <MarkdownView :content="currentQuestion.answer" />
              <div v-if="currentQuestion.analysis" class="analysis-section">
                <h3>答题解析</h3>
                <p>{{ currentQuestion.analysis }}</p>
              </div>
            </section>
          </Transition>
        </article>

        <aside class="study-sidebar">
          <section class="sidebar-card status-card">
            <span class="sidebar-kicker">LEARNING STATUS</span>
            <div class="current-status">
              <span :class="currentStatus || 'new'"></span>
              <div>
                <small>当前状态</small><strong>{{ getStatusLabel(currentStatus) }}</strong>
              </div>
            </div>
            <div class="attempt-row">
              <span>练习次数</span><strong>{{ currentProgress?.attempts ?? 0 }}</strong>
            </div>
          </section>

          <section class="sidebar-card assessment-card">
            <span class="sidebar-kicker">SELF ASSESSMENT</span>
            <h2>这道题掌握得怎么样？</h2>
            <p v-if="!showAnswer">查看参考答案后再进行自评，记录会保存在本机。</p>
            <div class="assessment-actions">
              <button
                type="button"
                :disabled="!showAnswer"
                :class="{ active: currentStatus === 'review' }"
                @click="rateQuestion('review')"
              >
                <span class="rating-icon review">!</span
                ><span><strong>需要复习</strong><small>没答上或遗漏关键点</small></span>
              </button>
              <button
                type="button"
                :disabled="!showAnswer"
                :class="{ active: currentStatus === 'learning' }"
                @click="rateQuestion('learning')"
              >
                <span class="rating-icon learning">~</span
                ><span><strong>继续巩固</strong><small>方向正确但还不流畅</small></span>
              </button>
              <button
                type="button"
                :disabled="!showAnswer"
                :class="{ active: currentStatus === 'mastered' }"
                @click="rateQuestion('mastered')"
              >
                <span class="rating-icon mastered">✓</span
                ><span><strong>已经掌握</strong><small>能完整说明原理和边界</small></span>
              </button>
            </div>
          </section>

          <button
            class="next-question"
            type="button"
            :disabled="busyMode !== null"
            @click="nextQuestion"
          >
            {{ busyMode ? '正在准备下一题…' : '继续下一题' }}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </aside>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CustomSelect, EmptyState, MarkdownView, Skeleton, type SelectOption } from '@/components'
import { useToast } from '@/composables/useToast'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { api } from '@/lib/request'
import { getStorage, setStorage } from '@/lib/storage'
import { useAuthStore } from '@/stores'
import type { Category, Question } from '@/types/interview'
import { debounce } from '@/utils'
import { QUESTION_PAGE_SIZE } from './config'
import {
  calculateLearningStats,
  createLearningState,
  filterQuestionsByLearning,
  getLearningStatus,
  normalizeLearningState,
  setQuestionStatus,
  setLastQuestion,
  toggleFavorite,
  updateQuestionProgress,
  type InterviewLearningState,
  type LearningFilter,
  type LearningStatus,
} from './progress'
import { buildQuery } from './utils'

type PracticeMode = 'all' | 'unpracticed' | 'review' | 'favorite'
type QuestionListResponse = {
  questions: Question[]
  total: number
  page: number
  totalPages: number
}

const router = useRouter()
const authStore = useAuthStore()
const { addToast } = useToast()
const pageSize = QUESTION_PAGE_SIZE
const catalogRef = ref<HTMLElement | null>(null)
const questions = ref<Question[]>([])
const categories = ref<Category[]>([])
const currentQuestion = ref<Question>({} as Question)
const learningState = ref<InterviewLearningState>(createLearningState())
const loading = ref(false)
const busyMode = ref<PracticeMode | 'continue' | null>(null)
const fetchError = ref('')
const showDetail = ref(false)
const showAnswer = ref(false)
const attemptRecorded = ref(false)
const selectedAnswer = ref<string | null>(null)
const selectedCategory = ref<string | number>('')
const selectedDifficulty = ref<string | number>('')
const selectedStatus = ref<LearningFilter>('')
const searchKeyword = ref('')
const currentPage = ref(1)
const totalPages = ref(1)
const filteredTotal = ref(0)
const catalogTotal = ref(0)
const activePracticeMode = ref<PracticeMode>('all')

const categoryOptions = ref<SelectOption[]>([])
const difficultyOptions: SelectOption[] = [
  { value: '', label: '全部难度' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]
const statusOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'unpracticed', label: '未练习' },
  { value: 'learning', label: '练习中' },
  { value: 'review', label: '需复习' },
  { value: 'mastered', label: '已掌握' },
  { value: 'favorite', label: '已收藏' },
]

const learningStats = computed(() =>
  calculateLearningStats(catalogTotal.value, learningState.value),
)
const favoriteIds = computed(() => new Set(learningState.value.favorites))
const currentStatus = computed(() =>
  getLearningStatus(learningState.value, currentQuestion.value.id),
)
const currentProgress = computed(
  () => learningState.value.records[String(currentQuestion.value.id)] ?? null,
)
const hasLastQuestion = computed(() => learningState.value.lastQuestionId !== null)
const primaryPracticeMode = computed<PracticeMode>(() => {
  if (learningStats.value.unpracticed > 0) return 'unpracticed'
  if (learningStats.value.review > 0) return 'review'
  return 'all'
})
const primaryActionLabel = computed(() => {
  if (primaryPracticeMode.value === 'unpracticed') return '开始今日练习'
  if (primaryPracticeMode.value === 'review') return '开始薄弱复习'
  return '随机巩固一题'
})
const progressRingStyle = computed<Record<string, string>>(() => ({
  '--quiz-progress': `${learningStats.value.progress * 3.6}deg`,
}))
const activeFilterCount = computed(
  () =>
    [
      selectedCategory.value,
      selectedDifficulty.value,
      selectedStatus.value,
      searchKeyword.value,
    ].filter(Boolean).length,
)
const catalogTitle = computed(() => {
  if (selectedCategory.value) return `${getCategoryName(Number(selectedCategory.value))}题目`
  if (selectedStatus.value === 'review') return '待复习题目'
  if (selectedStatus.value === 'mastered') return '已掌握题目'
  if (selectedStatus.value === 'favorite') return '重点收藏'
  return '全部题目'
})

function persistLearningState() {
  setStorage(STORAGE_KEYS.INTERVIEW_LEARNING, learningState.value)
  setStorage(STORAGE_KEYS.INTERVIEW_PRACTICED, Object.keys(learningState.value.records).map(Number))
}

function loadLearningState() {
  const legacyIds = getStorage<number[]>(STORAGE_KEYS.INTERVIEW_PRACTICED) ?? []
  learningState.value = normalizeLearningState(
    getStorage<unknown>(STORAGE_KEYS.INTERVIEW_LEARNING),
    legacyIds,
  )
  persistLearningState()
}

async function fetchCategories() {
  try {
    const data = await api.get<Category[]>('/api/questions/categories', { auth: false })
    categories.value = data
    catalogTotal.value = data.reduce((sum, category) => sum + (category.Questions?.length ?? 0), 0)
    categoryOptions.value = [
      { value: '', label: '全部分类' },
      ...data.map((category) => ({ value: category.id, label: category.name })),
    ]
  } catch (error) {
    console.error('获取分类失败:', error)
  }
}

function getCategoryIcon(name: string) {
  const icons: Record<string, string> = {
    JavaScript基础: 'JS',
    'Vue.js': 'V',
    'CSS/HTML': 'UI',
    React: 'R',
    网络与性能优化: 'NET',
    TypeScript: 'TS',
    工程化与工具: 'ENG',
    算法与数据结构: 'ALG',
    Agent: 'AI',
  }
  return icons[name] ?? name.slice(0, 2).toUpperCase()
}

const categoryQuestionCount = (category: Category) => category.Questions?.length ?? 0
function categoryProgress(category: Category) {
  const ids = category.Questions?.map((question) => question.id) ?? []
  if (!ids.length) return 0
  const mastered = ids.filter(
    (id) => getLearningStatus(learningState.value, id) === 'mastered',
  ).length
  return Math.round((mastered / ids.length) * 100)
}

async function fetchAllQuestions(includeKeyword = true): Promise<Question[]> {
  const params = {
    limit: 100,
    categoryId: selectedCategory.value,
    difficulty: selectedDifficulty.value,
    keyword: includeKeyword ? searchKeyword.value.trim() : '',
  }
  const first = await api.get<QuestionListResponse>(
    `/api/questions?${buildQuery({ ...params, page: 1 })}`,
    { auth: false },
  )
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => index + 2).map((page) =>
      api.get<QuestionListResponse>(`/api/questions?${buildQuery({ ...params, page })}`, {
        auth: false,
      }),
    ),
  )
  return [first, ...remaining].flatMap((result) => result.questions)
}

let listRequestId = 0
async function fetchQuestions() {
  const requestId = ++listRequestId
  loading.value = true
  fetchError.value = ''
  try {
    if (selectedStatus.value) {
      const allQuestions = await fetchAllQuestions()
      if (requestId !== listRequestId) return
      const filtered = filterQuestionsByLearning(
        allQuestions,
        selectedStatus.value,
        learningState.value,
      )
      filteredTotal.value = filtered.length
      totalPages.value = Math.max(1, Math.ceil(filtered.length / pageSize))
      currentPage.value = Math.min(currentPage.value, totalPages.value)
      const start = (currentPage.value - 1) * pageSize
      questions.value = filtered.slice(start, start + pageSize)
      return
    }

    const query = buildQuery({
      page: currentPage.value,
      limit: pageSize,
      categoryId: selectedCategory.value,
      difficulty: selectedDifficulty.value,
      keyword: searchKeyword.value.trim(),
    })
    const data = await api.get<QuestionListResponse>(`/api/questions?${query}`, { auth: false })
    if (requestId !== listRequestId) return
    questions.value = data.questions
    filteredTotal.value = data.total
    totalPages.value = Math.max(1, data.totalPages)
    if (!selectedCategory.value && !selectedDifficulty.value && !searchKeyword.value.trim())
      catalogTotal.value = data.total
  } catch (error) {
    if (requestId !== listRequestId) return
    console.error('获取题目失败:', error)
    fetchError.value = '请检查网络连接后重试。'
    questions.value = []
    filteredTotal.value = 0
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

let lastSearchAt = 0
function runSearch() {
  lastSearchAt = Date.now()
  currentPage.value = 1
  void fetchQuestions()
}
const debouncedSearch = debounce(() => {
  if (Date.now() - lastSearchAt >= 300) runSearch()
}, 300)
const handleSearch = () => debouncedSearch()
const handleSearchImmediate = () => runSearch()

function resetFilters() {
  const structuredFilterChanged = Boolean(
    selectedCategory.value || selectedDifficulty.value || selectedStatus.value,
  )
  selectedCategory.value = ''
  selectedDifficulty.value = ''
  selectedStatus.value = ''
  searchKeyword.value = ''
  currentPage.value = 1
  if (!structuredFilterChanged) void fetchQuestions()
}

function focusCategory(categoryId: number) {
  selectedCategory.value = categoryId
  currentPage.value = 1
  nextTick(() => catalogRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function rememberQuestion(questionId: number) {
  learningState.value = setLastQuestion(learningState.value, questionId)
  persistLearningState()
}

function openQuestion(question: Question, mode: PracticeMode = 'all') {
  currentQuestion.value = question
  activePracticeMode.value = mode
  selectedAnswer.value = null
  showAnswer.value = false
  attemptRecorded.value = false
  showDetail.value = true
  rememberQuestion(question.id)
  nextTick(() => document.querySelector('.app-main')?.scrollTo({ top: 0, behavior: 'smooth' }))
}

async function startPractice(mode: PracticeMode) {
  busyMode.value = mode
  try {
    let candidate: Question | undefined
    if (mode === 'all') {
      const query = buildQuery({
        categoryId: selectedCategory.value,
        difficulty: selectedDifficulty.value,
      })
      candidate = (
        await api.get<Question[]>(`/api/questions/random/1?${query}`, { auth: false })
      )[0]
    } else {
      const filtered = filterQuestionsByLearning(
        await fetchAllQuestions(false),
        mode,
        learningState.value,
      )
      candidate = filtered[Math.floor(Math.random() * filtered.length)]
    }
    if (!candidate) {
      const messages: Record<PracticeMode, string> = {
        all: '当前筛选下暂无题目',
        unpracticed: '当前范围的新题已经练完了，可以复习薄弱项',
        review: '暂无待复习题目，继续保持',
        favorite: '还没有收藏题目',
      }
      addToast('info', messages[mode])
      return
    }
    openQuestion(candidate, mode)
  } catch (error) {
    console.error('准备练习失败:', error)
    addToast('error', '题目加载失败，请稍后重试')
  } finally {
    busyMode.value = null
  }
}

async function continueLastQuestion() {
  const questionId = learningState.value.lastQuestionId
  if (!questionId) return
  busyMode.value = 'continue'
  try {
    openQuestion(await api.get<Question>(`/api/questions/${questionId}`, { auth: false }))
  } catch (error) {
    console.error('继续上次练习失败:', error)
    learningState.value = { ...learningState.value, lastQuestionId: null }
    persistLearningState()
    addToast('warning', '上次练习的题目已不可用，已为你清除记录')
  } finally {
    busyMode.value = null
  }
}

function toggleQuestionFavorite(questionId: number) {
  learningState.value = toggleFavorite(learningState.value, questionId)
  persistLearningState()
  const favorite = favoriteIds.value.has(questionId)
  addToast(favorite ? 'success' : 'info', favorite ? '已加入重点收藏' : '已取消收藏')
  if (selectedStatus.value === 'favorite') void fetchQuestions()
}

function ensurePracticed() {
  if (attemptRecorded.value) return
  learningState.value = updateQuestionProgress(
    learningState.value,
    currentQuestion.value.id,
    currentStatus.value ?? 'learning',
  )
  attemptRecorded.value = true
  persistLearningState()
}

const selectOption = (option: string) => {
  selectedAnswer.value = option
}
function toggleAnswer() {
  showAnswer.value = !showAnswer.value
  if (showAnswer.value) ensurePracticed()
}

function rateQuestion(status: LearningStatus) {
  ensurePracticed()
  learningState.value = setQuestionStatus(learningState.value, currentQuestion.value.id, status)
  persistLearningState()
  const messages: Record<LearningStatus, string> = {
    review: '已加入薄弱复习',
    learning: '已标记为继续巩固',
    mastered: '很好，这道题已掌握',
  }
  addToast(status === 'mastered' ? 'success' : 'info', messages[status])
}

const nextQuestion = () => void startPractice(activePracticeMode.value)
function closeDetail() {
  showDetail.value = false
  showAnswer.value = false
  selectedAnswer.value = null
  if (selectedStatus.value) void fetchQuestions()
}

function changePage(page: number) {
  currentPage.value = page
  void fetchQuestions()
  nextTick(() => catalogRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

const getDifficultyLabel = (difficulty: string) =>
  ({ easy: '简单', medium: '中等', hard: '困难' })[difficulty] ?? difficulty
const getCategoryName = (categoryId: number) =>
  categories.value.find((category) => category.id === categoryId)?.name ?? '未分类'
const getQuestionStatus = (questionId: number) => getLearningStatus(learningState.value, questionId)
const getStatusLabel = (status: LearningStatus | null) =>
  status ? { learning: '练习中', review: '需复习', mastered: '已掌握' }[status] : '未练习'
const goBack = () => router.push('/')
const goDocs = () => router.push({ path: '/docs', query: { doc: 'niuke' } })

watch([selectedCategory, selectedDifficulty, selectedStatus], () => {
  currentPage.value = 1
  void fetchQuestions()
})

onMounted(() => {
  loadLearningState()
  void Promise.all([fetchCategories(), fetchQuestions()])
})
</script>

<style scoped src="./interview.css"></style>
