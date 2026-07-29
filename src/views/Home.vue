<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { exportAllData, importAllData, getStorage, setStorage } from '@/lib/storage'
import { APP_MODULES, STORAGE_KEYS } from '@/config'
import type { AppModule } from '@/config'
import { useMarketStore } from '@/stores/market'
import { LoginDropdown, Modal, EmptyState } from '@/components'
import { useTheme } from '@/composables/useTheme'
import { useSpecialDays } from '@/composables/useSpecialDays'

defineOptions({ name: 'HomeView' })

type AppItem = AppModule

const marketStore = useMarketStore()

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  appId: number | null
  isMarketApp: boolean
}

const defaultAppList: AppItem[] = APP_MODULES.filter((app) => !app.devOnly || import.meta.env.DEV)

const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const searchQuery = ref('')
const allApps = ref<AppItem[]>([...defaultAppList])
const hiddenIds = ref<Set<number>>(new Set())
const showManagePanel = ref(false)
const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  appId: null,
  isMarketApp: false,
})
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const isDragging = ref(false)

const showBackdoorModal = ref(false)
const importText = ref('')
const importStatus = ref('')
const lastClickTime = ref(0)

const { nearestSpecialDay } = useSpecialDays()

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase())

/** 应用是否命中搜索词（匹配名称或描述） */
const matchesQuery = (app: { name: string; description: string }, q: string) =>
  app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q)

const appList = computed(() => {
  const visible = allApps.value.filter((app) => !hiddenIds.value.has(app.id))
  const q = normalizedQuery.value
  if (!q) return visible
  return visible.filter((app) => matchesQuery(app, q))
})
const hiddenApps = computed(() => defaultAppList.filter((app) => hiddenIds.value.has(app.id)))

const marketApps = computed(() => {
  const q = normalizedQuery.value
  if (!q) return marketStore.installedApps
  return marketStore.installedApps.filter((app) => matchesQuery(app, q))
})

const loadHidden = () => {
  const ids = getStorage<number[]>(STORAGE_KEYS.HOME_APP_HIDDEN, [])
  hiddenIds.value = new Set(ids || [])
}

const saveHidden = () => {
  setStorage(STORAGE_KEYS.HOME_APP_HIDDEN, [...hiddenIds.value])
}

const loadOrder = () => {
  const order = getStorage<number[]>(STORAGE_KEYS.HOME_APP_ORDER)
  if (order) {
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
  }
}

const saveOrder = () => {
  const order = allApps.value.map((app) => app.id)
  setStorage(STORAGE_KEYS.HOME_APP_ORDER, order)
}

const handleLogoClick = (e: MouseEvent) => {
  if (!e.metaKey && !e.ctrlKey) return

  const now = Date.now()
  if (now - lastClickTime.value < 400) {
    showBackdoorModal.value = true
    importText.value = ''
    importStatus.value = ''
  }
  lastClickTime.value = now
}

const handleExport = async () => {
  const data = await exportAllData()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const handleImport = async () => {
  importStatus.value = ''
  try {
    const data = JSON.parse(importText.value)
    if (typeof data !== 'object' || data === null) {
      importStatus.value = '数据格式错误：应为 JSON 对象'
      return
    }
    await importAllData(data as Record<string, unknown>)
    importStatus.value = '导入成功，刷新页面后生效'
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  } catch {
    importStatus.value = 'JSON 解析失败，请检查格式'
  }
}

const handleFileImport = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = reader.result as string
    handleImport()
  }
  reader.readAsText(file)
  input.value = ''
}

onMounted(() => {
  loadHidden()
  loadOrder()
  marketStore.refreshInstalledMeta()
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
})

const openContextMenu = (e: MouseEvent, appId: number, isMarketApp = false) => {
  e.preventDefault()
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    appId,
    isMarketApp,
  }
}

const closeContextMenu = () => {
  contextMenu.value = { visible: false, x: 0, y: 0, appId: null, isMarketApp: false }
}

const hideApp = (appId: number) => {
  hiddenIds.value = new Set([...hiddenIds.value, appId])
  saveHidden()
  closeContextMenu()
}

const showApp = (appId: number) => {
  const next = new Set(hiddenIds.value)
  next.delete(appId)
  hiddenIds.value = next
  saveHidden()
}

const uninstallMarketApp = (appId: number) => {
  marketStore.uninstallApp(appId)
  closeContextMenu()
}

