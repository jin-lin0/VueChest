<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Note {
  id: string
  title: string
  body: string
  updatedAt: number
}

interface VueChestRuntime {
  storage?: {
    getStorage<T>(key: string, defaultValue?: T): T | null
    setStorage(key: string, value: unknown): void
  }
  cloud?: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<boolean>
    remove(key: string): Promise<boolean>
    list(): Promise<{ key: string; updatedAt: string }[]>
  }
  ai?: { chat(messages: { role: string; content: string }[]): Promise<{ content: string; model: string }> }
  notify?: (payload: { body?: string; level?: string }) => Promise<boolean>
  clipboard?: { write(text: string): Promise<boolean> }
  permissions?: string[]
}

const runtime = (window as unknown as { __VueChest__?: VueChestRuntime }).__VueChest__ || {}
const granted = Array.isArray(runtime.permissions) ? runtime.permissions : []
const hasCloud = granted.includes('cloud')
const hasAi = granted.includes('ai')
const hasNotify = granted.includes('notify')
const hasClipboard = granted.includes('clipboard')

const CLOUD_KEY = 'notes'
const LOCAL_KEY = 'ai-notes:notes'

const notes = ref<Note[]>([])
const activeId = ref('')
const draft = ref({ title: '', body: '' })
const loading = ref(true)
const busy = ref('')
const error = ref('')

const active = computed(() => notes.value.find((item) => item.id === activeId.value) || null)
const storageMode = computed(() => (hasCloud ? '云端同步' : '仅本机'))

