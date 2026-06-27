import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { debounce, getStorage, setStorage } from './utils'

const STORAGE_KEY = 'notes'

const DEFAULT_NOTES = [
  {
    id: 1,
    title: '欢迎使用笔记本',
    content:
      '这是一个简单的笔记应用，您可以在这里记录您的想法和灵感。\n\n支持 **Markdown** 语法，可以轻松创建格式丰富的笔记！',
    isMarkdown: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'Markdown 示例',
    content:
      '# Markdown 功能演示\n\n## 基础语法\n\n- **粗体文本**\n- *斜体文本*\n- ~~删除线~~\n- `行内代码`\n\n## 代码块\n\n```javascript\nfunction hello() {\n  console.log("Hello, Markdown!")\n}\n```\n\n## 列表\n\n1. 第一项\n2. 第二项\n3. 第三项\n\n> 这是一段引用文本\n\n---\n\n[链接示例](https://vuejs.org)',
    isMarkdown: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export interface Note {
  id: number
  title: string
  content: string
  isMarkdown: boolean
  createdAt: string
  updatedAt: string
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const selectedNoteId = ref<number | null>(null)
  const isEditing = ref(false)
  const editingNote = ref<Note | null>(null)
  const isNewNote = ref(false)
  const showPreview = ref(false)

  const loadNotes = (): Note[] => {
    const loaded = getStorage<Note[]>(STORAGE_KEY, DEFAULT_NOTES) || DEFAULT_NOTES
    return loaded.map((note) => ({ ...note, isMarkdown: note.isMarkdown ?? false }))
  }
  const saveNotes = () => {
    setStorage(STORAGE_KEY, notes.value)
  }

  const init = () => {
    notes.value = loadNotes()
    if (notes.value.length > 0) selectedNoteId.value = notes.value[0].id
  }

  const selectedNote = computed(() =>
    selectedNoteId.value === null
      ? null
      : notes.value.find((note) => note.id === selectedNoteId.value) || null,
  )

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
      const idx = notes.value.findIndex((note) => note.id === editingNote.value?.id)
      if (idx !== -1) notes.value[idx] = { ...editingNote.value }
    }
    isEditing.value = false
    editingNote.value = null
    showPreview.value = false
  }

  const cancelEditing = () => {
    if (isNewNote.value) {
      isNewNote.value = false
      if (notes.value.length > 0) selectedNoteId.value = notes.value[0].id
    }
    isEditing.value = false
    editingNote.value = null
    showPreview.value = false
  }

  const deleteNote = (id: number) => {
    notes.value = notes.value.filter((note) => note.id !== id)
    if (selectedNoteId.value === id)
      selectedNoteId.value = notes.value.length > 0 ? notes.value[0].id : null
    isEditing.value = false
    isNewNote.value = false
    editingNote.value = null
  }

  const debouncedSave = debounce(() => saveNotes(), 500)
  watch(notes, debouncedSave, { deep: true })

  return {
    notes,
    selectedNoteId,
    isEditing,
    editingNote,
    isNewNote,
    showPreview,
    selectedNote,
    init,
    selectNote,
    createNewNote,
    startEditing,
    saveNote,
    cancelEditing,
    deleteNote,
  }
})
