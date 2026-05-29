<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { debounce, getStorage, setStorage } from '@/utils'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

defineOptions({ name: 'NotesView' })

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

const renderMarkdown = (content: string): string => {
  return marked.parse(content) as string
}

interface Note {
  id: number
  title: string
  content: string
  isMarkdown: boolean
  createdAt: string
  updatedAt: string
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const notes = ref<Note[]>([])

const defaultNotes: Note[] = [
  {
    id: 1,
    title: '欢迎使用笔记本',
    content: '这是一个简单的笔记应用，您可以在这里记录您的想法和灵感。\n\n支持 **Markdown** 语法，可以轻松创建格式丰富的笔记！',
    isMarkdown: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'Markdown 示例',
    content: '# Markdown 功能演示\n\n## 基础语法\n\n- **粗体文本**\n- *斜体文本*\n- ~~删除线~~\n- `行内代码`\n\n## 代码块\n\n```javascript\nfunction hello() {\n  console.log("Hello, Markdown!")\n}\n```\n\n## 列表\n\n1. 第一项\n2. 第二项\n3. 第三项\n\n> 这是一段引用文本\n\n---\n\n[链接示例](https://vuejs.org)',
    isMarkdown: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

const loadNotes = (): Note[] => {
  const loaded = getStorage<Note[]>('notes', defaultNotes) || defaultNotes
  return loaded.map(note => ({
    ...note,
    isMarkdown: note.isMarkdown ?? false,
  }))
}

const saveNotes = () => {
  setStorage('notes', notes.value)
}

onMounted(() => {
  notes.value = loadNotes()
})

const debouncedSaveNotes = debounce(() => saveNotes(), 500)
watch(notes, debouncedSaveNotes, { deep: true })

const selectedNoteId = ref<number | null>(notes.value.length > 0 ? notes.value[0].id : null)
const isEditing = ref(false)
const editingNote = ref<Note | null>(null)
const isNewNote = ref(false)
const showPreview = ref(false)

const selectedNote = computed(() => {
  if (selectedNoteId.value === null) return null
  return notes.value.find((note) => note.id === selectedNoteId.value) || null
})

const selectNote = (id: number) => {
  selectedNoteId.value = id
  isEditing.value = false
  isNewNote.value = false
  showPreview.value = false
}

const createNewNote = () => {
  const newNote: Note = {
    id: Date.now(),
    title: '新笔记',
    content: '',
    isMarkdown: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  isNewNote.value = true
  isEditing.value = true
  editingNote.value = newNote
  selectedNoteId.value = null
  showPreview.value = false
}

const startEditing = () => {
  if (selectedNote.value) {
    editingNote.value = { ...selectedNote.value }
    isEditing.value = true
    showPreview.value = false
  }
}

const saveNote = () => {
  if (!editingNote.value) return

  editingNote.value.updatedAt = new Date().toISOString()

  if (isNewNote.value) {
    notes.value.push({ ...editingNote.value })
    selectedNoteId.value = editingNote.value.id
    isNewNote.value = false
  } else {
    const index = notes.value.findIndex((note) => note.id === editingNote.value?.id)
    if (index !== -1) {
      notes.value[index] = { ...editingNote.value }
    }
  }

  isEditing.value = false
  editingNote.value = null
  showPreview.value = false
}

const cancelEditing = () => {
  if (isNewNote.value) {
    isNewNote.value = false
    selectedNoteId.value = notes.value.length > 0 ? notes.value[0].id : null
  }

  isEditing.value = false
  editingNote.value = null
  showPreview.value = false
}

const deleteNote = () => {
  if (!selectedNote.value) return

  if (confirm('确定要删除这个笔记吗？')) {
    notes.value = notes.value.filter((note) => note.id !== selectedNote.value?.id)
    selectedNoteId.value = notes.value.length > 0 ? notes.value[0].id : null
    isEditing.value = false
    showPreview.value = false
  }
}

const toggleMarkdown = () => {
  if (editingNote.value) {
    editingNote.value.isMarkdown = !editingNote.value.isMarkdown
  }
}

const togglePreview = () => {
  showPreview.value = !showPreview.value
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const getNotePreview = (note: Note): string => {
  const content = note.content
  if (!content) return '空笔记'
  const plainText = content.replace(/[#*\[\]`~_>-]/g, '').trim()
  return plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText
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
            :class="{ active: selectedNoteId === note.id }"
            @click="selectNote(note.id)"
          >
            <div class="note-item-header">
              <span class="note-title">{{ note.title }}</span>
              <span v-if="note.isMarkdown" class="md-badge">MD</span>
            </div>
            <div class="note-preview">{{ getNotePreview(note) }}</div>
            <div class="note-date">{{ formatDate(note.updatedAt) }}</div>
          </div>

          <div v-if="notes.length === 0" class="empty-state">没有笔记，创建一个吧！</div>
        </div>
      </div>

      <div class="note-detail">
        <template v-if="selectedNote && !isEditing">
          <div class="detail-header">
            <div class="detail-title-row">
              <h2>{{ selectedNote.title }}</h2>
              <span v-if="selectedNote.isMarkdown" class="md-badge-lg">Markdown</span>
            </div>
            <div class="note-actions">
              <button class="edit-btn" @click="startEditing">编辑</button>
              <button class="delete-btn" @click="deleteNote">删除</button>
            </div>
          </div>

          <div class="detail-dates">
            <span>创建于: {{ formatDate(selectedNote.createdAt) }}</span>
            <span>更新于: {{ formatDate(selectedNote.updatedAt) }}</span>
          </div>

          <div v-if="selectedNote.isMarkdown" class="note-content markdown-body" v-html="renderMarkdown(selectedNote.content)"></div>
          <div v-else class="note-content">{{ selectedNote.content }}</div>
        </template>

        <template v-else-if="isEditing && editingNote">
          <div class="edit-form">
            <div class="form-group">
              <label for="title">标题</label>
              <input type="text" id="title" v-model="editingNote.title" placeholder="输入标题" />
            </div>

            <div class="editor-toolbar">
              <button
                class="toolbar-btn"
                :class="{ active: editingNote.isMarkdown }"
                @click="toggleMarkdown"
                title="切换 Markdown 模式"
              >
                {{ editingNote.isMarkdown ? '📝 Markdown' : '📄 纯文本' }}
              </button>
              <button
                v-if="editingNote.isMarkdown"
                class="toolbar-btn preview-btn"
                :class="{ active: showPreview }"
                @click="togglePreview"
              >
                {{ showPreview ? '✏️ 编辑' : '👁️ 预览' }}
              </button>
            </div>

            <div class="form-group editor-area">
              <div v-if="showPreview && editingNote.isMarkdown" class="markdown-preview">
                <div class="markdown-body" v-html="renderMarkdown(editingNote.content)"></div>
              </div>
              <textarea
                v-else
                id="content"
                v-model="editingNote.content"
                :placeholder="editingNote.isMarkdown ? '输入 Markdown 内容...' : '输入笔记内容...'"
                rows="16"
              ></textarea>
            </div>

            <div class="markdown-hint" v-if="editingNote.isMarkdown && !showPreview">
              <span>提示：支持 **粗体**、*斜体*、`代码`、# 标题、- 列表、> 引用等语法</span>
            </div>

            <div class="form-actions">
              <button class="save-btn" @click="saveNote">保存</button>
              <button class="cancel-btn" @click="cancelEditing">取消</button>
            </div>
          </div>
        </template>

        <div v-else class="empty-state">
          <div class="empty-icon">📝</div>
          <p>选择一个笔记或创建一个新笔记</p>
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

.note-item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}

.note-title {
  font-weight: bold;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.md-badge {
  font-size: 0.6rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
}

.md-badge-lg {
  font-size: 0.75rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-weight: 600;
}

.note-preview {
  font-size: 0.8rem;
  color: #7f8c8d;
  margin-bottom: 0.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-date {
  font-size: 0.75rem;
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
  align-items: flex-start;
  margin-bottom: 1rem;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
}

.detail-title-row h2 {
  margin: 0;
  color: #2c3e50;
}

.note-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
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
  line-height: 1.8;
  color: #34495e;
  white-space: pre-wrap;
}

.markdown-body {
  white-space: normal;
  font-size: 15px;
}

.markdown-body :deep(h1) {
  font-size: 1.8em;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.3em;
  margin-top: 1em;
  margin-bottom: 0.6em;
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.2em;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
  margin-top: 1em;
  margin-bottom: 0.4em;
}

.markdown-body :deep(p) {
  margin-bottom: 1em;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 2em;
  margin-bottom: 1em;
}

.markdown-body :deep(li) {
  margin-bottom: 0.3em;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid #667eea;
  padding: 0.5em 1em;
  margin: 1em 0;
  background-color: #f8f9fa;
  color: #555;
}

.markdown-body :deep(code) {
  background-color: #f4f4f4;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: 'Monaco', 'Menlo', monospace;
}

.markdown-body :deep(pre) {
  background-color: #1e1e1e;
  border-radius: 8px;
  padding: 1em;
  overflow-x: auto;
  margin: 1em 0;
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: #d4d4d4;
}

.markdown-body :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 2px solid #eee;
  margin: 1.5em 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #ddd;
  padding: 0.5em 0.8em;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: #f5f5f5;
  font-weight: 600;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
  min-height: 400px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.95rem;
  line-height: 1.6;
}

.editor-area {
  flex: 1;
}

.editor-area textarea {
  height: 100%;
  min-height: 400px;
}

.markdown-preview {
  min-height: 400px;
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem;
  background-color: #fff;
}

.editor-toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.toolbar-btn {
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background-color: #e0e0e0;
}

.toolbar-btn.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border-color: transparent;
}

.preview-btn {
  background-color: #3498db;
  color: white;
  border-color: #3498db;
}

.preview-btn:hover {
  background-color: #2980b9;
}

.preview-btn.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.markdown-hint {
  font-size: 0.8rem;
  color: #95a5a6;
  padding: 0.5rem;
  background-color: #f8f9fa;
  border-radius: 4px;
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
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state p {
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

  .notes-content {
    flex-direction: column;
    height: auto;
    min-height: auto;
    gap: 1rem;
  }

  .notes-sidebar {
    flex: none;
    max-height: 240px;
  }

  .sidebar-header {
    padding: 0.8rem;
  }

  .sidebar-header h2 {
    font-size: 1rem;
  }

  .new-note-btn {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }

  .note-item {
    padding: 0.8rem;
  }

  .note-detail {
    padding: 1.2rem;
  }

  .detail-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.8rem;
  }

  .detail-dates {
    flex-direction: column;
    gap: 0.3rem;
  }

  .editor-toolbar {
    flex-wrap: wrap;
  }

  .toolbar-btn {
    flex: 1;
    min-width: 100px;
  }

  .form-group textarea {
    min-height: 300px;
  }

  .markdown-preview {
    min-height: 300px;
  }

  .form-actions {
    flex-direction: column;
  }

  .form-actions button {
    width: 100%;
  }
}
</style>
