<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getStorage, setStorage } from '@/lib/storage'
import { copyToClipboard } from '@/utils'
import { MarkdownView, CustomSelect, Drawer, type SelectOption } from '@/components'
import { STORAGE_KEYS } from '@/config/storage-keys'
import ChatSidebar from './components/ChatSidebar.vue'
import {
  fetchProviders,
  fetchConversations,
  fetchConversation,
  deleteConversation,
  resolveModelSelection,
  type ProviderMeta,
  type ChatMessage,
  type ConversationSummary,
} from './config'
import { suggestionPool } from './suggestions'
import { useChatStream } from './composables/useChatStream'

defineOptions({ name: 'AIChatView' })

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

/** 会话元数据（不含消息，服务端为主、本地仅保留容错缓存） */
type ChatSession = ConversationSummary

const router = useRouter()

const sessions = ref<ChatSession[]>([])
const currentSessionId = ref<string | null>(null)
const currentMessages = ref<Message[]>([])
const inputMessage = ref('')
const isLoading = ref(false)
const providers = ref<ProviderMeta[]>([])
const selectedProviderId = ref(getStorage<string>(STORAGE_KEYS.AI_CHAT_PROVIDER, '') || '')
const selectedModel = ref('')

const FALLBACK_PROVIDER: ProviderMeta = { id: '', name: 'AI 助手', models: [], defaultModel: '' }
const currentProvider = computed<ProviderMeta>(
  () => providers.value.find((p) => p.id === selectedProviderId.value) || FALLBACK_PROVIDER,
)

const providerOptions = computed<SelectOption[]>(() =>
  providers.value.map((p) => ({ value: p.id, label: p.name })),
)
const modelOptions = computed<SelectOption[]>(() =>
  currentProvider.value.models.map((model, index) => {
    const recommended = currentProvider.value.id === 'openrouter' && index === 0 ? '推荐 · ' : ''
    const expiration = model.expirationDate
      ? ` · 免费至 ${model.expirationDate.slice(0, 10)}`
      : ''
    return { value: model.id, label: `${recommended}${model.name}${expiration}` }
  }),
)

const showSettings = ref(false)
const showSidebar = ref(true)
const error = ref('')
/** 当前活跃流的 AbortController：切换会话/卸载时用于中止上一个流 */
let activeController: AbortController | null = null

/** 中止正在进行的流式请求，避免旧流继续推送增量或造成内存泄漏 */
const abortActiveStream = () => {
  if (activeController) {
    activeController.abort()
    activeController = null
  }
}
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

const sortedSessions = computed(() => [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt))

const canSend = computed(
  () =>
    inputMessage.value.trim() &&
    selectedProviderId.value &&
    selectedModel.value &&
    !isLoading.value,
)

const goBack = () => {
  router.push('/')
}

/** 切换平台：更新选中值、持久化、并把模型重置为该平台的默认值（或本地记忆） */
const selectProvider = (raw?: string | number) => {
  const id = String(raw ?? selectedProviderId.value)
  const meta = providers.value.find((p) => p.id === id)
  if (!meta) return
  selectedProviderId.value = id
  setStorage(STORAGE_KEYS.AI_CHAT_PROVIDER, id)
  selectedModel.value = resolveModelSelection(
    meta,
    getStorage<string>(`${STORAGE_KEYS.AI_CHAT_MODEL_PREFIX}${id}`, ''),
  )
}

const generateId = () => crypto.randomUUID()

