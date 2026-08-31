<script setup lang="ts">
import { onMounted } from 'vue'
import { useNotesStore } from './store'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/github-dark.css'

defineOptions({ name: 'NotesView' })

marked.setOptions({
  breaks: true,
  gfm: true,
})

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)

const renderer = new marked.Renderer()
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
}

marked.use({ renderer })

const renderMarkdown = (content: string): string => {
  const rawHtml = marked.parse(content) as string
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }) as string
}

const notesStore = useNotesStore()

onMounted(() => {
  notesStore.init()
})

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

const getNotePreview = (note: { content: string }): string => {
  const content = note.content
  if (!content) return '空笔记'
  const plainText = content.replace(/[#*\[\]`~_>-]/g, '').trim()
  return plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText
}

const deleteNote = () => {
  if (!notesStore.selectedNote) return
  if (confirm('确定要删除这个笔记吗？')) {
    notesStore.deleteNote(notesStore.selectedNote.id)
  }
}

const goBack = () => {
  history.back()
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h1>笔记本</h1>
    </header>

    <main class="notes-content">
      <div class="notes-sidebar">
        <div class="sidebar-header">
          <h2>我的笔记</h2>
          <button class="new-note-btn" @click="notesStore.createNewNote">新建笔记</button>
        </div>

        <div class="notes-list">
          <div
            v-for="note in notesStore.notes"
            :key="note.id"
            class="note-item"
            :class="{ active: notesStore.selectedNoteId === note.id }"
            @click="notesStore.selectNote(note.id)"
          >
            <div class="note-item-header">
              <span class="note-title">{{ note.title }}</span>
              <span v-if="note.isMarkdown" class="md-badge">MD</span>
            </div>
            <div class="note-preview">{{ getNotePreview(note) }}</div>
            <div class="note-date">{{ formatDate(note.updatedAt) }}</div>
          </div>

          <div v-if="notesStore.notes.length === 0" class="empty-state">没有笔记，创建一个吧！</div>
        </div>
      </div>

      <div class="note-detail">
        <template v-if="notesStore.selectedNote && !notesStore.isEditing">
          <div class="detail-header">
            <div class="detail-title-row">
              <h2>{{ notesStore.selectedNote.title }}</h2>
              <span v-if="notesStore.selectedNote.isMarkdown" class="md-badge-lg">Markdown</span>
            </div>
            <div class="note-actions">
              <button class="edit-btn" @click="notesStore.startEditing">编辑</button>
              <button class="delete-btn" @click="deleteNote">删除</button>
            </div>
          </div>

          <div class="detail-dates">
            <span>创建于: {{ formatDate(notesStore.selectedNote.createdAt) }}</span>
            <span>更新于: {{ formatDate(notesStore.selectedNote.updatedAt) }}</span>
          </div>

          <div
            v-if="notesStore.selectedNote.isMarkdown"
            class="note-content markdown-body"
            v-html="renderMarkdown(notesStore.selectedNote.content)"
          ></div>
          <div v-else class="note-content">{{ notesStore.selectedNote.content }}</div>
        </template>

        <template v-else-if="notesStore.isEditing && notesStore.editingNote">
          <div class="edit-form">
            <div class="form-group">
              <label for="title">标题</label>
              <input
                type="text"
                id="title"
                v-model="notesStore.editingNote.title"
                placeholder="输入标题"
              />
            </div>

            <div class="editor-toolbar">
              <button
                class="toolbar-btn"
                :class="{ active: notesStore.editingNote.isMarkdown }"
                @click="
                  notesStore.editingNote &&
                  (notesStore.editingNote.isMarkdown = !notesStore.editingNote.isMarkdown)
                "
                title="切换 Markdown 模式"
              >
                {{ notesStore.editingNote.isMarkdown ? '📝 Markdown' : '📄 纯文本' }}
              </button>
              <button
                v-if="notesStore.editingNote.isMarkdown"
                class="toolbar-btn preview-btn"
                :class="{ active: notesStore.showPreview }"
                @click="notesStore.showPreview = !notesStore.showPreview"
              >
                {{ notesStore.showPreview ? '✏️ 编辑' : '👁️ 预览' }}
              </button>
            </div>

            <div class="form-group editor-area">
              <div
                v-if="notesStore.showPreview && notesStore.editingNote.isMarkdown"
                class="markdown-preview"
              >
                <div
                  class="markdown-body"
                  v-html="renderMarkdown(notesStore.editingNote.content)"
                ></div>
              </div>
              <textarea
                v-else
                id="content"
                v-model="notesStore.editingNote.content"
                :placeholder="
                  notesStore.editingNote.isMarkdown ? '输入 Markdown 内容...' : '输入笔记内容...'
                "
                rows="16"
              ></textarea>
            </div>

            <div
              class="markdown-hint"
              v-if="notesStore.editingNote.isMarkdown && !notesStore.showPreview"
            >
              <span>提示：支持 **粗体**、*斜体*、`代码`、# 标题、- 列表、> 引用等语法</span>
            </div>

            <div class="form-actions">
              <button class="save-btn" @click="notesStore.saveNote">保存</button>
              <button class="cancel-btn" @click="notesStore.cancelEditing">取消</button>
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
  background-color: var(--info);
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
  color: var(--text-primary);
}

.notes-content {
  display: flex;
  gap: 2rem;
  height: calc(100vh - 150px);
  min-height: 500px;
}

.notes-sidebar {
  flex: 0 0 300px;
  background-color: var(--bg-card);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
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
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background-color 0.2s;
}

.note-item:hover {
  background-color: var(--bg-hover);
}

.note-item.active {
  background-color: var(--accent-bg);
  border-left: 4px solid var(--info);
}

.note-item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}

.note-title {
  font-weight: bold;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.md-badge {
  font-size: 0.6rem;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
}

.md-badge-lg {
  font-size: 0.75rem;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-weight: 600;
}

.note-preview {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.note-detail {
  flex: 1;
  background-color: var(--bg-card);
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
  color: var(--text-primary);
}

.note-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.edit-btn {
  background-color: var(--info);
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
  color: var(--text-muted);
  margin-bottom: 2rem;
}

.note-content {
  line-height: 1.8;
  color: var(--text-body);
  white-space: pre-wrap;
}

.markdown-body {
  white-space: normal;
  font-size: 15px;
}

.markdown-body :deep(h1) {
  font-size: 1.8em;
  border-bottom: 2px solid var(--border-light);
  padding-bottom: 0.3em;
  margin-top: 1em;
  margin-bottom: 0.6em;
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--border-light);
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
  border-left: 4px solid var(--accent);
  padding: 0.5em 1em;
  margin: 1em 0;
  background-color: var(--bg-subtle);
  color: var(--text-secondary);
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
  color: var(--info);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 2px solid var(--border-light);
  margin: 1.5em 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-light);
  padding: 0.5em 0.8em;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: var(--bg-hover);
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
  color: var(--text-primary);
}

.form-group input,
.form-group textarea {
  padding: 0.8rem;
  border: 1px solid var(--border-light);
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
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 1rem;
  background-color: var(--bg-card);
}

.editor-toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.toolbar-btn {
  background-color: var(--tag-bg);
  border: 1px solid var(--border-light);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background-color: var(--border-light);
}

.toolbar-btn.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
  border-color: transparent;
}

.preview-btn {
  background-color: var(--info);
  color: white;
  border-color: var(--info);
}

.preview-btn:hover {
  background-color: #2980b9;
}

.preview-btn.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
}

.markdown-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  padding: 0.5rem;
  background-color: var(--bg-subtle);
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
  background-color: var(--text-muted);
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.cancel-btn:hover {
  background-color: var(--text-dim);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-dim);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state p {
  font-style: italic;
}

.back-btn {
  background: var(--info);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}
.back-btn:hover {
  background: #2980b9;
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
