<script setup lang="ts">
import { ref, computed, defineComponent, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

defineComponent({
  name: 'HomeView',
})

interface AppItem {
  id: number
  name: string
  icon: string
  route: string
  description: string
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  appId: number | null
}

const ORDER_STORAGE_KEY = 'home_app_order'
const HIDDEN_STORAGE_KEY = 'home_app_hidden'

const defaultAppList: AppItem[] = [
  {
    id: 1,
    name: 'API管理器',
    icon: '🔗',
    route: '/api-manager',
    description: '管理免费API，配置参数，在线执行',
  },
  {
    id: 2,
    name: '书签管理',
    icon: '🔖',
    route: '/bookmark',
    description: '收藏和管理常用网站链接',
  },
  {
    id: 3,
    name: '待办事项',
    icon: '📝',
    route: '/todo',
    description: '管理您的日常任务和待办事项',
  },
  {
    id: 4,
    name: '笔记本',
    icon: '📓',
    route: '/notes',
    description: '记录和保存您的想法和笔记',
  },
  {
    id: 5,
    name: '番茄钟',
    icon: '🍅',
    route: '/pomodoro',
    description: '专注工作计时，提升效率',
  },
  {
    id: 6,
    name: '记账本',
    icon: '💰',
    route: '/expense',
    description: '记录收入支出，管理个人财务',
  },
]

const router = useRouter()
const searchQuery = ref('')
const allApps = ref<AppItem[]>([...defaultAppList])
const hiddenIds = ref<Set<number>>(new Set())
const showManagePanel = ref(false)
const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  appId: null,
})
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const isDragging = ref(false)

const appList = computed(() => {
  const visible = allApps.value.filter((app) => !hiddenIds.value.has(app.id))
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return visible
  return visible.filter(
    (app) => app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q),
  )
})
const hiddenApps = computed(() => defaultAppList.filter((app) => hiddenIds.value.has(app.id)))

const loadHidden = () => {
  const saved = localStorage.getItem(HIDDEN_STORAGE_KEY)
  if (saved) {
    try {
      const ids: number[] = JSON.parse(saved)
      hiddenIds.value = new Set(ids)
    } catch {
      hiddenIds.value = new Set()
    }
  }
}

const saveHidden = () => {
  localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenIds.value]))
}

const loadOrder = () => {
  const saved = localStorage.getItem(ORDER_STORAGE_KEY)
  if (saved) {
    try {
      const order: number[] = JSON.parse(saved)
      const sorted = order
        .map((id) => defaultAppList.find((app) => app.id === id))
        .filter((app): app is AppItem => !!app)
      const existingIds = new Set(order)
      defaultAppList.forEach((app) => {
        if (!existingIds.has(app.id)) {
          sorted.push(app)
        }
      })
      allApps.value = sorted
    } catch {
      allApps.value = [...defaultAppList]
    }
  }
}

const saveOrder = () => {
  const order = allApps.value.map((app) => app.id)
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order))
}

onMounted(() => {
  loadHidden()
  loadOrder()
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
})

const openContextMenu = (e: MouseEvent, appId: number) => {
  e.preventDefault()
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    appId,
  }
}

const closeContextMenu = () => {
  contextMenu.value = { visible: false, x: 0, y: 0, appId: null }
}

const hideApp = (appId: number) => {
  hiddenIds.value.add(appId)
  saveHidden()
  closeContextMenu()
}

const showApp = (appId: number) => {
  hiddenIds.value.delete(appId)
  saveHidden()
}

const showAllApps = () => {
  hiddenIds.value.clear()
  saveHidden()
}

const onDragStart = (index: number, e: DragEvent) => {
  dragIndex.value = index
  isDragging.value = true
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

const onDragOver = (index: number, e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dragOverIndex.value = index
}

const onDragLeave = () => {
  dragOverIndex.value = null
}

const onDrop = (index: number, e: DragEvent) => {
  e.preventDefault()
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null
    dragOverIndex.value = null
    isDragging.value = false
    return
  }

  const list = [...allApps.value]
  const [moved] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, moved)
  allApps.value = list
  saveOrder()

  dragIndex.value = null
  dragOverIndex.value = null
  isDragging.value = false
}

const onDragEnd = () => {
  dragIndex.value = null
  dragOverIndex.value = null
  isDragging.value = false
}

const navigateToApp = (route: string) => {
  if (!isDragging.value) {
    router.push(route)
  }
}
</script>

