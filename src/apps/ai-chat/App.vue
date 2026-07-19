<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getStorage, setStorage } from '@/lib/storage'
import { api } from '@/lib/request'
import { copyToClipboard } from '@/utils'
import { MarkdownView } from '@/components'
import {
  AI_CHAT_SESSIONS_KEY,
  AI_CHAT_API_KEY_STORAGE,
  AI_CHAT_MODEL_STORAGE,
  AI_CHAT_CONFIG,
  AVAILABLE_MODELS,
} from './config'
import { suggestionPool } from './suggestions'
import { useChatStream } from './composables/useChatStream'

defineOptions({ name: 'AIChatView' })

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

const sessions = ref<ChatSession[]>([])
const currentSessionId = ref<number | null>(null)
const inputMessage = ref('')
const isLoading = ref(false)
const defaultApiKey = import.meta.env.VITE_SILICONFLOW_API_KEY || ''
const apiKey = ref(getStorage<string>(AI_CHAT_API_KEY_STORAGE, '') || defaultApiKey)
const selectedModel = ref(getStorage<string>(AI_CHAT_MODEL_STORAGE, '') || AI_CHAT_CONFIG.defaultModel)
const showSettings = ref(false)
const showSidebar = ref(true)
const error = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const messagesContainer = ref<HTMLDivElement | null>(null)
const isMobile = ref(window.innerWidth <= 768)
const isUserScrolled = ref(false)
const showScrollToBottom = ref(false)

const getRandomSuggestions = (count: number = 4) => {
  const shuffled = [...suggestionPool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

const randomSuggestions = ref(getRandomSuggestions())

const refreshSuggestions = () => {
  randomSuggestions.value = getRandomSuggestions()
}

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
  setStorage(AI_CHAT_SESSIONS_KEY, sessions.value)
}

const loadSessions = () => {
  const saved = getStorage<ChatSession[]>(AI_CHAT_SESSIONS_KEY, [])
  if (saved && saved.length > 0) {
    sessions.value = saved
    currentSessionId.value = saved[0].id
  }
}

const isAtBottom = () => {
  if (!messagesContainer.value) return true
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  return scrollHeight - scrollTop - clientHeight < 50
}

const scrollToBottom = () => {
  if (!isUserScrolled.value && messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const scrollToBottomForce = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    isUserScrolled.value = false
    showScrollToBottom.value = false
  }
}

const handleScroll = () => {
  if (!messagesContainer.value) return
  const atBottom = isAtBottom()
  isUserScrolled.value = !atBottom
  showScrollToBottom.value = !atBottom && isLoading.value
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
    await api.post('/api/messages', { question, answer, model }, { auth: false })
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

    const { streamChat } = useChatStream()
    let fullContent = ''
    let scrollFrame: number | null = null

    try {
      for await (const delta of streamChat({
        apiKey: apiKey.value,
        model: selectedModel.value,
        messages: apiMessages,
      })) {
        fullContent += delta
        session.messages[assistantIndex].content = fullContent
        if (scrollFrame === null) {
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null
            scrollToBottom()
          })
        }
      }
    } catch (err) {
      // SSE 启动失败（HTTP 非 2xx / 无法读取流 / 网络异常），移除空占位消息后向上抛出
      session.messages.splice(assistantIndex, 1)
      throw err
    } finally {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
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
  setStorage(AI_CHAT_MODEL_STORAGE, val)
})

watch(apiKey, (val) => {
  setStorage(AI_CHAT_API_KEY_STORAGE, val)
})

const handleResize = () => {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) {
    showSidebar.value = false
  }
}

const copiedMessageId = ref<number | null>(null)

