<template>
  <div class="category-management">
    <div class="page-header">
      <h1>📂 分类管理</h1>
      <button class="btn-primary" @click="showCreateModal">+ 新建分类</button>
    </div>

    <div class="category-grid">
      <div v-for="category in categories" :key="category.id" class="category-card">
        <div class="category-content">
          <h3 class="category-name">{{ category.name }}</h3>
          <p v-if="category.description" class="category-desc">
            {{ category.description }}
          </p>
          <div class="category-stats">
            <span class="stat"> 📝 {{ getQuestionCount(category) }} 道题目 </span>
          </div>
        </div>
        <div class="category-actions">
          <button class="btn-secondary" @click="showEditModal(category)">✏️ 编辑</button>
          <button
            class="btn-danger"
            :disabled="getQuestionCount(category) > 0"
            @click="deleteCategory(category.id)"
          >
            🗑️ 删除
          </button>
        </div>
      </div>
    </div>

    <!-- 创建/编辑分类弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingCategory ? '编辑分类' : '创建分类' }}</h2>
          <button class="close-btn" @click="showModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>分类名称 *</label>
            <input v-model="formData.name" class="form-input" placeholder="输入分类名称" />
          </div>

          <div class="form-group">
            <label>分类描述</label>
            <textarea
              v-model="formData.description"
              class="form-textarea"
              rows="3"
              placeholder="输入分类描述"
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="showModal = false">取消</button>
          <button class="btn-primary" @click="saveCategory">
            {{ editingCategory ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

interface Category {
  id: number
  name: string
  description?: string
  Questions?: Array<{ id: number }>
}

// 数据
const categories = ref<Category[]>([])

// 模态框
const showModal = ref(false)
const editingCategory = ref<Category | null>(null)
const formData = ref<{
  name: string
  description: string
}>({
  name: '',
  description: '',
})

// 初始化
onMounted(() => {
  fetchCategories()
})

// 获取分类
async function fetchCategories() {
  const response = await fetch(`${API_BASE}/api/questions/categories`)
  categories.value = await response.json()
}

// 获取题目数量
function getQuestionCount(category: Category) {
  return category.Questions ? category.Questions.length : 0
}

// 显示创建弹窗
function showCreateModal() {
  editingCategory.value = null
  formData.value = { name: '', description: '' }
  showModal.value = true
}

// 显示编辑弹窗
function showEditModal(category: Category) {
  editingCategory.value = category
  formData.value = { name: category.name, description: category.description || '' }
  showModal.value = true
}

// 保存分类
async function saveCategory() {
  const data = { ...formData.value }
  try {
    const url = editingCategory.value
      ? `${API_BASE}/api/questions/categories/${editingCategory.value.id}`
      : `${API_BASE}/api/questions/categories`
    const method = editingCategory.value ? 'PUT' : 'POST'

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

    await fetchCategories()
    showModal.value = false
  } catch (err) {
    console.error(err)
    alert('保存失败')
  }
}

// 删除分类
async function deleteCategory(id: number) {
  if (!confirm('确定要删除这个分类吗？')) {
    return
  }

  try {
    const response = await fetch(`${API_BASE}/api/questions/categories/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const err = await response.json()
      alert(err.error || '删除失败')
      return
    }

    await fetchCategories()
  } catch (err) {
    console.error(err)
    alert('删除失败')
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
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 28px;
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

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.category-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
}

.category-content {
  flex: 1;
}

.category-name {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: #1f2937;
}

.category-desc {
  margin: 0 0 12px 0;
  color: #6b7280;
  font-size: 14px;
}

.category-stats {
  display: flex;
  gap: 12px;
}

.stat {
  color: #9ca3af;
  font-size: 13px;
}

.category-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
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
  max-width: 500px;
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
</style>