const createSession = (): ChatSession => {
  const session: ChatSession = {
    id: generateId(),
    title: '新对话',
    provider: selectedProviderId.value || null,
    model: selectedModel.value || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  sessions.value.push(session)
  saveSessions()
  return session
}

/** 新建并直接跳转到空会话：新会话必为空，不请求 /messages */
const startNewConversation = () => {
  abortActiveStream()
  const s = createSession()
  currentSessionId.value = s.id
  currentMessages.value = []
  if (isMobile.value) {
    showSidebar.value = false
  }
}

const switchSession = (id: string) => {
  abortActiveStream()
  currentSessionId.value = id
  if (isMobile.value) {
    showSidebar.value = false
  }
  loadMessages(id)
}

const deleteSession = async (id: string) => {
  const idx = sessions.value.findIndex((s) => s.id === id)
  if (idx === -1) return
  if (id === currentSessionId.value && isLoading.value) {
    error.value = '请等待当前回答结束后再删除会话'
    return
  }

  try {
    await deleteConversation(id)
  } catch (reason) {
    // 尚未发送过消息的新会话只存在本地，服务端返回 404 时仍可正常移除。
    const status =
      reason && typeof reason === 'object' && 'status' in reason
        ? Number((reason as { status?: unknown }).status)
        : 0
    if (status !== 404) {
      error.value = reason instanceof Error ? reason.message : '删除会话失败'
      return
    }
  }

  sessions.value.splice(idx, 1)
  if (currentSessionId.value === id) {
    const next = sortedSessions.value[0]
    if (next) {
      currentSessionId.value = next.id
      await loadMessages(next.id)
    } else {
      currentSessionId.value = null
      currentMessages.value = []
    }
  }
  saveSessions()
}

const saveSessions = () => {
  setStorage(STORAGE_KEYS.AI_CHAT_SESSIONS, sessions.value)
}

const loadSessions = async () => {
  const localFallback = getStorage<ChatSession[]>(STORAGE_KEYS.AI_CHAT_SESSIONS, []) ?? []
  try {
    sessions.value = await fetchConversations()
    saveSessions()
  } catch (reason) {
    sessions.value = localFallback
    error.value = reason instanceof Error ? reason.message : '加载会话列表失败'
  }
}

/** 拉取服务端已配置的平台 + 模型列表 */
const loadProviders = async () => {
  try {
    const list = await fetchProviders()
    providers.value = list
    if (list.length === 0) {
      selectedProviderId.value = ''
      selectedModel.value = ''
      error.value = '没有可用的 AI 平台或免费模型'
      return
    }
    const stored = getStorage<string>(STORAGE_KEYS.AI_CHAT_PROVIDER, '')
    const valid = list.some((p) => p.id === stored)
    if (!valid) {
      selectedProviderId.value = list[0].id
      setStorage(STORAGE_KEYS.AI_CHAT_PROVIDER, list[0].id)
    }
    const meta = list.find((p) => p.id === selectedProviderId.value)
    selectedModel.value = meta
      ? resolveModelSelection(
          meta,
          getStorage<string>(
            `${STORAGE_KEYS.AI_CHAT_MODEL_PREFIX}${selectedProviderId.value}`,
            '',
          ),
        )
      : ''
  } catch {
    error.value = '加载平台列表失败，请检查服务端是否已启动并配置 API Key'
  }
}

/** 打开会话时，从服务端拉取历史消息并还原平台/模型 */
const loadMessages = async (id: string) => {
  try {
    const data = await fetchConversation(id)
    currentMessages.value = (data.messages || []).map((m: ChatMessage) => ({
      id: generateId(),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || Date.now(),
    }))
    if (data.provider && providers.value.some((p) => p.id === data.provider)) {
      selectedProviderId.value = data.provider
      setStorage(STORAGE_KEYS.AI_CHAT_PROVIDER, data.provider)
      const provider = providers.value.find((item) => item.id === data.provider)
      if (provider) selectedModel.value = resolveModelSelection(provider, data.model)
    }
    const sess = sessions.value.find((s) => s.id === id)
    if (sess && data.title) {
      sess.title = data.title
      sess.provider = data.provider
      sess.model = data.model
      saveSessions()
    }
  } catch {
    currentMessages.value = []
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

const sendMessage = async () => {
  if (!canSend.value) return

  error.value = ''

  // 开始新请求前先释放可能仍在进行的上一个流，确保同一时刻只有一条活跃流
  abortActiveStream()
  activeController = new AbortController()
  const streamSignal = activeController.signal

  const convId = currentSessionId.value || createSession().id
  currentSessionId.value = convId

  const userMessage: Message = {
    id: generateId(),
    role: 'user',
    content: inputMessage.value.trim(),
    timestamp: Date.now(),
  }
  currentMessages.value.push(userMessage)

  const session = sessions.value.find((s) => s.id === convId)
  if (session) {
    if (session.title === '新对话') {
      session.title =
        userMessage.content.slice(0, 20) + (userMessage.content.length > 20 ? '...' : '')
    }
    session.provider = selectedProviderId.value
    session.model = selectedModel.value
    session.updatedAt = Date.now()
    saveSessions()
  }

  inputMessage.value = ''
  isLoading.value = true

  await nextTick()
  scrollToBottom()

  // 完整上下文发给服务端做转发；服务端只落库「最新一轮」user+assistant
  const apiMessages = currentMessages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }))

  currentMessages.value.push({
    id: generateId(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  })
  const assistantIndex = currentMessages.value.length - 1

  const { streamChat } = useChatStream()
  let fullContent = ''
  let scrollFrame: number | null = null
  // 此流归属的会话 id：增量只允许写入「当前激活会话」，切换会话后跳过写入，防止写错目标
  const streamSessionId = convId

  try {
    try {
      for await (const delta of streamChat({
        conversationId: convId,
        provider: selectedProviderId.value,
        model: selectedModel.value,
        messages: apiMessages,
        signal: streamSignal,
        onModelResolved: (usedModel) => {
          if (currentSessionId.value !== streamSessionId) return
          if (!currentProvider.value.models.some((option) => option.id === usedModel)) return
          selectedModel.value = usedModel
          const activeSession = sessions.value.find((item) => item.id === streamSessionId)
          if (activeSession) {
            activeSession.model = usedModel
            saveSessions()
          }
        },
      })) {
        // 若已切换到其它会话，跳过写入（旧流会被 watch/abort 及时中止，这里是兜底）
        if (currentSessionId.value !== streamSessionId) continue
        fullContent += delta
        currentMessages.value[assistantIndex].content = fullContent
        if (scrollFrame === null) {
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null
            scrollToBottom()
          })
        }
      }
    } catch (err) {
      // 切换会话导致的 abort 不属于错误，直接结束（会话已切换，不写入错误提示）
      if (err instanceof DOMException && err.name === 'AbortError') return
      // SSE 启动失败（HTTP 非 2xx / 无法读取流 / 网络异常），移除空占位消息后向上抛出
      currentMessages.value.splice(assistantIndex, 1)
      throw err
    } finally {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
    }

    const sess = sessions.value.find((s) => s.id === convId)
    if (sess) {
      sess.provider = selectedProviderId.value
      sess.model = selectedModel.value
      sess.updatedAt = Date.now()
      saveSessions()
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : '请求出错，请检查网络'
    error.value = errMsg
    const errorMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: `❌ 错误: ${errMsg}`,
      timestamp: Date.now(),
    }
    currentMessages.value.push(errorMessage)
    saveSessions()
  } finally {
    activeController = null
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

const deleteCurrentConversation = async () => {
  if (!currentSessionId.value) return
  await deleteSession(currentSessionId.value)
  if (!currentSessionId.value) startNewConversation()
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

/** 切换会话时释放上一个流，避免旧流把增量写进新会话 */
watch(currentSessionId, () => {
  abortActiveStream()
})

watch(selectedModel, (val) => {
  setStorage(`${STORAGE_KEYS.AI_CHAT_MODEL_PREFIX}${selectedProviderId.value}`, val)
})

const handleResize = () => {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) {
    showSidebar.value = false
  }
}

const copiedMessageId = ref<string | null>(null)

const copyMessage = (content: string, messageId: string) =>
  copyToClipboard(content, () => {
    copiedMessageId.value = messageId
    setTimeout(() => {
      copiedMessageId.value = null
    }, 2000)
  })

onMounted(async () => {
  await Promise.all([loadSessions(), loadProviders()])
  let isNew = false
  if (sessions.value.length === 0) {
    // 首次进入没有会话：新建并直接跳转到空会话（不请求 /messages）
    const s = createSession()
    currentSessionId.value = s.id
    currentMessages.value = []
    isNew = true
  } else {
    currentSessionId.value = sortedSessions.value[0].id
  }
  // 仅已有会话需要拉历史；新建会话必为空，跳过 /messages 请求
  if (!isNew && currentSessionId.value) {
    await loadMessages(currentSessionId.value)
  }
  if (isMobile.value) {
    showSidebar.value = false
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  abortActiveStream()
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="chat-page">
    <aside class="sidebar" :class="{ collapsed: !showSidebar }">
      <ChatSidebar
        :show-sidebar="showSidebar"
        :sessions="sortedSessions"
        :current-id="currentSessionId"
        @back="goBack"
        @new="startNewConversation"
        @select="switchSession"
        @delete="deleteSession"
      />
    </aside>

    <Drawer :open="isMobile && showSidebar" :width="260" :no-padding="true" @close="showSidebar = false">
      <ChatSidebar
        :show-sidebar="true"
        :sessions="sortedSessions"
        :current-id="currentSessionId"
        @back="goBack"
        @new="startNewConversation"
        @select="(id: string) => { switchSession(id); showSidebar = false }"
        @delete="deleteSession"
      />
    </Drawer>

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
          <CustomSelect
            v-model="selectedProviderId"
            :options="providerOptions"
            size="sm"
            @change="(v) => selectProvider(v)"
          />
          <CustomSelect v-model="selectedModel" :options="modelOptions" size="sm" />
        </div>
        <div class="header-actions">
          <button class="btn-icon" @click="deleteCurrentConversation" title="删除当前会话">
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
            <label>平台</label>
            <CustomSelect
              v-model="selectedProviderId"
              :options="providerOptions"
              block
              @change="(v) => selectProvider(v)"
            />
          </div>
          <div class="setting-item">
            <label>模型</label>
            <CustomSelect v-model="selectedModel" :options="modelOptions" block />
          </div>
          <p v-if="currentProvider.id === 'openrouter'" class="setting-note">
            免费模型按 OpenRouter 智能指数排序，第一项为推荐默认；到期日期表示免费供应结束时间。
          </p>
          <p v-else class="setting-note">API Key 由服务端配置，无需在此填写。</p>
        </div>
      </div>

      <div ref="messagesContainer" class="messages-area" @scroll="handleScroll">
        <div v-if="currentMessages.length === 0" class="welcome">
          <div class="welcome-icon">🤖</div>
          <h2>AI 智能助手</h2>
          <p>基于 {{ currentProvider.name || 'AI' }} 大模型，随时为你解答问题</p>
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
            v-for="(msg, index) in currentMessages"
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
                  v-else-if="isLoading && index === currentMessages.length - 1"
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
          <span>{{ currentProvider.name || 'AI 助手' }}</span>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  height: 100%;
  background: var(--bg-page);
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

.sidebar.collapsed {
  width: 52px;
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
  background: var(--bg-hover);
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
  gap: 12px;
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

.setting-note {
  font-size: 12px;
  color: var(--text-muted);
  margin: 8px 0 0;
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
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent-strong);
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
  border-color: var(--accent);
  color: var(--accent);
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
  background: var(--accent);
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
  background: var(--accent);
  color: var(--text-inverse);
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
  color: var(--accent);
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
  background: var(--text-muted);
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
  background: var(--accent);
  color: var(--text-inverse);
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
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
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
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
  color: var(--text-inverse);
  cursor: not-allowed;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.send-btn.active {
  background: var(--accent);
  cursor: pointer;
}

.send-btn.active:hover {
  background: var(--accent-strong);
}

.input-footer {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 8px;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }

  .chat-header {
    padding: 8px 10px;
    gap: 8px;
  }

  .header-center {
    min-width: 0;
    gap: 6px;
  }

  .sidebar-toggle {
    flex-shrink: 0;
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