const copyMessage = (content: string, messageId: number) =>
  copyToClipboard(content, () => {
    copiedMessageId.value = messageId
    setTimeout(() => {
      copiedMessageId.value = null
    }, 2000)
  })

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
            <option v-for="m in AVAILABLE_MODELS" :key="m.id" :value="m.id">
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
              <option v-for="m in AVAILABLE_MODELS" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div ref="messagesContainer" class="messages-area" @scroll="handleScroll">
        <div v-if="!currentSession || currentSession.messages.length === 0" class="welcome">
          <div class="welcome-icon">🤖</div>
          <h2>AI 智能助手</h2>
          <p>基于 DeepSeek 大模型，随时为你解答问题</p>
          <div class="welcome-suggestions">
            <button
              v-for="(suggestion, index) in randomSuggestions"
              :key="index"
              class="suggestion-btn"
              @click="inputMessage = suggestion.message"
            >
              {{ suggestion.text }}
            </button>
          </div>
          <button class="refresh-btn" @click="refreshSuggestions" title="换一批">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>换一批</span>
          </button>
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
                <div v-if="msg.content" class="message-content">
                  <MarkdownView :content="msg.content" />
                </div>
                <div
                  v-else-if="isLoading && index === currentSession.messages.length - 1"
                  class="typing-indicator"
                >
                  <span></span><span></span><span></span>
                </div>
              </template>
              <div v-else class="message-content">{{ msg.content }}</div>
              <div class="message-meta">
                <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                <button
                  v-if="msg.role === 'assistant' && msg.content"
                  class="copy-btn"
                  :class="{ copied: copiedMessageId === msg.id }"
                  @click="copyMessage(msg.content, msg.id)"
                  :title="copiedMessageId === msg.id ? '已复制' : '复制'"
                >
                  <svg
                    v-if="copiedMessageId !== msg.id"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <svg
                    v-else
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <Transition name="fade">
        <button
          v-if="showScrollToBottom"
          class="scroll-to-bottom-btn"
          @click="scrollToBottomForce"
          title="滚动到底部"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </Transition>

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
  background: var(--bg-page);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  gap: 12px;
  flex-shrink: 0;
}

.chat-header .btn-icon {
  color: var(--text-secondary);
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.model-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-subtle);
  color: var(--text-primary);
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
  color: var(--text-secondary);
}

.settings-panel {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
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
  color: var(--text-primary);
  margin-bottom: 4px;
}

.setting-item input,
.setting-item select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--bg-input);
  color: var(--text-body);
  transition: border-color 0.2s;
}

.setting-item input:focus,
.setting-item select:focus {
  border-color: #6366f1;
}

.setting-hint {
  font-size: 12px;
  color: var(--text-muted);
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
  color: var(--text-primary);
  margin-bottom: 8px;
}

.welcome p {
  font-size: 15px;
  color: var(--text-secondary);
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
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.suggestion-btn:hover {
  border-color: #6366f1;
  background: var(--accent-bg);
  color: #4f46e5;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: var(--accent-bg);
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
  background: var(--bg-subtle);
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
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
  border-top-left-radius: 4px;
}

.message.user .message-content {
  background: #6366f1;
  color: #fff;
  border-top-right-radius: 4px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 0 4px;
}

.message-time {
  font-size: 11px;
  color: var(--text-muted);
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-btn:hover {
  color: #6366f1;
}

.copy-btn.copied {
  color: var(--success);
}

.copy-btn svg {
  flex-shrink: 0;
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
  background: var(--danger-bg);
  border-top: 1px solid var(--border);
  color: var(--danger);
  font-size: 13px;
}

.error-bar button {
  background: none;
  border: none;
  color: var(--danger);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.scroll-to-bottom-btn {
  position: absolute;
  bottom: 100px;
  right: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
  z-index: 10;
}

.scroll-to-bottom-btn:hover {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.chat-main {
  position: relative;
}

.input-area {
  padding: 8px 20px 12px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
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
  color: var(--text-primary);
  padding: 6px 0;
}

.input-wrapper textarea::placeholder {
  color: var(--text-muted);
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--border);
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
  color: var(--text-muted);
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
