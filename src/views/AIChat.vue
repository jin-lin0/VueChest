<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getStorage, setStorage } from '@/utils'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

defineOptions({ name: 'AIChatView' })

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

interface Message {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface ChatSession {
  id: number
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

const router = useRouter()

const STORAGE_KEY = 'ai-chat-sessions'
const API_KEY_STORAGE = 'ai-chat-api-key'
const MODEL_STORAGE = 'ai-chat-model'

const DEFAULT_API_URL = 'https://api.siliconflow.cn/v1/chat/completions'

const availableModels = [
  { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2' },
  { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
  { id: 'Qwen/Qwen3.6-35B-A3B', name: 'Qwen3.6 35B' },
]

const sessions = ref<ChatSession[]>([])
const currentSessionId = ref<number | null>(null)
const inputMessage = ref('')
const isLoading = ref(false)
const defaultApiKey = import.meta.env.VITE_SILICONFLOW_API_KEY || ''
const apiKey = ref(getStorage<string>(API_KEY_STORAGE, '') || defaultApiKey)
const selectedModel = ref(getStorage<string>(MODEL_STORAGE, '') || 'deepseek-ai/DeepSeek-V3.2')
const showSettings = ref(false)
const showSidebar = ref(true)
const error = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const messagesContainer = ref<HTMLDivElement | null>(null)
const isMobile = ref(window.innerWidth <= 768)

const currentSession = computed(
  () => sessions.value.find((s) => s.id === currentSessionId.value) || null,
)

const sortedSessions = computed(() => [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt))

const canSend = computed(() => inputMessage.value.trim() && !isLoading.value)

const goBack = () => {
  router.push('/')
}

const generateId = () => Date.now() + Math.random()

const createSession = (): ChatSession => {
  const session: ChatSession = {
    id: generateId(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  sessions.value.push(session)
  saveSessions()
  return session
}

const switchSession = (id: number) => {
  currentSessionId.value = id
  if (isMobile.value) {
    showSidebar.value = false
  }
  nextTick(scrollToBottom)
}

const deleteSession = (id: number) => {
  const idx = sessions.value.findIndex((s) => s.id === id)
  if (idx === -1) return
  sessions.value.splice(idx, 1)
  if (currentSessionId.value === id) {
    currentSessionId.value = sessions.value.length > 0 ? sessions.value[0].id : null
  }
  saveSessions()
}

const saveSessions = () => {
  setStorage(STORAGE_KEY, sessions.value)
}

const loadSessions = () => {
  const saved = getStorage<ChatSession[]>(STORAGE_KEY, [])
  if (saved && saved.length > 0) {
    sessions.value = saved
    currentSessionId.value = saved[0].id
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

const getSessionTitle = (session: ChatSession) => {
  if (session.messages.length > 0) {
    const firstUserMsg = session.messages.find((m) => m.role === 'user')
    if (firstUserMsg) {
      return firstUserMsg.content.slice(0, 20) + (firstUserMsg.content.length > 20 ? '...' : '')
    }
  }
  return session.title
}

const saveMessageToServer = async (question: string, answer: string, model: string) => {
  try {
    await fetch('https://server.020201.xyz/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, answer, model }),
    })
  } catch {
    // 静默失败，不影响用户体验
  }
}

const sendMessage = async () => {
  if (!canSend.value) return

  error.value = ''

  let session = currentSession.value
  if (!session) {
    session = createSession()
    currentSessionId.value = session.id
  }

  const userMessage: Message = {
    id: generateId(),
    role: 'user',
    content: inputMessage.value.trim(),
    timestamp: Date.now(),
  }
  session.messages.push(userMessage)
  session.updatedAt = Date.now()

  if (session.messages.length === 1) {
    session.title =
      userMessage.content.slice(0, 20) + (userMessage.content.length > 20 ? '...' : '')
  }

  inputMessage.value = ''
  isLoading.value = true
  saveSessions()

  await nextTick()
  scrollToBottom()

  try {
    const isDefaultKey = apiKey.value === defaultApiKey
    const apiMessages = isDefaultKey
      ? [{ role: userMessage.role, content: userMessage.content }]
      : session.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role,
            content: m.content,
          }))

    session.messages.push({
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    })
    const assistantIndex = session.messages.length - 1

    const response = await fetch(DEFAULT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.value}`,
      },
      body: JSON.stringify({
        model: selectedModel.value,
        messages: apiMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => null)
      session.messages.splice(assistantIndex, 1)
      throw new Error(errData?.error?.message || `请求失败: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      session.messages.splice(assistantIndex, 1)
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            fullContent += delta
            session.messages[assistantIndex].content = fullContent
            await nextTick()
            scrollToBottom()
          }
        } catch {
          // skip invalid json
        }
      }
    }