const showAllApps = () => {
  hiddenIds.value = new Set()
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
        <div class="logo-area" @click="handleLogoClick">
          <span class="logo-icon">⚡</span>
        </div>
        <div class="header-text">
          <h1>应用中心</h1>
          <p class="subtitle">轻量实用工具集</p>
        </div>
      </div>
      <div class="header-actions">
        <button
          class="theme-toggle"
          @click="toggleTheme"
          :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
          :aria-label="isDark ? '切换到亮色模式' : '切换到暗色模式'"
        >
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <button class="market-btn" @click="router.push('/market')">🏪 市场</button>
        <button class="market-btn" @click="router.push('/docs')">📚 文档</button>
        <LoginDropdown />
      </div>
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input v-model="searchQuery" type="text" placeholder="搜索应用..." class="search-input" />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</button>
      </div>
    </header>

    <div
      v-if="nearestSpecialDay && !searchQuery"
      class="countdown-banner"
      @click="navigateToApp('/m/special-days')"
    >
      <div class="countdown-emoji">{{ nearestSpecialDay.emoji }}</div>
      <div class="countdown-info">
        <div class="countdown-name">{{ nearestSpecialDay.name }}</div>
        <div class="countdown-detail">
          {{ nearestSpecialDay.dateLabel }}
        </div>
      </div>
      <div class="countdown-days">
        <div class="countdown-number">{{ nearestSpecialDay.daysUntil }}</div>
        <div class="countdown-label">
          {{ nearestSpecialDay.daysUntil === 0 ? '就是今天' : '天后' }}
        </div>
      </div>
    </div>

    <main v-if="appList.length > 0 || marketApps.length > 0" class="app-grid">
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
        <div class="card-glow" :class="`glow-${index % 6}`"></div>
        <div class="card-content">
          <div class="app-icon">{{ app.icon }}</div>
          <h2 class="app-name">{{ app.name }}</h2>
          <p class="app-description">{{ app.description }}</p>
          <div class="card-arrow">→</div>
        </div>
      </div>
      <div
        v-for="app in marketApps"
        :key="'m-' + app.id"
        class="app-card market-app"
        @contextmenu="openContextMenu($event, app.id, true)"
        @click="navigateToApp(app.route)"
      >
        <div class="card-glow market-glow"></div>
        <div class="card-content">
          <div class="app-icon">{{ app.icon }}</div>
          <h2 class="app-name">{{ app.name }}</h2>
          <p class="app-description">{{ app.description }}</p>
          <div class="card-arrow">→</div>
        </div>
      </div>
    </main>

    <EmptyState v-else icon="🔎" title="没有找到匹配的应用">
      <button class="empty-clear" @click="searchQuery = ''">清除搜索</button>
    </EmptyState>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
    >
      <template v-if="contextMenu.isMarketApp">
        <button
          class="context-menu-item uninstall"
          @click="contextMenu.appId !== null && uninstallMarketApp(contextMenu.appId)"
        >
          <span class="context-icon">🗑️</span>
          卸载
        </button>
      </template>
      <template v-else>
        <button
          class="context-menu-item"
          @click="contextMenu.appId !== null && hideApp(contextMenu.appId)"
        >
          <span class="context-icon">👁️‍🗨️</span>
          隐藏此应用
        </button>
      </template>
    </div>

    <footer class="footer">
      <p>
        共 {{ appList.length + marketApps.length }} 个应用 · 数据保存在本地
        <span v-if="marketApps.length > 0"> · {{ marketApps.length }} 个来自市场 </span>
        <span v-if="hiddenApps.length > 0">
          ·
          <button class="manage-btn" @click="showManagePanel = !showManagePanel">
            管理已隐藏的 {{ hiddenApps.length }} 个应用
          </button>
        </span>
        ·
        <button
          class="donate-link"
          @click="router.push({ path: '/docs', query: { doc: 'site-donate' } })"
        >
          ❤️ 打赏支持
        </button>
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

    <Modal
      :open="showBackdoorModal"
      :width="520"
      title="数据管理"
      :style="{
        '--vc-modal-z': '2000',
        '--vc-modal-overlay': 'rgba(0, 0, 0, 0.5)',
        '--vc-modal-overlay-blur': 'none',
        '--vc-modal-radius': '16px',
        '--vc-modal-shadow': '0 20px 60px rgba(0, 0, 0, 0.3)',
        '--vc-modal-max-h': '80vh',
        '--vc-modal-body-pad': '1.5rem',
        '--vc-modal-header-pad': '1.2rem 1.5rem',
        '--vc-modal-title-size': '1.15rem',
      }"
      @close="showBackdoorModal = false"
    >
      <div class="backdoor-section">
        <h4>管理后台</h4>
        <p class="backdoor-desc">进入面试题库管理后台</p>
        <button class="backdoor-btn admin-btn" @click="router.push('/admin')">
          进入管理后台 →
        </button>
      </div>
      <div class="backdoor-divider"></div>
      <div class="backdoor-section">
        <h4>导出数据</h4>
        <p class="backdoor-desc">将所有应用数据导出为 JSON 文件</p>
        <button class="backdoor-btn export-btn" @click="handleExport">导出全部数据</button>
      </div>
      <div class="backdoor-divider"></div>
      <div class="backdoor-section">
        <h4>导入数据</h4>
        <p class="backdoor-desc">从 JSON 文件或粘贴 JSON 文本导入数据</p>
        <div class="backdoor-import-actions">
          <label class="backdoor-btn import-file-btn">
            选择文件导入
            <input type="file" accept=".json" @change="handleFileImport" style="display: none" />
          </label>
        </div>
        <textarea
          v-model="importText"
          class="backdoor-textarea"
          placeholder="或粘贴 JSON 数据到这里..."
          rows="6"
        ></textarea>
        <button
          class="backdoor-btn import-btn"
          :disabled="!importText.trim()"
          @click="handleImport"
        >
          导入数据
        </button>
        <p
          v-if="importStatus"
          class="backdoor-status"
          :class="{ success: importStatus.includes('成功') }"
        >
          {{ importStatus }}
        </p>
      </div>
    </Modal>
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
  contain: strict;
}

