<template>
  <div class="question-editor">
    <div class="editor-header">
      <button class="btn-back" @click="goBack">← 返回</button>
      <h1>{{ isEdit ? '✏️ 编辑题目' : '📝 新建题目' }}</h1>
      <div class="header-actions">
        <button class="btn-cancel" @click="goBack">取消</button>
        <button class="btn-save" :disabled="saving" @click="saveQuestion">
          <span v-if="saving" class="spinner-sm"></span>
          {{ saving ? '保存中...' : '💾 保存' }}
        </button>
      </div>
    </div>

    <div class="editor-body">
      <div class="editor-sidebar">
        <div class="form-group">
          <label>题目标题 <span class="required">*</span></label>
          <input
            v-model="formData.title"
            :class="{ 'input-error': errors.title }"
            placeholder="输入题目标题"
          />
          <span v-if="errors.title" class="error-text">{{ errors.title }}</span>
        </div>

        <div class="form-group">
          <label>题目类型 <span class="required">*</span></label>
          <div class="type-toggle">
            <button
              class="type-btn"
              :class="{ active: questionType === 'text' }"
              @click="questionType = 'text'"
            >
              📝 问答题
            </button>
            <button
              class="type-btn"
              :class="{ active: questionType === 'choice' }"
              @click="questionType = 'choice'"
            >
              🔘 选择题
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>分类 <span class="required">*</span></label>
            <CustomSelect
              v-model="formData.categoryId"
              :options="categoryOptions"
              placeholder="请选择分类"
              default-first
            />
            <span v-if="errors.categoryId" class="error-text">{{ errors.categoryId }}</span>
          </div>
          <div class="form-group">
            <label>难度 <span class="required">*</span></label>
            <CustomSelect v-model="formData.difficulty" :options="formDifficultyOptions" />
          </div>
        </div>

        <div class="form-group">
          <label>标签</label>
          <input v-model="tagsInput" placeholder="逗号分隔，如：JavaScript, Vue" />
        </div>

        <div v-if="questionType === 'choice'" class="form-group">
          <label
            >选择题选项 <span class="required">*</span> <span class="hint">每行一个</span></label
          >
          <textarea
            v-model="formData.options"
            :class="{ 'input-error': errors.options }"
            rows="6"
            placeholder="A选项&#10;B选项&#10;C选项&#10;D选项"
          ></textarea>
          <span v-if="errors.options" class="error-text">{{ errors.options }}</span>
        </div>

        <div class="form-group">
          <label>解析</label>
          <textarea v-model="formData.analysis" rows="4" placeholder="题目解析（可选）"></textarea>
        </div>
      </div>

      <div class="editor-main">
        <div class="editor-label">
          <span>答案 (Markdown) <span class="required">*</span></span>
          <span v-if="errors.answer" class="error-text">{{ errors.answer }}</span>
        </div>
        <QuestionMarkdownEditor v-model="formData.answer" :toolbars="toolbars" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { ToolbarNames } from 'md-editor-v3'
import { CustomSelect, type SelectOption } from '@/components'
import type { Question, Category, Difficulty } from '@/types/interview'
import { api } from '@/lib/request'

const router = useRouter()
const route = useRoute()
const QuestionMarkdownEditor = defineAsyncComponent(() => import('./QuestionMarkdownEditor.vue'))

const questionId = computed(() => route.params.id as string | undefined)
const isEdit = computed(() => !!questionId.value)

const categories = ref<Category[]>([])
const saving = ref(false)
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
  categories.value.map((c) => ({ value: c.id, label: c.name })),
)

const formDifficultyOptions: SelectOption[] = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

const toolbars: ToolbarNames[] = [
  'bold',
  'italic',
  'strikeThrough',
  'title',
  'quote',
  'code',
  'prettier',
  '-',
  'unorderedList',
  'orderedList',
  'table',
  'link',
  'image',
  '-',
  'preview',
  'fullscreen',
]

onMounted(async () => {
  await fetchCategories()
  if (isEdit.value) {
    await fetchQuestion()
  }
})

async function fetchCategories() {
  try {
    categories.value = await api.get<Category[]>('/api/questions/categories')
  } catch {
    // ignore
  }
}

async function fetchQuestion() {
  try {
    const q = await api.get<Question>(`/api/questions/${questionId.value}`)
    formData.value = {
      title: q.title,
      answer: q.answer,
      analysis: q.analysis || '',
      options: (q.options || []).join('\n'),
      difficulty: q.difficulty,
      categoryId: q.categoryId,
      tags: q.tags || [],
    }
    questionType.value = q.options?.length ? 'choice' : 'text'
    tagsInput.value = (q.tags || []).join(', ')
  } catch {
    router.push('/admin/questions')
  }
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
  if (questionType.value === 'choice') {
    data.options = formData.value.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)
  } else {
    data.options = null
  }
  if (tagsInput.value) {
    data.tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  } else {
    data.tags = []
  }
  try {
    if (isEdit.value) {
      await api.put(`/api/questions/${questionId.value}`, data)
    } else {
      await api.post('/api/questions', data)
    }
    router.push('/admin/questions')
  } catch (e) {
    errors.value = { title: e instanceof Error ? e.message : '保存失败' }
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push('/admin/questions')
}
</script>

<style scoped>
.question-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 20px;
}

.editor-header h1 {
  font-size: 20px;
  color: var(--text-primary);
  flex: 1;
  margin: 0;
}

.btn-back {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.15s;
}

.btn-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-cancel {
  padding: 8px 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
  transition: all 0.15s;
}

.btn-cancel:hover {
  background: var(--bg-hover);
}

.btn-save {
  padding: 8px 20px;
  border: none;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-save:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.editor-body {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
}

.editor-sidebar {
  width: 340px;
  flex-shrink: 0;
  overflow-y: auto;
  padding-right: 8px;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.editor-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.editor-main :deep(.md-editor) {
  flex: 1;
  min-height: 400px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-light);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  font-size: 13px;
  color: var(--text-primary);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: all 0.15s;
  background: var(--bg-input);
  color: var(--text-primary);
  box-sizing: border-box;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group textarea {
  resize: vertical;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.required {
  color: var(--danger);
}

.hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-muted);
}

.input-error {
  border-color: var(--danger) !important;
}

.error-text {
  display: block;
  color: var(--danger);
  font-size: 11px;
  margin-top: 3px;
}

.type-toggle {
  display: flex;
  gap: 8px;
}

.type-btn {
  flex: 1;
  padding: 9px 12px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.type-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.type-btn.active {
  border-color: var(--accent);
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.spinner-sm {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: vc-spin 0.8s linear infinite;
}
</style>