function newId() {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function toast(body: string, level = 'info') {
  if (hasNotify && runtime.notify) void runtime.notify({ body, level }).catch(() => {})
}

function normalize(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Partial<Note>
      return {
        id: String(row.id || newId()),
        title: String(row.title || '未命名'),
        body: String(row.body || ''),
        updatedAt: Number(row.updatedAt) || Date.now(),
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

async function persist() {
  const payload = notes.value.map((item) => ({ ...item }))
  if (hasCloud && runtime.cloud) {
    await runtime.cloud.set(CLOUD_KEY, payload)
    return
  }
  runtime.storage?.setStorage(LOCAL_KEY, payload)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (hasCloud && runtime.cloud) {
      const remote = await runtime.cloud.get(CLOUD_KEY)
      notes.value = normalize(remote)
    } else {
      notes.value = normalize(runtime.storage?.getStorage<Note[]>(LOCAL_KEY, []))
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
    notes.value = normalize(runtime.storage?.getStorage<Note[]>(LOCAL_KEY, []))
  } finally {
    loading.value = false
    if (notes.value.length) selectNote(notes.value[0].id)
  }
}

function selectNote(id: string) {
  activeId.value = id
  const note = notes.value.find((item) => item.id === id)
  draft.value = note ? { title: note.title, body: note.body } : { title: '', body: '' }
}

function createNote() {
  const note: Note = { id: newId(), title: '未命名', body: '', updatedAt: Date.now() }
  notes.value = [note, ...notes.value]
  selectNote(note.id)
  void persist()
}

async function saveDraft() {
  if (!active.value) return
  const title = draft.value.title.trim() || '未命名'
  notes.value = notes.value
    .map((item) =>
      item.id === activeId.value
        ? { ...item, title, body: draft.value.body, updatedAt: Date.now() }
        : item,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  try {
    await persist()
    toast('已保存', 'success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
    toast(error.value, 'error')
  }
}

async function removeNote(id: string) {
  notes.value = notes.value.filter((item) => item.id !== id)
  if (activeId.value === id) {
    activeId.value = ''
    draft.value = { title: '', body: '' }
  }
  try {
    await persist()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function copyBody() {
  if (!draft.value.body) return
  if (!hasClipboard || !runtime.clipboard) {
    toast('未获得剪贴板权限', 'warning')
    return
  }
  try {
    await runtime.clipboard.write(draft.value.body)
    toast('正文已复制', 'success')
  } catch (e) {
    toast(e instanceof Error ? e.message : '复制失败', 'error')
  }
}

const AI_ACTIONS = [
  { key: 'summary', label: '摘要', instruction: '用不超过 3 条要点总结下面这段笔记，直接输出要点。' },
  { key: 'polish', label: '润色', instruction: '润色下面的笔记，保持原意、语言更通顺，直接输出润色后的正文。' },
  { key: 'title', label: '起标题', instruction: '为下面的笔记拟一个不超过 15 个字的标题，只输出标题本身。' },
] as const

async function runAi(action: (typeof AI_ACTIONS)[number]) {
  if (!hasAi || !runtime.ai) {
    toast('未获得 AI 能力权限', 'warning')
    return
  }
  if (!draft.value.body.trim()) {
    toast('正文为空', 'warning')
    return
  }
  busy.value = action.key
  error.value = ''
  try {
    const result = await runtime.ai.chat([
      { role: 'system', content: '你是简洁的中文写作助手。' },
      { role: 'user', content: `${action.instruction}\n\n---\n${draft.value.body}` },
    ])
    const content = String(result?.content || '').trim()
    if (!content) throw new Error('模型没有返回内容')
    if (action.key === 'title') draft.value.title = content.replace(/^["「]|["」]$/g, '')
    else draft.value.body = content
    await saveDraft()
    toast(`${action.label}完成`, 'success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'AI 请求失败'
    toast(error.value, 'error')
  } finally {
    busy.value = ''
  }
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

onMounted(load)
</script>

<template>
  <div class="notes">
    <aside class="sidebar">
      <div class="sidebar-head">
        <div>
          <h1>AI 速记</h1>
          <p class="mode" :data-cloud="hasCloud">{{ storageMode }}</p>
        </div>
        <button class="primary" @click="createNote">新建</button>
      </div>

      <p v-if="loading" class="hint">加载中…</p>
      <p v-else-if="!notes.length" class="hint">还没有笔记，点「新建」开始。</p>

      <ul v-else class="list">
        <li
          v-for="note in notes"
          :key="note.id"
          :class="{ active: note.id === activeId }"
          @click="selectNote(note.id)"
        >
          <span class="title">{{ note.title }}</span>
          <span class="time">{{ formatTime(note.updatedAt) }}</span>
          <button class="ghost" title="删除" @click.stop="removeNote(note.id)">×</button>
        </li>
      </ul>

      <p v-if="!hasCloud" class="hint foot">
        未获得云端权限，数据只保存在本机。
      </p>
    </aside>

    <section class="editor">
      <template v-if="active">
        <input v-model="draft.title" class="title-input" placeholder="标题" />

        <div class="toolbar">
          <button class="primary" @click="saveDraft">保存</button>
          <button :disabled="!hasClipboard" @click="copyBody">复制正文</button>
          <button
            v-for="action in AI_ACTIONS"
            :key="action.key"
            :disabled="!hasAi || !!busy"
            @click="runAi(action)"
          >
            {{ busy === action.key ? '处理中…' : `AI ${action.label}` }}
          </button>
        </div>

        <textarea v-model="draft.body" class="body-input" placeholder="随手记点什么…" />

        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="!hasAi" class="hint">未获得 AI 权限，AI 按钮已禁用。</p>
      </template>
      <p v-else class="hint center">选择或新建一条笔记</p>
    </section>
  </div>
</template>

<style scoped>
.notes {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  height: 100%;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #1f2328);
  font-size: 14px;
}
.sidebar {
  border-right: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  padding: 14px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sidebar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
h1 {
  font-size: 15px;
  font-weight: 500;
  margin: 0;
}
.mode {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}
.mode[data-cloud='true'] {
  color: var(--success, #16a34a);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.list li:hover {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}
.list li.active {
  background: var(--accent-bg, rgba(59, 130, 246, 0.12));
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  min-width: 0;
}
.title-input {
  font-size: 16px;
  font-weight: 500;
  padding: 8px 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: transparent;
  color: inherit;
}
.body-input {
  flex: 1;
  min-height: 200px;
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.7;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
button {
  padding: 5px 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.16));
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button.primary {
  background: var(--accent, #2563eb);
  border-color: transparent;
  color: #fff;
}
button.ghost {
  border: none;
  padding: 0 6px;
  color: var(--text-secondary, #6b7280);
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}
.hint.center {
  margin: auto;
}
.hint.foot {
  margin-top: auto;
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #dc2626);
}
</style>