.blob {
  position: absolute;
  border-radius: 50%;
  transform: translateZ(0);
}

.blob-1 {
  width: 500px;
  height: 500px;
  background: radial-gradient(
    circle,
    rgba(102, 126, 234, 0.5) 0%,
    rgba(118, 75, 162, 0.2) 40%,
    rgba(118, 75, 162, 0) 70%
  );
  top: -100px;
  right: -100px;
  animation: float1 20s ease-in-out infinite;
}

.blob-2 {
  width: 450px;
  height: 450px;
  background: radial-gradient(
    circle,
    rgba(240, 147, 251, 0.5) 0%,
    rgba(245, 87, 108, 0.2) 40%,
    rgba(245, 87, 108, 0) 70%
  );
  bottom: -50px;
  left: -80px;
  animation: float2 24s ease-in-out infinite;
}

.blob-3 {
  width: 350px;
  height: 350px;
  background: radial-gradient(
    circle,
    rgba(79, 172, 254, 0.5) 0%,
    rgba(0, 242, 254, 0.2) 40%,
    rgba(0, 242, 254, 0) 70%
  );
  top: 50%;
  left: 50%;
  animation: float3 28s ease-in-out infinite;
}

@keyframes float1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(-30px, 20px);
  }
  66% {
    transform: translate(20px, -15px);
  }
}

@keyframes float2 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(25px, -20px);
  }
  66% {
    transform: translate(-15px, 25px);
  }
}

@keyframes float3 {
  0%,
  100% {
    transform: translate(-50%, -50%);
  }
  33% {
    transform: translate(-45%, -55%);
  }
  66% {
    transform: translate(-55%, -45%);
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
  contain: layout style;
  user-select: none;
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
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.market-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: var(--bg-glass);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #667eea;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.market-btn:hover {
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
  background: rgba(102, 126, 234, 0.06);
}

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: var(--bg-glass);
  border-radius: var(--radius-full, 50%);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  transition: all var(--transition, 0.2s ease);
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.04));
}

.theme-toggle:hover {
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: var(--shadow-brand-md, 0 4px 16px rgba(102, 126, 234, 0.1));
  background: rgba(102, 126, 234, 0.06);
}

.market-app {
  border-style: dashed !important;
  border-color: rgba(102, 126, 234, 0.25) !important;
}

