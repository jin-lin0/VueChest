<template>
  <div class="category-management">
    <div class="page-header">
      <div>
        <h1>📂 分类管理</h1>
        <p class="page-desc">管理题目分类，共 {{ categories.length }} 个分类</p>
      </div>
      <button class="btn-primary" @click="showCreateModal">
        <span class="btn-icon">+</span> 新建分类
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-state">
      <div class="vc-loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="categories.length === 0" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>暂无分类数据</p>
      <button class="btn-primary" @click="showCreateModal">创建第一个分类</button>
    </div>

    <!-- 分类列表 -->
    <div v-else class="category-grid">
      <div v-for="category in categories" :key="category.id" class="category-card">
        <div class="category-icon">{{ getCategoryEmoji(category.name) }}</div>
        <div class="category-content">
          <h3 class="category-name">{{ category.name }}</h3>
          <p v-if="category.description" class="category-desc">{{ category.description }}</p>
          <div class="category-stats">
            <span class="stat">📝 {{ getQuestionCount(category) }} 道题目</span>
          </div>
        </div>
        <div class="category-actions">
          <button class="btn-secondary btn-sm" @click="showEditModal(category)">✏️ 编辑</button>
          <button
            class="btn-danger btn-sm"
            :disabled="getQuestionCount(category) > 0"
            :title="getQuestionCount(category) > 0 ? '该分类下有题目，无法删除' : '删除分类'"
            @click="confirmDelete(category)"
          >
            🗑️ 删除
          </button>
        </div>
      </div>
    </div>

    <!-- 创建/编辑分类弹窗 -->
    <Modal
      :open="showModal"
      :width="500"
      :title="editingCategory ? '✏️ 编辑分类' : '📂 创建分类'"
      @close="showModal = false"
    >
      <div class="form-group">
        <label>分类名称 <span class="required">*</span></label>
        <input
          v-model="formData.name"
          class="form-input"
          :class="{ 'input-error': errors.name }"
          placeholder="输入分类名称"
        />
        <span v-if="errors.name" class="error-text">{{ errors.name }}</span>
      </div>

      <div class="form-group">
        <label>分类描述</label>
        <textarea
          v-model="formData.description"
          class="form-textarea"
          rows="3"
          placeholder="输入分类描述（可选）"
        ></textarea>
      </div>

      <template #footer>
        <button class="btn-secondary" @click="showModal = false">取消</button>
        <button class="btn-primary" :disabled="saving" @click="saveCategory">
          <span v-if="saving" class="vc-loading-spinner-sm"></span>
          {{ editingCategory ? '保存' : '创建' }}
        </button>
      </template>
    </Modal>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Modal, Toast } from '@/components'
import { api } from '@/lib/request'
import { useConfirm } from '@/composables/useConfirm'

const { confirm } = useConfirm()

interface Category {
  id: number
  name: string
  description?: string
  Questions?: Array<{ id: number }>
}

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  toastRef.value?.addToast(type, message)
}

const categories = ref<Category[]>([])
const isLoading = ref(false)
const saving = ref(false)

const showModal = ref(false)
const editingCategory = ref<Category | null>(null)
const formData = ref({ name: '', description: '' })
const errors = ref<Record<string, string>>({})

onMounted(() => fetchCategories())

async function fetchCategories() {
  isLoading.value = true
  try {
    categories.value = await api.get<Category[]>('/api/questions/categories')
  } catch {
    showToast('error', '获取分类列表失败')
  } finally {
    isLoading.value = false
  }
}

function getQuestionCount(category: Category) {
  return category.Questions ? category.Questions.length : 0
}

function getCategoryEmoji(name: string) {
  const emojiMap: Record<string, string> = {
    JavaScript基础: '🟨',
    JavaScript: '🟨',
    'Vue.js': '💚',
    Vue: '💚',
    'CSS/HTML': '🎨',
    CSS: '🎨',
    HTML: '🌐',
    React: '⚛️',
    网络与性能优化: '🚀',
    TypeScript: '🔷',
    工程化与工具: '🛠️',
    算法与数据结构: '🧮',
    Node: '🟢',
    Git: '🔀',
    Webpack: '📦',
    Vite: '⚡',
  }
  return emojiMap[name] || '📁'
}

function validate(): boolean {
  const errs: Record<string, string> = {}
  if (!formData.value.name.trim()) errs.name = '请输入分类名称'
  errors.value = errs
  return Object.keys(errs).length === 0
}

function showCreateModal() {
  editingCategory.value = null
  formData.value = { name: '', description: '' }
  errors.value = {}
  showModal.value = true
}

function showEditModal(category: Category) {
  editingCategory.value = category
  formData.value = { name: category.name, description: category.description || '' }
  errors.value = {}
  showModal.value = true
}

async function saveCategory() {
  if (!validate()) return
  saving.value = true

  try {
    if (editingCategory.value) {
      await api.put(`/api/questions/categories/${editingCategory.value.id}`, formData.value)
    } else {
      await api.post('/api/questions/categories', formData.value)
    }
    showToast('success', editingCategory.value ? '分类已更新' : '分类创建成功')
    await fetchCategories()
    showModal.value = false
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '保存失败，请检查网络连接')
  } finally {
    saving.value = false
  }
}

async function confirmDelete(category: Category) {
  if (getQuestionCount(category) > 0) {
    showToast('warning', '该分类下有题目，无法删除')
    return
  }
  const ok = await confirm(`确定要删除分类「${category.name}」吗？`)
  if (!ok) return
  deleteCategory(category.id)
}

async function deleteCategory(id: number) {
  try {
    await api.delete(`/api/questions/categories/${id}`)
    showToast('success', '分类已删除')
    await fetchCategories()
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '删除失败，请检查网络连接')
  }
}
</script>

<style scoped>
.category-management {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 26px;
  color: var(--text-primary);
}

.page-desc {
  margin: 4px 0 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.btn-icon {
  font-size: 18px;
  font-weight: 300;
}
.btn-sm {
  padding: 8px 14px;
  font-size: 13px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--text-muted);
}

.btn-danger {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid var(--danger-bg);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danger:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 0;
  color: var(--text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 0;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
}
.empty-state p {
  font-size: 16px;
  margin: 0;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.category-card {
  background: var(--bg-card);
  border-radius: 14px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.25s;
  border: 1px solid transparent;
}

.category-card:hover {
  border-color: var(--border-light);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.category-icon {
  font-size: 36px;
  line-height: 1;
}
.category-content {
  flex: 1;
}

.category-name {
  margin: 0 0 6px 0;
  font-size: 18px;
  color: var(--text-primary);
  font-weight: 600;
}

.category-desc {
  margin: 0 0 10px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.category-stats {
  display: flex;
  gap: 12px;
}
.stat {
  color: var(--text-muted);
  font-size: 13px;
}

.category-actions {
  display: flex;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.required {
  color: var(--danger);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  background: var(--bg-input);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input-error {
  border-color: var(--danger);
}
.input-error:focus {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.error-text {
  display: block;
  color: var(--danger);
  font-size: 12px;
  margin-top: 4px;
}

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: all 0.2s;
  background: var(--bg-input);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}
</style>