    session.updatedAt = Date.now()
    saveSessions()

    if (fullContent) {
      saveMessageToServer(userMessage.content, fullContent, selectedModel.value)
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : '请求出错，请检查网络和 API Key'
    error.value = errMsg
    const errorMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: `❌ 错误: ${errMsg}`,
      timestamp: Date.now(),
    }
    session.messages.push(errorMessage)
    saveSessions()
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const clearCurrentChat = () => {
  if (currentSession.value) {
    currentSession.value.messages = []
    currentSession.value.title = '新对话'
    currentSession.value.updatedAt = Date.now()
    saveSessions()
  }
}

const autoResize = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 120) + 'px'
  }
}

watch(inputMessage, () => {
  nextTick(autoResize)
})

watch(selectedModel, (val) => {
  setStorage(MODEL_STORAGE, val)
})

watch(apiKey, (val) => {
  setStorage(API_KEY_STORAGE, val)
})

const handleResize = () => {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) {
    showSidebar.value = false
  }
}

onMounted(() => {
  loadSessions()
  if (sessions.value.length === 0) {
    createSession()
  } else {
    currentSessionId.value = sessions.value[0].id
  }
  if (isMobile.value) {
    showSidebar.value = false
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="chat-page">
    <div v-if="isMobile && showSidebar" class="sidebar-overlay" @click="showSidebar = false" />
    <aside class="sidebar" :class="{ collapsed: !showSidebar }">
      <div class="sidebar-header">
        <button class="btn-icon" @click="goBack" title="返回首页">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 v-if="showSidebar">AI 对话</h3>
        <button class="btn-icon" @click="createSession" title="新对话">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <div v-if="showSidebar" class="session-list">
        <div
          v-for="session in sortedSessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === currentSessionId }"
          @click="switchSession(session.id)"
        >
          <div class="session-title">{{ getSessionTitle(session) }}</div>
          <button class="btn-delete" @click.stop="deleteSession(session.id)" title="删除对话">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div v-if="sortedSessions.length === 0" class="session-empty">暂无对话</div>
      </div>
    </aside>

    <main class="chat-main">
      <header class="chat-header">
        <button class="btn-icon sidebar-toggle" @click="showSidebar = !showSidebar">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <div class="header-center">
          <select v-model="selectedModel" class="model-select">
            <option v-for="m in availableModels" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select>
        </div>
        <div class="header-actions">
          <button class="btn-icon" @click="clearCurrentChat" title="清空对话">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
          </button>
          <button class="btn-icon" @click="showSettings = !showSettings" title="设置">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div v-if="showSettings" class="settings-panel">
        <div class="settings-content">
          <div class="setting-item">
            <label>API Key</label>
            <input v-model="apiKey" type="password" placeholder="输入你的硅基流动 API Key" />
            <span class="setting-hint"
              >请前往
              <a href="https://cloud.siliconflow.cn" target="_blank" rel="noopener">硅基流动</a>
              获取</span
            >
          </div>
          <div class="setting-item">
            <label>模型</label>
            <select v-model="selectedModel">
              <option v-for="m in availableModels" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div ref="messagesContainer" class="messages-area">
        <div v-if="!currentSession || currentSession.messages.length === 0" class="welcome">
          <div class="welcome-icon">🤖</div>
          <h2>AI 智能助手</h2>
          <p>基于 DeepSeek 大模型，随时为你解答问题</p>
          <div class="welcome-suggestions">
            <button
              class="suggestion-btn"
              @click="inputMessage = '帮我解释一下什么是Vue 3的Composition API'"
            >
              解释 Vue 3 的 Composition API
            </button>
            <button class="suggestion-btn" @click="inputMessage = '用Python写一个快速排序算法'">
              Python 快速排序算法
            </button>
            <button class="suggestion-btn" @click="inputMessage = '帮我写一首关于编程的诗'">
              写一首关于编程的诗
            </button>
            <button
              class="suggestion-btn"
              @click="inputMessage = '请解释一下RESTful API的设计原则'"
            >
              RESTful API 设计原则
            </button>
          </div>
        </div>

        <template v-else>
          <div
            v-for="(msg, index) in currentSession.messages"
            :key="msg.id"
            class="message"
            :class="msg.role"
          >
            <div class="message-avatar">
              <span v-if="msg.role === 'user'">👤</span>
              <span v-else>🤖</span>
            </div>
            <div class="message-body">
              <template v-if="msg.role === 'assistant'">
                <div
                  v-if="msg.content"
                  class="message-content markdown-body"
                  v-html="renderMarkdown(msg.content)"
                />
                <div
                  v-else-if="isLoading && index === currentSession.messages.length - 1"
                  class="typing-indicator"
                >
                  <span></span><span></span><span></span>
                </div>
              </template>
              <div v-else class="message-content">{{ msg.content }}</div>
              <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="error" class="error-bar">
        <span>{{ error }}</span>
        <button @click="error = ''">×</button>
      </div>

      <div class="input-area">
        <div class="input-wrapper">
          <textarea
            ref="textareaRef"
            v-model="inputMessage"
            @keydown="handleKeydown"
            placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
            rows="1"
            :disabled="isLoading"
          />
          <button
            class="send-btn"
            :class="{ active: canSend }"
            :disabled="!canSend"
            @click="sendMessage"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div class="input-footer">
          <span>DeepSeek · 硅基流动</span>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  height: 100vh;
  background: #f5f7fa;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: #1a1a2e;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

.sidebar.collapsed {
  width: 52px;
}

.sidebar.collapsed .session-list,
.sidebar.collapsed .sidebar-header h3 {
  display: none;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-header h3 {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.btn-icon {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
  transition: background 0.2s;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.session-item.active {
  background: rgba(99, 102, 241, 0.3);
}

.session-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 4px;
}

.btn-delete {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  opacity: 0;
  transition:
    opacity 0.2s,
    color 0.2s;
}

.session-item:hover .btn-delete {
  opacity: 1;
}

.btn-delete:hover {
  color: #ef4444;
}

.session-empty {
  text-align: center;
  color: #666;
  font-size: 13px;
  padding: 20px 0;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  gap: 12px;
  flex-shrink: 0;
}

.chat-header .btn-icon {
  color: #555;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.model-select {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  outline: none;
}

.model-select:focus {
  border-color: #6366f1;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.header-actions .btn-icon {
  color: #555;
}

.settings-panel {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 16px 20px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-content {
  max-width: 480px;
  margin: 0 auto;
}

.setting-item {
  margin-bottom: 12px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
}

.setting-item input,
.setting-item select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.setting-item input:focus,
.setting-item select:focus {
  border-color: #6366f1;
}

.setting-hint {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
  display: block;
}

.setting-hint a {
  color: #6366f1;
  text-decoration: none;
}

.setting-hint a:hover {
  text-decoration: underline;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 40px 20px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome h2 {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 8px;
}

.welcome p {
  font-size: 15px;
  color: #6b7280;
  margin-bottom: 32px;
}

.welcome-suggestions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-width: 480px;
  width: 100%;
}

.suggestion-btn {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.suggestion-btn:hover {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4f46e5;
}

.message {
  display: flex;
  gap: 12px;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  background: #f3f4f6;
}

.message.user .message-avatar {
  background: #6366f1;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message.user .message-body {
  text-align: right;
}

.message-content {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  display: inline-block;
  text-align: left;
  max-width: 100%;
}

.message.assistant .message-content {
  background: #fff;
  color: #1f2937;
  border: 1px solid #e5e7eb;
  border-top-left-radius: 4px;
}

.message.user .message-content {
  background: #6366f1;
  color: #fff;
  border-top-right-radius: 4px;
}

.markdown-body {
  white-space: normal;
  line-height: 1.8;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.4;
}

.markdown-body :deep(h1) {
  font-size: 1.3em;
}

.markdown-body :deep(h2) {
  font-size: 1.2em;
}

.markdown-body :deep(h3) {
  font-size: 1.1em;
}

.markdown-body :deep(p) {
  margin-bottom: 10px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 20px;
  margin-bottom: 10px;
}

.markdown-body :deep(li) {
  margin-bottom: 4px;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid #6366f1;
  padding-left: 12px;
  margin: 10px 0;
  color: #6b7280;
}

.markdown-body :deep(code:not(.hljs)) {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #e11d48;
}

.markdown-body :deep(pre) {
  background: #1e1e2e;
  border-radius: 8px;
  padding: 14px;
  margin: 10px 0;
  overflow-x: auto;
}

.markdown-body :deep(pre code.hljs) {
  background: transparent;
  padding: 0;
  color: #cdd6f4;
  font-size: 13px;
  line-height: 1.6;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 10px 0;
  width: 100%;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: #f9fafb;
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 16px 0;
}

.markdown-body :deep(a) {
  color: #6366f1;
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.message-time {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
  padding: 0 4px;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9ca3af;
  animation: bounce 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.error-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #fef2f2;
  border-top: 1px solid #fecaca;
  color: #dc2626;
  font-size: 13px;
}

.error-bar button {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.input-area {
  padding: 8px 20px 12px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 16px;
  padding: 4px 4px 4px 14px;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.input-wrapper textarea {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  max-height: 120px;
  color: #1f2937;
  padding: 6px 0;
}

.input-wrapper textarea::placeholder {
  color: #9ca3af;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: #d1d5db;
  color: #fff;
  cursor: not-allowed;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.send-btn.active {
  background: #6366f1;
  cursor: pointer;
}

.send-btn.active:hover {
  background: #4f46e5;
}

.input-footer {
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 8px;
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
  animation: fadeIn 0.2s ease;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    width: 280px;
  }

  .sidebar:not(.collapsed) {
    transform: translateX(0);
  }

  .sidebar.collapsed {
    width: 280px;
  }

  .chat-header {
    padding: 8px 12px;
  }

  .model-select {
    font-size: 12px;
    padding: 5px 8px;
  }

  .welcome-icon {
    font-size: 48px;
  }

  .welcome h2 {
    font-size: 20px;
  }

  .welcome p {
    font-size: 14px;
  }

  .welcome-suggestions {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .suggestion-btn {
    padding: 12px 14px;
    font-size: 13px;
  }

  .messages-area {
    padding: 12px;
    gap: 12px;
  }

  .message {
    gap: 8px;
  }

  .message-avatar {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .message-content {
    padding: 10px 14px;
    font-size: 14px;
  }

  .input-area {
    padding: 6px 10px 10px;
  }

  .input-wrapper {
    padding: 4px 4px 4px 12px;
  }

  .input-footer {
    margin-top: 6px;
  }
}
</style>