.market-glow {
  background: linear-gradient(135deg, #43e97b, #38f9d7) !important;
}

.context-menu-item.uninstall {
  color: #e74c3c;
}

.context-menu-item.uninstall:hover {
  background: rgba(231, 76, 60, 0.08) !important;
  color: #e74c3c;
}

.search-bar {
  display: flex;
  align-items: center;
  flex: 0 1 320px;
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 0.5rem 0.9rem;
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  contain: layout style;
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
  color: var(--text-primary);
  padding: 0;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-clear {
  background: none;
  border: none;
  color: var(--text-secondary);
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
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 2rem 1.5rem;
  cursor: pointer;
  overflow: hidden;
  contain: layout style;
  transform: translateZ(0);
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;
}

.app-card:hover {
  transform: translateY(-6px) scale(1.02) translateZ(0);
  border-color: rgba(102, 126, 234, 0.3);
}

.app-card:active {
  transform: translateY(-2px) scale(0.99) translateZ(0);
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
  contain: strict;
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
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.app-description {
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 0.8rem;
}

.card-arrow {
  font-size: 1.1rem;
  color: var(--text-secondary);
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
  color: var(--text-secondary);
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
  opacity: 0.35;
  transform: scale(0.95) translateZ(0) !important;
  box-shadow: none !important;
  border: 2px dashed rgba(102, 126, 234, 0.3) !important;
}

.is-over {
  border-color: #667eea !important;
  transform: scale(1.03) translateZ(0) !important;
}

.footer {
  text-align: center;
  padding: 1.5rem 0 0.5rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-glass);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0.4rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  min-width: 160px;
  animation: menuFadeIn 0.15s ease;
  contain: layout style;
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
  color: var(--text-primary);
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

.donate-link {
  background: none;
  border: none;
  color: #e0536b;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}

.donate-link:hover {
  color: #c0344b;
}

.manage-panel {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 480px;
  background: var(--bg-glass);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  padding: 1.2rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  z-index: 999;
  animation: panelSlideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  contain: layout style;
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
  color: var(--text-primary);
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
  color: var(--text-secondary);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  line-height: 1;
}

.close-panel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
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
  color: var(--text-primary);
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

.countdown-banner {
  display: flex;
  align-items: center;
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  padding: 1rem 1.5rem;
  margin-bottom: 2rem;
  cursor: pointer;
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
  border: 1px solid rgba(102, 126, 234, 0.15);
}

.countdown-banner:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.12);
}

.countdown-emoji {
  font-size: 2.5rem;
  margin-right: 1.2rem;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-glass);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.countdown-info {
  flex: 1;
  min-width: 0;
}

.countdown-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.2rem;
}

.countdown-detail {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.countdown-days {
  text-align: center;
  margin-left: 1.5rem;
  padding-left: 1.5rem;
  border-left: 1px solid rgba(102, 126, 234, 0.15);
}

.countdown-number {
  font-size: 2.2rem;
  font-weight: 800;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.countdown-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

@media (max-width: 768px) {
  .home-container {
    padding: 1rem 1rem 0.8rem;
  }

  .header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    margin-bottom: 1.2rem;
  }

  .header h1 {
    font-size: 1.3rem;
  }

  .header-actions {
    order: 3;
    align-self: flex-end;
  }

  .search-bar {
    flex: 1 1 100%;
  }

  .app-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.8rem;
    margin-bottom: 1.2rem;
  }

  .app-card {
    padding: 1.2rem 1rem;
  }

  .app-icon {
    font-size: 2rem;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    margin-bottom: 0.6rem;
  }

  .app-name {
    font-size: 1rem;
  }

  .app-description {
    font-size: 0.78rem;
    margin-bottom: 0.5rem;
  }

  .countdown-banner {
    padding: 0.8rem 1rem;
    margin-bottom: 1.2rem;
  }

  .countdown-emoji {
    font-size: 1.8rem;
    width: 42px;
    height: 42px;
    margin-right: 0.8rem;
    border-radius: 10px;
  }

  .countdown-name {
    font-size: 0.95rem;
  }

  .countdown-detail {
    font-size: 0.78rem;
  }

  .countdown-days {
    margin-left: 1rem;
    padding-left: 1rem;
  }

  .countdown-number {
    font-size: 1.6rem;
  }

  .footer {
    font-size: 0.78rem;
    padding: 1rem 0 0.4rem;
  }

  .manage-panel {
    width: 95%;
    max-width: none;
    bottom: 1rem;
  }

  .blob-1 {
    width: 300px;
    height: 300px;
  }

  .blob-2 {
    width: 250px;
    height: 250px;
  }

  .blob-3 {
    width: 200px;
    height: 200px;
  }
}

.backdoor-section h4 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  color: var(--text-primary);
}

.backdoor-desc {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.backdoor-divider {
  height: 1px;
  background: #eee;
  margin: 1.5rem 0;
}

.backdoor-import-actions {
  margin-bottom: 1rem;
}

.backdoor-btn {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.admin-btn {
  background: linear-gradient(135deg, #f093fb, #f5576c);
  color: white;
}

.admin-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.export-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.export-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.import-file-btn {
  background: #f5f7fa;
  color: #667eea;
  border: 1px solid rgba(102, 126, 234, 0.3);
  display: inline-block;
}

.import-file-btn:hover {
  background: rgba(102, 126, 234, 0.08);
}

.import-btn {
  background: #43e97b;
  color: white;
  width: 100%;
}

.import-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.import-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.backdoor-textarea {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', monospace;
  resize: vertical;
  margin-bottom: 1rem;
  transition: border-color 0.2s ease;
}

.backdoor-textarea:focus {
  outline: none;
  border-color: #667eea;
}

.backdoor-status {
  margin: 0.8rem 0 0;
  font-size: 0.85rem;
  color: #e74c3c;
}

.backdoor-status.success {
  color: #27ae60;
}
</style>
