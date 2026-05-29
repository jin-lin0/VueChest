import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { debounce, getStorage, setStorage } from '@/utils'
import { STORAGE_KEYS, DEFAULT_NOTES } from '@/config'

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
    const loaded = getStorage<Note[]>(STORAGE_KEYS.NOTES, DEFAULT_NOTES) || DEFAULT_NOTES
    return loaded.map(note => ({
      ...note,
      isMarkdown: note.isMarkdown ?? false,
    }))
  }

  const saveNotes = () => {
    setStorage(STORAGE_KEYS.NOTES, notes.value)
  }

  const init = () => {
    notes.value = loadNotes()
    if (notes.value.length > 0) {
      selectedNoteId.value = notes.value[0].id
    }
  }

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
      if (notes.value.length > 0) {
        selectedNoteId.value = notes.value[0].id
      }
    }
    isEditing.value = false
    editingNote.value = null
    showPreview.value = false
  }

  const deleteNote = (id: number) => {
    notes.value = notes.value.filter((note) => note.id !== id)
    if (selectedNoteId.value === id) {
      selectedNoteId.value = notes.value.length > 0 ? notes.value[0].id : null
    }
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