<template>
  <div class="home-container">
    <div class="bg-decoration">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <header class="header">
      <div class="header-left">
        <div class="logo-area">
          <span class="logo-icon">⚡</span>
        </div>
        <div class="header-text">
          <h1>应用中心</h1>
          <p class="subtitle">轻量实用工具集</p>
        </div>
      </div>
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input v-model="searchQuery" type="text" placeholder="搜索应用..." class="search-input" />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</button>
      </div>
    </header>

    <main v-if="appList.length > 0" class="app-grid">
      <div
        v-for="(app, index) in appList"
        :key="app.id"
        class="app-card"
        :class="{
          'is-dragging': dragIndex === index,
          'is-over': dragOverIndex === index && dragIndex !== index,
        }"
        :style="{ animationDelay: `${index * 0.1}s` }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(index, $event)"
        @dragend="onDragEnd"
        @contextmenu="openContextMenu($event, app.id)"
        @click="navigateToApp(app.route)"
      >
        <div class="drag-handle">⠿</div>
        <div class="card-glow" :class="`glow-${index}`"></div>
        <div class="card-content">
          <div class="app-icon">{{ app.icon }}</div>
          <h2 class="app-name">{{ app.name }}</h2>
          <p class="app-description">{{ app.description }}</p>
          <div class="card-arrow">→</div>
        </div>
      </div>
    </main>

    <div v-else class="empty-state">
      <span class="empty-icon">🔎</span>
      <p class="empty-text">没有找到匹配的应用</p>
      <button class="empty-clear" @click="searchQuery = ''">清除搜索</button>
    </div>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
    >
      <button
        class="context-menu-item"
        @click="contextMenu.appId !== null && hideApp(contextMenu.appId)"
      >
        <span class="context-icon">👁️‍🗨️</span>
        隐藏此应用
      </button>
    </div>

    <footer class="footer">
      <p>
        共 {{ appList.length }} 个应用 · 数据保存在本地
        <span v-if="hiddenApps.length > 0">
          ·
          <button class="manage-btn" @click="showManagePanel = !showManagePanel">
            管理已隐藏的 {{ hiddenApps.length }} 个应用
          </button>
        </span>
      </p>
    </footer>

    <div v-if="showManagePanel && hiddenApps.length > 0" class="manage-panel">
      <div class="manage-header">
        <h3>已隐藏的应用</h3>
        <div class="manage-actions">
          <button class="show-all-btn" @click="showAllApps">全部恢复</button>
          <button class="close-panel-btn" @click="showManagePanel = false">✕</button>
        </div>
      </div>
      <div class="hidden-list">
        <div v-for="app in hiddenApps" :key="app.id" class="hidden-item">
          <div class="hidden-item-info">
            <span class="hidden-icon">{{ app.icon }}</span>
            <span class="hidden-name">{{ app.name }}</span>
          </div>
          <button class="restore-btn" @click="showApp(app.id)">恢复显示</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem 2rem 1rem;
  position: relative;
  overflow: hidden;
}

.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: -1;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}

.blob-1 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  top: -100px;
  right: -100px;
  animation: float1 12s ease-in-out infinite;
}

.blob-2 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #f093fb, #f5576c);
  bottom: -50px;
  left: -80px;
  animation: float2 10s ease-in-out infinite;
}

.blob-3 {
  width: 250px;
  height: 250px;
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  top: 50%;
  left: 50%;
  animation: float3 14s ease-in-out infinite;
}

@keyframes float1 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-30px, 20px) scale(1.05);
  }
  66% {
    transform: translate(20px, -15px) scale(0.95);
  }
}

@keyframes float2 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(25px, -20px) scale(1.08);
  }
  66% {
    transform: translate(-15px, 25px) scale(0.92);
  }
}

@keyframes float3 {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  33% {
    transform: translate(-45%, -55%) scale(1.1);
  }
  66% {
    transform: translate(-55%, -45%) scale(0.9);
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  padding-top: 0.5rem;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.logo-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.35);
  flex-shrink: 0;
}

.logo-icon {
  font-size: 1.4rem;
  filter: brightness(0) invert(1);
}

