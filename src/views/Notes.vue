<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { debounce } from '@/utils'

defineOptions({ name: 'NotesView' })

interface Note {
  id: number
  title: string
  content: string
  createdAt: string // 改为字符串类型，方便JSON序列化
  updatedAt: string // 改为字符串类型，方便JSON序列化
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const notes = ref<Note[]>([])

// 从localStorage加载数据
const loadNotes = (): Note[] => {
  const savedNotes = localStorage.getItem('notes')
  if (savedNotes) {
    try {
      return JSON.parse(savedNotes)
    } catch (e) {
      console.error('解析笔记数据失败:', e)
      return []
    }
  }
  return [
    {
      id: 1,
      title: '欢迎使用笔记本',
      content: '这是一个简单的笔记应用，您可以在这里记录您的想法和灵感。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 2,
      title: '如何使用',
      content: '点击左侧的笔记标题可以查看笔记内容。点击"新建笔记"按钮可以创建新的笔记。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]
}

// 保存数据到localStorage
const saveNotes = () => {
  localStorage.setItem('notes', JSON.stringify(notes.value))
}

// 组件挂载时加载数据
onMounted(() => {
  notes.value = loadNotes()
})

// 监听notes变化，自动保存
const debouncedSaveNotes = debounce(() => saveNotes(), 500)
watch(notes, debouncedSaveNotes, { deep: true })

const selectedNoteId = ref<number | null>(notes.value.length > 0 ? notes.value[0].id : null)
const isEditing = ref(false)
const editingNote = ref<Note | null>(null)
const isNewNote = ref(false)

const selectedNote = computed(() => {
  if (selectedNoteId.value === null) return null
  return notes.value.find(note => note.id === selectedNoteId.value) || null
})

const selectNote = (id: number) => {
  selectedNoteId.value = id
  isEditing.value = false
  isNewNote.value = false
}

const createNewNote = () => {
  const newNote: Note = {
    id: Date.now(),
    title: '新笔记',
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  // 不立即添加到notes数组，而是等用户点击保存按钮时再添加
  isNewNote.value = true
  isEditing.value = true
  editingNote.value = newNote
  selectedNoteId.value = null // 清除选中的笔记，因为我们正在创建一个新笔记
}

const startEditing = () => {
  if (selectedNote.value) {
    editingNote.value = { ...selectedNote.value }
    isEditing.value = true
  }
}

const saveNote = () => {
  if (!editingNote.value) return
  
  editingNote.value.updatedAt = new Date().toISOString()
  
  if (isNewNote.value) {
    // 如果是新笔记，则添加到notes数组中
    notes.value.push({ ...editingNote.value })
    selectedNoteId.value = editingNote.value.id
    isNewNote.value = false
  } else {
    // 如果是编辑现有笔记，则更新notes数组中的对应笔记
    const index = notes.value.findIndex(note => note.id === editingNote.value?.id)
    if (index !== -1) {
      notes.value[index] = { ...editingNote.value }
    }
  }
  
  isEditing.value = false
  editingNote.value = null
}

const cancelEditing = () => {
  // 如果是取消新笔记的编辑，则恢复选中之前的笔记（如果有）
  if (isNewNote.value) {
    isNewNote.value = false
    selectedNoteId.value = notes.value.length > 0 ? notes.value[0].id : null
  }
  
  isEditing.value = false
  editingNote.value = null
}

const deleteNote = () => {
  if (!selectedNote.value) return
  
  if (confirm('确定要删除这个笔记吗？')) {
    notes.value = notes.value.filter(note => note.id !== selectedNote.value?.id)
    selectedNoteId.value = notes.value.length > 0 ? notes.value[0].id : null
    isEditing.value = false
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>笔记本</h1>
    </header>
    
    <main class="notes-content">
      <div class="notes-sidebar">
        <div class="sidebar-header">
          <h2>我的笔记</h2>
          <button class="new-note-btn" @click="createNewNote">新建笔记</button>
        </div>
        
        <div class="notes-list">
          <div 
            v-for="note in notes" 
            :key="note.id" 
            class="note-item"
            :class="{ 'active': selectedNoteId === note.id }"
            @click="selectNote(note.id)"
          >
            <div class="note-title">{{ note.title }}</div>
            <div class="note-date">{{ formatDate(note.updatedAt) }}</div>
          </div>
          
          <div v-if="notes.length === 0" class="empty-state">
            没有笔记，创建一个吧！
          </div>
        </div>
      </div>
      
      <div class="note-detail">
        <template v-if="selectedNote && !isEditing">
          <div class="detail-header">
            <h2>{{ selectedNote.title }}</h2>
            <div class="note-actions">
              <button class="edit-btn" @click="startEditing">编辑</button>
              <button class="delete-btn" @click="deleteNote">删除</button>
            </div>
          </div>
          
          <div class="detail-dates">
            <span>创建于: {{ formatDate(selectedNote.createdAt) }}</span>
            <span>更新于: {{ formatDate(selectedNote.updatedAt) }}</span>
          </div>
          
          <div class="note-content">
            {{ selectedNote.content }}
          </div>
        </template>
        
        <template v-else-if="isEditing && editingNote">
          <div class="edit-form">
            <div class="form-group">
              <label for="title">标题</label>
              <input 
                type="text" 
                id="title" 
                v-model="editingNote.title" 
                placeholder="输入标题"
              >
            </div>
            
            <div class="form-group">
              <label for="content">内容</label>
              <textarea 
                id="content" 
                v-model="editingNote.content" 
                placeholder="输入笔记内容"
                rows="12"
              ></textarea>
            </div>
            
            <div class="form-actions">
              <button class="save-btn" @click="saveNote">保存</button>
              <button class="cancel-btn" @click="cancelEditing">取消</button>
            </div>
          </div>
        </template>
        
        <div v-else class="empty-state">
          选择一个笔记或创建一个新笔记
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1200px;
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

.notes-content {
  display: flex;
  gap: 2rem;
  height: calc(100vh - 150px);
  min-height: 500px;
}

.notes-sidebar {
  flex: 0 0 300px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #2c3e50;
}

.new-note-btn {
  background-color: #2ecc71;
  color: white;
  border: none;
  padding: 0.5rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.new-note-btn:hover {
  background-color: #27ae60;
}

.notes-list {
  flex: 1;
  overflow-y: auto;
}

.note-item {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background-color 0.2s;
}

.note-item:hover {
  background-color: #f5f5f5;
}

.note-item.active {
  background-color: #e3f2fd;
  border-left: 4px solid #3498db;
}

.note-title {
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-date {
  font-size: 0.8rem;
  color: #95a5a6;
}

.note-detail {
  flex: 1;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.detail-header h2 {
  margin: 0;
  color: #2c3e50;
}

.note-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-btn {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.edit-btn:hover {
  background-color: #2980b9;
}

.delete-btn {
  background-color: #e74c3c;
  color: white;
  border: none;
  padding: 0.5rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.delete-btn:hover {
  background-color: #c0392b;
}

.detail-dates {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #95a5a6;
  margin-bottom: 2rem;
}

.note-content {
  line-height: 1.6;
  color: #34495e;
  white-space: pre-wrap;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: bold;
  color: #2c3e50;
}

.form-group input,
.form-group textarea {
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  font-family: inherit;
}

.form-group textarea {
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.save-btn {
  background-color: #2ecc71;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.save-btn:hover {
  background-color: #27ae60;
}

.cancel-btn {
  background-color: #95a5a6;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.cancel-btn:hover {
  background-color: #7f8c8d;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
}
</style>