.header h1 {
  font-size: 1.6rem;
  font-weight: 800;
  background: linear-gradient(135deg, #2c3e50, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.subtitle {
  font-size: 0.78rem;
  color: #667eea;
  font-weight: 600;
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sub-desc {
  font-size: 1rem;
  color: #8e99a4;
}

.search-bar {
  display: flex;
  align-items: center;
  flex: 0 1 320px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 0.5rem 0.9rem;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.search-bar:focus-within {
  border-color: rgba(102, 126, 234, 0.4);
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.12);
}

.search-icon {
  font-size: 0.95rem;
  margin-right: 0.6rem;
  opacity: 0.5;
}

.search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 0.95rem;
  color: #2c3e50;
  padding: 0;
}

.search-input::placeholder {
  color: #b0b8c1;
}

.search-clear {
  background: none;
  border: none;
  color: #b0b8c1;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  line-height: 1;
}

.search-clear:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #667eea;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.empty-text {
  color: #8e99a4;
  font-size: 1.05rem;
  margin-bottom: 1rem;
}

.empty-clear {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 0.5rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: opacity 0.2s ease;
}

.empty-clear:hover {
  opacity: 0.85;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.app-card {
  position: relative;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 2rem 1.5rem;
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;
  animation: cardIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.app-card:hover {
  transform: translateY(-6px) scale(1.02);
  box-shadow: 0 20px 40px rgba(102, 126, 234, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.app-card:active {
  transform: translateY(-2px) scale(0.99);
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card-glow {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border-radius: 18px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
}

.glow-0 {
  background: linear-gradient(135deg, #f093fb, #f5576c);
}
.glow-1 {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
}
.glow-2 {
  background: linear-gradient(135deg, #43e97b, #38f9d7);
}
.glow-3 {
  background: linear-gradient(135deg, #fa709a, #fee140);
}
.glow-4 {
  background: linear-gradient(135deg, #a18cd1, #fbc2eb);
}
.glow-5 {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.app-card:hover .card-glow {
  opacity: 0.15;
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.app-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa, #e8ecf1);
  border-radius: 18px;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-card:hover .app-icon {
  transform: scale(1.1) rotate(-3deg);
}

.app-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.app-description {
  color: #8e99a4;
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 0.8rem;
}

.card-arrow {
  font-size: 1.1rem;
  color: #b0b8c1;
  font-weight: 600;
  opacity: 0;
  transform: translateX(-8px);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease,
    color 0.3s ease;
}

.app-card:hover .card-arrow {
  opacity: 1;
  transform: translateX(0);
  color: #667eea;
}

.drag-handle {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 1.2rem;
  color: #b0b8c1;
  opacity: 0;
  cursor: grab;
  transition: opacity 0.3s ease;
  user-select: none;
  line-height: 1;
  letter-spacing: 2px;
}

.app-card:hover .drag-handle {
  opacity: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.is-dragging {
  opacity: 0.4;
  transform: scale(0.95) !important;
  box-shadow: none !important;
}

.is-over {
  border-color: #667eea !important;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2) !important;
  transform: scale(1.02) !important;
}

.footer {
  text-align: center;
  padding: 1.5rem 0 0.5rem;
  color: #b0b8c1;
  font-size: 0.85rem;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0.4rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  min-width: 160px;
  animation: menuFadeIn 0.15s ease;
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #2c3e50;
  transition: background-color 0.15s ease;
  white-space: nowrap;
}

.context-menu-item:hover {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
}

.context-icon {
  font-size: 0.95rem;
}

.manage-btn {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}

.manage-btn:hover {
  color: #764ba2;
}

.manage-panel {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 480px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  padding: 1.2rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  z-index: 999;
  animation: panelSlideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes panelSlideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.manage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.manage-header h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #2c3e50;
}

.manage-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.show-all-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 0.35rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: opacity 0.2s ease;
}

.show-all-btn:hover {
  opacity: 0.85;
}

.close-panel-btn {
  background: none;
  border: none;
  color: #8e99a4;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  line-height: 1;
}

.close-panel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #2c3e50;
}

.hidden-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 240px;
  overflow-y: auto;
}

.hidden-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  background: rgba(245, 247, 250, 0.8);
  border-radius: 10px;
  transition: background-color 0.2s ease;
}

.hidden-item:hover {
  background: rgba(232, 236, 241, 0.9);
}

.hidden-item-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.hidden-icon {
  font-size: 1.3rem;
}

.hidden-name {
  font-size: 0.95rem;
  color: #2c3e50;
  font-weight: 500;
}

.restore-btn {
  background: none;
  border: 1px solid rgba(102, 126, 234, 0.3);
  color: #667eea;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.restore-btn:hover {
  background: rgba(102, 126, 234, 0.08);
  border-color: rgba(102, 126, 234, 0.5);
}
</style>
