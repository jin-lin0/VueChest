<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import { APP_MODULES } from '@/config'
import type { AppModule } from '@/config'
import type { WorkspaceItem } from '@/stores/workspace'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { useWorkspaceStore } from '@/stores/workspace'
import LoginDropdown from '@/components/business/LoginDropdown.vue'
import Modal from '@/components/common/Modal.vue'
import { useTheme } from '@/composables/useTheme'
import { useConfirm } from '@/composables/useConfirm'
import { openCommandPalette } from '@/lib/command-palette'
import { exportAllData, importAllData } from '@/lib/storage'

defineOptions({ name: 'WorkspaceHomeView' })

interface LaunchableApp extends AppModule {
  appKey: string
  source: 'builtin' | 'market'
}

interface DisplayItem extends WorkspaceItem {
  app: LaunchableApp
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  appKey: string
}

interface WorkspaceContextMenuState {
  visible: boolean
  x: number
  y: number
  workspaceId: string
}

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const marketStore = useMarketStore()
const workspaceStore = useWorkspaceStore()
const { isDark, toggleTheme } = useTheme()
const { confirm } = useConfirm()

workspaceStore.init()

const query = ref('')
const showGlobalSettings = ref(false)
const showAppManager = ref(false)
const appManagerQuery = ref('')
const showWorkspaceEditor = ref(false)
const workspaceEditorMode = ref<'create' | 'edit'>('create')
const workspaceName = ref('')
const workspaceIcon = ref('◫')
const showDataManager = ref(false)
const importText = ref('')
const importStatus = ref('')
const contextMenu = ref<ContextMenuState>({ visible: false, x: 0, y: 0, appKey: '' })
const workspaceContextMenu = ref<WorkspaceContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  workspaceId: '',
})
const logoClickTimes: number[] = []

const allApps = computed<LaunchableApp[]>(() => [
  ...APP_MODULES.filter((app) => !app.devOnly || import.meta.env.DEV).map((app) => ({
    ...app,
    appKey: `builtin:${app.id}`,
    source: 'builtin' as const,
  })),
  ...marketStore.installedApps.map((app) => ({
    id: app.id,
    name: app.name,
    icon: app.icon,
    route: app.route,
    description: app.description,
    appKey: `market:${app.id}`,
    source: 'market' as const,
  })),
])

const appMap = computed(() => new Map(allApps.value.map((app) => [app.appKey, app])))
const normalizedQuery = computed(() => query.value.trim().toLowerCase())

const displayItems = computed<DisplayItem[]>(() => {
  const text = normalizedQuery.value
  return (workspaceStore.activeWorkspace?.items || [])
    .map((item) => ({ ...item, app: appMap.value.get(item.appKey) }))
    .filter((item): item is WorkspaceItem & { app: LaunchableApp } => !!item.app)
    .filter(
      (item) =>
        !text ||
        `${item.app.name} ${item.app.description}`.toLowerCase().includes(text),
    )
})

const managerApps = computed(() => {
  const text = appManagerQuery.value.trim().toLowerCase()
  return allApps.value.filter(
    (app) => !text || `${app.name} ${app.description}`.toLowerCase().includes(text),
  )
})

const syncLabel = computed(() => {
  if (!authStore.isAuthenticated) return '本地保存'
  if (workspaceStore.syncState === 'syncing') return '正在同步'
  if (workspaceStore.syncState === 'error') return '同步失败，点击重试'
  return '已同步到云端'
})
const commandShortcut =
  typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘ K' : 'Ctrl K'

watch(
  () => allApps.value.map((app) => app.appKey),
  (keys) => workspaceStore.reconcileAvailableApps(keys),
  { immediate: true },
)

const launchApp = (app: LaunchableApp) => {
  workspaceStore.recordRecent(app.appKey)
  router.push(app.route)
}

const reorderItems = (items: DisplayItem[]) => {
  if (normalizedQuery.value) return
  workspaceStore.setActiveItems(items.map(({ app: _app, ...item }) => item))
}

const openContextMenu = (event: MouseEvent, appKey: string) => {
  event.preventDefault()
  event.stopPropagation()
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - 210),
    y: Math.min(event.clientY, window.innerHeight - 190),
    appKey,
  }
  workspaceContextMenu.value.visible = false
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
  workspaceContextMenu.value.visible = false
}

const openWorkspaceContextMenu = (event: MouseEvent, workspaceId: string) => {
  event.preventDefault()
  event.stopPropagation()
  workspaceStore.setActiveWorkspace(workspaceId)
  contextMenu.value.visible = false
  workspaceContextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - 180),
    y: Math.min(event.clientY, window.innerHeight - 120),
    workspaceId,
  }
}

const removeFromWorkspace = () => {
  workspaceStore.toggleApp(contextMenu.value.appKey, false)
  closeContextMenu()
}

const moveAppToFront = () => {
  const items = [...(workspaceStore.activeWorkspace?.items || [])]
  const index = items.findIndex((item) => item.appKey === contextMenu.value.appKey)
  if (index > 0) {
    const [item] = items.splice(index, 1)
    items.unshift(item)
    workspaceStore.setActiveItems(items)
  }
  closeContextMenu()
}

const openCreateWorkspace = () => {
  workspaceEditorMode.value = 'create'
  workspaceName.value = ''
  workspaceIcon.value = '◫'
  showWorkspaceEditor.value = true
}

const openEditWorkspace = () => {
  workspaceEditorMode.value = 'edit'
  workspaceName.value = workspaceStore.activeWorkspace?.name || ''
  workspaceIcon.value = workspaceStore.activeWorkspace?.icon || '◫'
  showWorkspaceEditor.value = true
}

const editWorkspaceFromMenu = () => {
  workspaceStore.setActiveWorkspace(workspaceContextMenu.value.workspaceId)
  closeContextMenu()
  openEditWorkspace()
}

const deleteWorkspaceFromMenu = async () => {
  workspaceStore.setActiveWorkspace(workspaceContextMenu.value.workspaceId)
  closeContextMenu()
  await deleteCurrentWorkspace()
}

const saveWorkspace = () => {
  if (workspaceEditorMode.value === 'create') {
    workspaceStore.createWorkspace(workspaceName.value, workspaceIcon.value)
  } else if (workspaceStore.activeWorkspace) {
    workspaceStore.updateWorkspace(workspaceStore.activeWorkspace.id, {
      name: workspaceName.value,
      icon: workspaceIcon.value,
    })
  }
  showWorkspaceEditor.value = false
}

const deleteCurrentWorkspace = async () => {
  const current = workspaceStore.activeWorkspace
  if (!current || workspaceStore.config.workspaces.length <= 1) return
  const ok = await confirm(`确定删除工作区“${current.name}”吗？应用本身不会被卸载。`)
  if (!ok) return
  workspaceStore.deleteWorkspace(current.id)
  showWorkspaceEditor.value = false
}

const retrySync = () => {
  if (authStore.user?.id) workspaceStore.syncWithServer(authStore.user.id)
}

const selectWorkspaceFromSettings = (event: Event) => {
  workspaceStore.setActiveWorkspace((event.target as HTMLSelectElement).value)
}

const openRequestedPanel = (panel: unknown) => {
  let handled = true
  if (panel === 'settings') showGlobalSettings.value = true
  else if (panel === 'organize') showAppManager.value = true
  else if (panel === 'create-workspace') openCreateWorkspace()
  else handled = false
  if (handled && route.query.panel) void router.replace('/')
}

watch(
  () => route.query.panel,
  (panel) => openRequestedPanel(panel),
)

const handleLogoClick = () => {
  const now = Date.now()
  logoClickTimes.push(now)
  while (logoClickTimes.length && now - logoClickTimes[0] > 3000) logoClickTimes.shift()
  if (logoClickTimes.length >= 7) {
    logoClickTimes.length = 0
    importStatus.value = ''
    showDataManager.value = true
  }
}

const handleExport = async () => {
  const data = await exportAllData()
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `vuechest-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

const handleImport = async () => {
  try {
    const data = JSON.parse(importText.value)
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
      importStatus.value = '请选择有效且非空的 VueChest 备份文件'
      return
    }
    await importAllData(data)
    importStatus.value = '导入成功，即将刷新页面'
    setTimeout(() => window.location.reload(), 700)
  } catch {
    importStatus.value = 'JSON 解析失败，请检查文件内容'
  }
}

const handleFileImport = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result || '')
    void handleImport()
  }
  reader.readAsText(file)
  input.value = ''
}

const handleReset = async () => {
  const ok = await confirm('确定要重置应用吗？这将清空所有本地数据，且不可恢复。')
  if (!ok) return
  await importAllData({})
  importStatus.value = '已重置，即将刷新页面'
  setTimeout(() => window.location.reload(), 700)
}

onMounted(() => {
  marketStore.refreshInstalledMeta()
  document.addEventListener('click', closeContextMenu)
  openRequestedPanel(route.query.panel)
})

onUnmounted(() => document.removeEventListener('click', closeContextMenu))
</script>

<template>
  <div
    class="workspace-page"
    :class="{
      'compact-cards': workspaceStore.config.preferences.cardDensity === 'compact',
      'hide-app-descriptions': !workspaceStore.config.preferences.showAppDescriptions,
    }"
  >
    <div class="page-atmosphere" aria-hidden="true">
      <span class="orb orb-one"></span>
      <span class="orb orb-two"></span>
      <span class="grid-texture"></span>
    </div>

    <header class="topbar">
      <button class="brand" type="button" aria-label="VueChest 数据管理入口" @click="handleLogoClick">
        <span class="brand-mark">⚡</span>
        <span class="brand-copy">
          <strong>应用中心</strong>
        </span>
      </button>

      <div class="command-trigger">
        <span class="command-search-icon">🔍</span>
        <input v-model="query" type="search" placeholder="搜索应用..." aria-label="搜索应用" />
        <button type="button" title="打开全局搜索" @click="openCommandPalette()">
          {{ commandShortcut }}
        </button>
      </div>

      <nav class="top-actions" aria-label="全局导航">
        <button class="icon-action" title="全局设置" aria-label="全局设置" @click="showGlobalSettings = true">
          ⚙
        </button>
        <button class="icon-action" :title="isDark ? '切换亮色模式' : '切换暗色模式'" @click="toggleTheme">
          {{ isDark ? '☀' : '◐' }}
        </button>
        <button class="text-action market-action" aria-label="应用市场" @click="router.push('/market')">
          <span class="market-label-full">应用市场</span>
          <span class="market-label-short">市场</span>
        </button>
        <button class="text-action docs-action" @click="router.push('/docs')">文档</button>
        <LoginDropdown />
      </nav>
    </header>

    <main class="workspace-shell">
      <section
        v-if="workspaceStore.config.preferences.showWorkspaceBar"
        class="workspace-bar"
        aria-label="工作区切换"
      >
        <div class="workspace-tabs-wrap">
          <draggable
            :model-value="workspaceStore.config.workspaces"
            item-key="id"
            class="workspace-tabs"
            ghost-class="workspace-tab-ghost"
            chosen-class="workspace-tab-chosen"
            :animation="180"
            @update:model-value="workspaceStore.setWorkspaceOrder"
          >
            <template #item="{ element: space }">
              <button
                class="workspace-tab"
                :class="{ active: workspaceStore.config.activeWorkspaceId === space.id }"
                title="拖动调整顺序，右键管理"
                @click="workspaceStore.setActiveWorkspace(space.id)"
                @contextmenu="openWorkspaceContextMenu($event, space.id)"
              >
                <span>{{ space.icon }}</span>
                {{ space.name }}
              </button>
            </template>
          </draggable>
          <button
            class="add-workspace"
            title="新建工作区"
            :disabled="workspaceStore.config.workspaces.length >= 8"
            @click="openCreateWorkspace"
          >
            +
          </button>
        </div>
        <div class="workspace-tools">
          <button @click="openEditWorkspace">设置</button>
          <button class="primary-tool" @click="showAppManager = true">整理应用</button>
        </div>
      </section>

      <section class="apps-section">
        <draggable
          v-if="displayItems.length"
          :model-value="displayItems"
          item-key="appKey"
          class="app-grid"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          handle=".drag-handle"
          :disabled="!!normalizedQuery"
          :animation="220"
          @update:model-value="reorderItems"
        >
          <template #item="{ element, index }">
            <article
              class="app-card"
              :style="{ '--card-order': index }"
              @click="launchApp(element.app)"
              @contextmenu="openContextMenu($event, element.appKey)"
            >
              <div class="card-topline">
                <div class="card-controls">
                  <button class="drag-handle" title="拖动排序" aria-label="拖动排序" @click.stop>⠿</button>
                  <button class="card-menu" title="更多操作" aria-label="更多操作" @click="openContextMenu($event, element.appKey)">•••</button>
                </div>
              </div>
              <div class="card-main">
                <span class="app-icon">{{ element.app.icon }}</span>
                <div class="app-copy">
                  <h3>{{ element.app.name }}</h3>
                  <p v-if="workspaceStore.config.preferences.showAppDescriptions">
                    {{ element.app.description }}
                  </p>
                </div>
              </div>
            </article>
          </template>
        </draggable>

        <div v-else class="empty-workspace">
          <span class="empty-symbol">＋</span>
          <h3>{{ normalizedQuery ? '没有匹配的应用' : '这个工作区还是空的' }}</h3>
          <p>{{ normalizedQuery ? '换个关键词试试，或使用全局搜索。' : '从已安装应用中挑选一些放进来。' }}</p>
          <button v-if="normalizedQuery" @click="query = ''">清除筛选</button>
          <button v-else @click="showAppManager = true">添加应用</button>
        </div>
      </section>
    </main>

    <footer class="page-footer">
      <span>{{ workspaceStore.activeWorkspace?.items.length || 0 }} 个应用 · {{ workspaceStore.config.workspaces.length }} 个工作区</span>
      <button class="sync-status" :class="workspaceStore.syncState" @click="retrySync">
        <span></span>{{ syncLabel }}
      </button>
    </footer>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button @click="moveAppToFront">移到当前工作区最前</button>
      <button class="danger" @click="removeFromWorkspace">从当前工作区移除</button>
    </div>

    <div
      v-if="workspaceContextMenu.visible"
      class="context-menu workspace-context-menu"
      :style="{ left: `${workspaceContextMenu.x}px`, top: `${workspaceContextMenu.y}px` }"
      @click.stop
    >
      <button @click="editWorkspaceFromMenu">重命名工作区</button>
      <button
        v-if="workspaceStore.config.workspaces.length > 1"
        class="danger"
        @click="deleteWorkspaceFromMenu"
      >
        删除工作区
      </button>
    </div>

    <Modal v-model:open="showGlobalSettings" title="全局设置" width="min(480px, 94vw)">
      <div class="global-settings">
        <div class="setting-row">
          <div class="setting-copy">
            <strong>显示工作区栏</strong>
            <small>关闭后首页直接显示当前工作区的应用。</small>
          </div>
          <button
            class="setting-switch"
            :class="{ active: workspaceStore.config.preferences.showWorkspaceBar }"
            type="button"
            role="switch"
            :aria-checked="workspaceStore.config.preferences.showWorkspaceBar"
            @click="
              workspaceStore.updatePreferences({
                showWorkspaceBar: !workspaceStore.config.preferences.showWorkspaceBar,
              })
            "
          >
            <span></span>
          </button>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <strong>显示应用描述</strong>
            <small>关闭后卡片只保留图标和应用名称。</small>
          </div>
          <button
            class="setting-switch"
            :class="{ active: workspaceStore.config.preferences.showAppDescriptions }"
            type="button"
            role="switch"
            :aria-checked="workspaceStore.config.preferences.showAppDescriptions"
            @click="
              workspaceStore.updatePreferences({
                showAppDescriptions: !workspaceStore.config.preferences.showAppDescriptions,
              })
            "
          >
            <span></span>
          </button>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <strong>卡片密度</strong>
            <small>紧凑模式可以在首屏显示更多应用。</small>
          </div>
          <div class="density-options" role="group" aria-label="卡片密度">
            <button
              type="button"
              :class="{ active: workspaceStore.config.preferences.cardDensity === 'standard' }"
              @click="workspaceStore.updatePreferences({ cardDensity: 'standard' })"
            >
              标准
            </button>
            <button
              type="button"
              :class="{ active: workspaceStore.config.preferences.cardDensity === 'compact' }"
              @click="workspaceStore.updatePreferences({ cardDensity: 'compact' })"
            >
              紧凑
            </button>
          </div>
        </div>

        <label v-if="workspaceStore.config.workspaces.length > 1" class="setting-row">
          <span class="setting-copy">
            <strong>当前工作区</strong>
            <small>隐藏工作区栏后仍可在这里切换。</small>
          </span>
          <select
            :value="workspaceStore.config.activeWorkspaceId"
            @change="selectWorkspaceFromSettings"
          >
            <option v-for="space in workspaceStore.config.workspaces" :key="space.id" :value="space.id">
              {{ space.icon }} {{ space.name }}
            </option>
          </select>
        </label>

        <div class="settings-links">
          <button @click="router.push('/workspace/templates')">工作区模板</button>
          <button @click="router.push('/market/installed')">已安装应用</button>
          <button v-if="authStore.isAuthenticated" @click="router.push('/settings/account')">
            设备与云端
          </button>
        </div>
      </div>
    </Modal>

    <Modal v-model:open="showAppManager" title="整理当前工作区" width="min(720px, 94vw)">
      <div class="manager-toolbar">
        <div>
          <strong>{{ workspaceStore.activeWorkspace?.icon }} {{ workspaceStore.activeWorkspace?.name }}</strong>
          <small>选择要显示在这个工作区的应用</small>
        </div>
        <input v-model="appManagerQuery" type="search" placeholder="搜索已安装应用" />
      </div>
      <div class="manager-list">
        <button
          v-for="app in managerApps"
          :key="app.appKey"
          class="manager-item"
          :class="{ selected: workspaceStore.hasApp(app.appKey) }"
          @click="workspaceStore.toggleApp(app.appKey)"
        >
          <span class="manager-icon">{{ app.icon }}</span>
          <span class="manager-copy">
            <strong>{{ app.name }}</strong>
            <small>{{ app.description }}</small>
          </span>
          <span class="checkmark">{{ workspaceStore.hasApp(app.appKey) ? '✓' : '+' }}</span>
        </button>
      </div>
    </Modal>

    <Modal
      v-model:open="showWorkspaceEditor"
      :title="workspaceEditorMode === 'create' ? '新建工作区' : '工作区设置'"
      width="min(460px, 94vw)"
    >
      <form class="workspace-form" @submit.prevent="saveWorkspace">
        <label>
          <span>图标</span>
          <input v-model="workspaceIcon" class="icon-input" type="text" maxlength="8" />
        </label>
        <label class="name-field">
          <span>名称</span>
          <input v-model="workspaceName" type="text" maxlength="20" placeholder="例如：学习、开发、娱乐" autofocus />
        </label>
        <div class="workspace-form-actions">
          <button
            v-if="workspaceEditorMode === 'edit' && workspaceStore.config.workspaces.length > 1"
            class="modal-delete-button"
            type="button"
            @click="deleteCurrentWorkspace"
          >
            删除工作区
          </button>
          <button class="modal-cancel-button" type="button" @click="showWorkspaceEditor = false">
            取消
          </button>
          <button class="modal-confirm-button" type="submit" :disabled="!workspaceName.trim()">
            {{ workspaceEditorMode === 'create' ? '确认创建' : '保存修改' }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal
      v-model:open="showDataManager"
      title="数据管理"
      :width="520"
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
    >
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
            <input type="file" accept=".json" hidden @change="handleFileImport" />
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
          :class="{ success: importStatus.includes('成功') || importStatus.includes('重置') }"
        >
          {{ importStatus }}
        </p>
      </div>

      <div class="backdoor-divider"></div>

      <div class="backdoor-section">
        <h4>重置应用</h4>
        <p class="backdoor-desc">清空所有本地数据（应用配置、缓存等），此操作不可恢复</p>
        <button class="backdoor-btn reset-btn" @click="handleReset">重置应用</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.workspace-page {
  --desk-primary: #667eea;
  --desk-secondary: #764ba2;
  position: relative;
  min-height: 100%;
  overflow: hidden;
  background: var(--bg-page);
}

.page-atmosphere {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.7;
}

.orb-one {
  top: -220px;
  right: -100px;
  width: 540px;
  height: 540px;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.28), transparent 68%);
}

.orb-two {
  bottom: -260px;
  left: -130px;
  width: 620px;
  height: 620px;
  background: radial-gradient(circle, rgba(240, 147, 251, 0.22), transparent 68%);
}

.grid-texture {
  position: absolute;
  inset: 0;
  opacity: 0.1;
  background-image:
    linear-gradient(color-mix(in srgb, var(--text-secondary) 9%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--text-secondary) 9%, transparent) 1px, transparent 1px);
  background-size: 38px 38px;
  mask-image: linear-gradient(to bottom, black, transparent 72%);
}

.topbar,
.workspace-shell,
.page-footer {
  position: relative;
  z-index: 1;
  width: min(1240px, calc(100% - 48px));
  margin-inline: auto;
}

.topbar {
  display: grid;
  min-height: 68px;
  grid-template-columns: auto minmax(240px, 360px) auto;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-light) 75%, transparent);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--desk-primary), var(--desk-secondary));
  color: white;
  font-size: 19px;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}

.brand-copy strong {
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.brand-copy small {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-actions button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 650;
}

.text-action {
  padding: 8px 11px;
  border-radius: 9px;
}

.market-label-short {
  display: none;
}

.text-action:hover,
.icon-action:hover {
  border-color: var(--border-light);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-action {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  font-size: 16px;
}

.workspace-shell {
  padding: 18px 0 48px;
}

.command-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--border-light) 75%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card) 88%, transparent);
  color: var(--text-secondary);
  box-shadow: 0 4px 16px rgba(21, 31, 50, 0.05);
  cursor: pointer;
  text-align: left;
}

.command-trigger:hover {
  border-color: color-mix(in srgb, var(--desk-primary) 45%, var(--border-light));
  transform: translateY(-1px);
}

.command-trigger > span:nth-child(2) {
  flex: 1;
}

.command-search-icon {
  color: var(--desk-primary);
  font-size: 20px;
  line-height: 1;
}

kbd {
  padding: 4px 7px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}

.workspace-tabs {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.workspace-tabs-wrap {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
}

.workspace-tab,
.add-workspace,
.workspace-tools button {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}

.workspace-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: grab;
  user-select: none;
}

.workspace-tab:active {
  cursor: grabbing;
}

.workspace-tab.active {
  background: linear-gradient(135deg, var(--desk-primary), var(--desk-secondary));
  color: white;
  box-shadow: 0 5px 14px rgba(102, 126, 234, 0.2);
}

.workspace-tab-ghost {
  opacity: 0.35;
}

.workspace-tab-chosen {
  box-shadow: 0 8px 22px rgba(102, 126, 234, 0.24);
}

.add-workspace {
  width: 34px;
  height: 34px;
  font-size: 20px;
}

.add-workspace:hover,
.workspace-tools button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.add-workspace:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.workspace-tools {
  display: flex;
  align-items: center;
  gap: 7px;
}

.workspace-tools button {
  padding: 8px 12px;
  font-weight: 700;
}

.workspace-tools .primary-tool {
  background: linear-gradient(135deg, var(--desk-primary), var(--desk-secondary));
  color: white;
}

.apps-section {
  margin-top: 14px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.section-heading > div {
  display: flex;
  align-items: baseline;
  gap: 11px;
}

.section-index {
  color: var(--desk-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-style: italic;
  font-weight: 800;
}

.section-heading h2 {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.section-note {
  color: var(--text-secondary);
  font-size: 12px;
}

.quick-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 3px;
}

.quick-item {
  display: flex;
  min-width: 150px;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 86%, transparent);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
}

.quick-item:hover {
  border-color: color-mix(in srgb, var(--desk-primary) 45%, var(--border-light));
  transform: translateY(-2px);
}

.quick-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: var(--bg-hover);
  font-size: 16px;
}

.day-strip {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 28px;
  padding: 13px 16px;
  border: 1px dashed color-mix(in srgb, var(--desk-primary) 35%, var(--border-light));
  border-radius: 13px;
  background: color-mix(in srgb, var(--desk-primary) 5%, transparent);
  cursor: pointer;
}

.day-emoji {
  font-size: 25px;
}

.day-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.day-copy strong,
.day-count strong {
  color: var(--text-primary);
}

.day-copy small,
.day-count small {
  color: var(--text-secondary);
  font-size: 11px;
}

.day-count {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.day-count strong {
  font-family: Georgia, serif;
  font-size: 25px;
}

.local-search {
  display: flex;
  width: min(220px, 32vw);
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
}

.local-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.app-card {
  position: relative;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border-light) 82%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--bg-card) 91%, transparent);
  box-shadow: 0 8px 26px rgba(20, 30, 48, 0.055);
  cursor: pointer;
  animation: card-in 0.42s both;
  animation-delay: calc(var(--card-order) * 35ms);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.app-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, var(--desk-primary), var(--desk-secondary));
  content: '';
  opacity: 0;
  transition: opacity 0.2s ease;
}

.app-card:hover {
  border-color: color-mix(in srgb, var(--desk-primary) 28%, var(--border-light));
  box-shadow: 0 18px 45px rgba(20, 30, 48, 0.1);
  transform: translateY(-4px);
}

.app-card:hover::before {
  opacity: 1;
}

.card-topline {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.card-controls {
  display: flex;
  gap: 2px;
}

.drag-handle,
.card-menu {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.drag-handle {
  cursor: grab;
  font-size: 18px;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover,
.card-menu:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.card-main {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 14px;
  padding-top: 10px;
}

.app-icon {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  place-items: center;
  border: 1px solid var(--border-light);
  border-radius: 15px;
  background: var(--bg-hover);
  font-size: 23px;
}

.app-copy {
  min-width: 0;
}

.app-copy h3 {
  margin: 2px 0 7px;
  color: var(--text-primary);
  font-size: 17px;
  letter-spacing: -0.02em;
}

.app-copy p {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.drag-ghost {
  opacity: 0.28;
}

.drag-chosen {
  box-shadow: 0 22px 55px rgba(102, 126, 234, 0.2);
}

.empty-workspace {
  display: grid;
  min-height: 300px;
  place-items: center;
  align-content: center;
  gap: 8px;
  border: 1px dashed var(--border-light);
  border-radius: 20px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-symbol {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 5px;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--desk-primary);
  font-size: 25px;
}

.empty-workspace h3 {
  color: var(--text-primary);
}

.empty-workspace p {
  font-size: 13px;
}

.empty-workspace button {
  margin-top: 8px;
  padding: 9px 16px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--desk-primary), var(--desk-secondary));
  color: white;
  cursor: pointer;
  font-weight: 700;
}

.page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0 30px;
  border-top: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: 12px;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.sync-status span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9aa5b1;
}

.sync-status.synced span {
  background: #18a875;
}

.sync-status.syncing span {
  background: #e8a317;
  animation: pulse 0.9s infinite alternate;
}

.sync-status.error span {
  background: #d84a4a;
}

.context-menu {
  position: fixed;
  z-index: 1800;
  width: 205px;
  padding: 6px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: 0 18px 50px rgba(18, 28, 45, 0.22);
}

.context-menu button {
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.context-menu button:hover {
  background: var(--bg-hover);
}

.context-menu .danger {
  color: #d84a4a;
}

.global-settings {
  display: grid;
  gap: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border-light);
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
}

.setting-copy strong {
  color: var(--text-primary);
  font-size: 0.92rem;
}

.setting-copy small {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.setting-switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex: 0 0 42px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #d8dce8;
  cursor: pointer;
  transition: background 0.2s ease;
}

.setting-switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s ease;
}

.setting-switch.active {
  background: #667eea;
}

.setting-switch.active span {
  transform: translateX(18px);
}

.setting-row select {
  max-width: 180px;
  padding: 0.48rem 0.7rem;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  outline: none;
  background: var(--bg-page);
  color: var(--text-primary);
}

.density-options {
  display: flex;
  flex: 0 0 auto;
  padding: 3px;
  border: 1px solid var(--border-light);
  border-radius: 9px;
  background: var(--bg-page);
}

.density-options button {
  padding: 0.34rem 0.65rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
}

.density-options button.active {
  background: #667eea;
  color: white;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.22);
}

.settings-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 1rem;
}

.settings-links button {
  padding: 0.45rem 0.7rem;
  border: 1px solid rgba(102, 126, 234, 0.24);
  border-radius: 8px;
  background: transparent;
  color: #667eea;
  cursor: pointer;
  font-weight: 600;
}

.manager-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.manager-toolbar > div {
  display: flex;
  flex-direction: column;
}

.manager-toolbar strong {
  color: var(--text-primary);
}

.manager-toolbar small {
  color: var(--text-secondary);
}

.manager-toolbar input {
  width: min(240px, 45%);
  padding: 9px 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  outline: none;
  background: var(--bg-page);
  color: var(--text-primary);
}

.manager-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.manager-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.manager-item.selected {
  border-color: color-mix(in srgb, var(--desk-primary) 50%, var(--border-light));
  background: color-mix(in srgb, var(--desk-primary) 6%, var(--bg-page));
}

.manager-icon {
  font-size: 23px;
}

.manager-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.manager-copy strong,
.manager-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-copy small {
  color: var(--text-secondary);
  font-size: 11px;
}

.checkmark {
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-weight: 800;
}

.manager-item.selected .checkmark {
  background: var(--desk-primary);
  color: white;
}

.workspace-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.workspace-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.workspace-form input {
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  outline: none;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: 15px;
}

.workspace-form input:focus {
  border-color: var(--desk-primary);
}

.workspace-form .icon-input {
  width: 72px;
  text-align: center;
}

.name-field {
  flex: 1;
}

.workspace-form-actions {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.modal-confirm-button,
.modal-cancel-button,
.modal-delete-button,
.data-manager button,
.file-button {
  padding: 9px 14px;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font-weight: 700;
}

.modal-confirm-button,
.data-manager button,
.file-button {
  background: linear-gradient(135deg, var(--desk-primary, #667eea), var(--desk-secondary, #764ba2));
  color: white;
}

.modal-confirm-button:disabled {
  background: #eef0f8;
  color: #9aa1b4;
  opacity: 1;
  cursor: not-allowed;
}

.modal-cancel-button {
  border: 1px solid var(--border-light);
  background: var(--bg-page);
  color: var(--text-secondary);
}

.modal-delete-button {
  margin-right: auto;
  background: color-mix(in srgb, #d84a4a 11%, var(--bg-page));
  color: #d84a4a;
}

.data-manager {
  display: grid;
  gap: 22px;
}

.data-manager section {
  display: grid;
  gap: 8px;
}

.data-manager h3 {
  color: var(--text-primary);
  font-size: 15px;
}

.data-manager p,
.data-manager small {
  color: var(--text-secondary);
  font-size: 12px;
}

.data-manager button,
.file-button {
  width: fit-content;
}

.data-manager textarea {
  width: 100%;
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-page);
  color: var(--text-primary);
}

.file-button {
  display: inline-flex;
}

.import-status {
  color: var(--desk-primary) !important;
}

.backdoor-section h4 {
  margin: 0 0 0.4rem;
  color: var(--text-primary);
  font-size: 1rem;
}

.backdoor-desc {
  margin: 0 0 1rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.backdoor-divider {
  height: 1px;
  margin: 1.5rem 0;
  background: var(--border-light, #eee);
}

.backdoor-import-actions {
  margin-bottom: 1rem;
}

.backdoor-btn {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.export-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.export-btn:hover,
.reset-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.import-file-btn {
  display: inline-block;
  border: 1px solid rgba(102, 126, 234, 0.3);
  background: #f5f7fa;
  color: #667eea;
}

.import-file-btn:hover {
  background: rgba(102, 126, 234, 0.08);
}

.import-btn {
  width: 100%;
  background: #43e97b;
  color: white;
}

.import-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.import-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.reset-btn {
  width: 100%;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
}

.backdoor-textarea {
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.8rem;
  resize: vertical;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  outline: none;
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: Monaco, Menlo, monospace;
  font-size: 0.85rem;
  transition: border-color 0.2s ease;
}

.backdoor-textarea:focus {
  border-color: #667eea;
}

.backdoor-status {
  margin: 0.8rem 0 0;
  color: #e74c3c;
  font-size: 0.85rem;
}

.backdoor-status.success {
  color: #27ae60;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  to {
    opacity: 0.35;
  }
}

@media (max-width: 980px) {
  .app-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .topbar,
  .workspace-shell,
  .page-footer {
    width: min(100% - 28px, 1240px);
  }

  .topbar {
    min-height: 70px;
    grid-template-columns: auto minmax(170px, 1fr) auto;
  }

  .brand-copy small,
  .docs-action {
    display: none;
  }

  .text-action {
    padding-inline: 7px;
  }

  .workspace-shell {
    padding-top: 34px;
  }

  .workspace-bar,
  .workspace-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-tabs {
    flex: 1;
  }

  .workspace-tabs-wrap {
    width: 100%;
  }

  .workspace-tools {
    width: 100%;
  }

  .local-search {
    width: auto;
    flex: 1;
  }

  .app-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .manager-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 500px) {
  .top-actions .text-action {
    display: none;
  }

  .top-actions .market-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .market-label-full {
    display: none;
  }

  .market-label-short {
    display: inline;
  }

  .topbar {
    grid-template-columns: auto 40px auto;
  }

  .command-trigger {
    width: 40px;
    height: 40px;
    justify-content: center;
    padding: 0;
  }

  .command-trigger > span:nth-child(2),
  .command-trigger kbd {
    display: none;
  }

  .workspace-tools button {
    padding-inline: 10px;
  }

  .app-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .app-card {
    min-height: 138px;
  }

  .app-copy p {
    -webkit-line-clamp: 2;
  }

  .manager-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .manager-toolbar input {
    width: 100%;
  }

  .page-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-card,
  .sync-status span {
    animation: none;
  }
}

/* 首页沿用项目原有视觉语言：玻璃卡片、紫蓝渐变和轻量悬浮反馈。 */
.workspace-page {
  background: var(--bg-page);
}

.grid-texture {
  display: none;
}

.orb-one {
  top: -100px;
  right: -100px;
  width: 500px;
  height: 500px;
  background: radial-gradient(
    circle,
    rgba(102, 126, 234, 0.5) 0%,
    rgba(118, 75, 162, 0.2) 40%,
    rgba(118, 75, 162, 0) 70%
  );
}

.orb-two {
  bottom: -50px;
  left: -80px;
  width: 450px;
  height: 450px;
  background: radial-gradient(
    circle,
    rgba(240, 147, 251, 0.5) 0%,
    rgba(245, 87, 108, 0.2) 40%,
    rgba(245, 87, 108, 0) 70%
  );
}

.topbar,
.workspace-shell,
.page-footer {
  width: min(1200px, calc(100% - 64px));
}

.topbar {
  z-index: 50;
  min-height: auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.5rem 0 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 0;
}

.brand {
  gap: 0.9rem;
}

.brand-mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.35);
  font-size: 1.4rem;
}

.brand-copy strong {
  background: linear-gradient(135deg, #2c3e50, #667eea, #764ba2);
  background-clip: text;
  font-size: 1.6rem;
  line-height: 1.2;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-copy small {
  margin-top: 1px;
  color: #667eea;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.command-trigger {
  min-width: 220px;
  flex: 0 1 320px;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-left: auto;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  background: var(--bg-glass);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transform: none;
}

.command-trigger:focus-within {
  border-color: rgba(102, 126, 234, 0.4);
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.12);
}

.command-trigger:hover {
  border-color: rgba(102, 126, 234, 0.3);
  transform: none;
}

.command-search-icon {
  color: inherit;
  font-size: 0.95rem;
  opacity: 0.5;
}

.command-trigger input {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.92rem;
}

.command-trigger input::placeholder {
  color: var(--text-secondary);
}

.command-trigger button {
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

.top-actions {
  gap: 0.6rem;
}

.top-actions .text-action,
.top-actions .icon-action {
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: var(--bg-glass);
  color: #667eea;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.top-actions .text-action:hover,
.top-actions .icon-action:hover {
  border-color: rgba(102, 126, 234, 0.3);
  background: rgba(102, 126, 234, 0.06);
  color: #667eea;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
}

.workspace-shell {
  z-index: 1;
  padding: 0 0 2rem;
}

.workspace-bar {
  margin: 0 0 1.5rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  background: var(--bg-glass);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.workspace-tab {
  padding: 0.48rem 0.75rem;
  border-radius: 9px;
  font-size: 0.84rem;
}

.workspace-tab:hover {
  background: rgba(102, 126, 234, 0.07);
  color: #667eea;
}

.workspace-tab.active {
  background: rgba(102, 126, 234, 0.12);
  color: #667eea;
  box-shadow: none;
}

.add-workspace:hover {
  background: rgba(102, 126, 234, 0.08);
  color: #667eea;
}

.workspace-tools button {
  padding: 0.42rem 0.75rem;
  border: 1px solid rgba(102, 126, 234, 0.18);
  border-radius: 9px;
  background: transparent;
  color: #667eea;
  font-size: 0.82rem;
}

.workspace-tools button:hover {
  border-color: rgba(102, 126, 234, 0.35);
  background: rgba(102, 126, 234, 0.07);
  color: #667eea;
}

.workspace-tools .primary-tool {
  border: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.apps-section {
  margin-top: 0;
}

.app-grid {
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1.25rem;
}

.app-card {
  min-height: 220px;
  grid-column: auto;
  padding: 1.6rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  background: var(--bg-glass);
  box-shadow: none;
  contain: layout style;
  transform: translateZ(0);
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;
}

.app-card::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  height: auto;
  border-radius: 16px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.app-card:nth-child(6n + 1)::before {
  background: linear-gradient(135deg, #f093fb, #f5576c);
}

.app-card:nth-child(6n + 2)::before {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
}

.app-card:nth-child(6n + 3)::before {
  background: linear-gradient(135deg, #43e97b, #38f9d7);
}

.app-card:nth-child(6n + 4)::before {
  background: linear-gradient(135deg, #fa709a, #fee140);
}

.app-card:nth-child(6n + 5)::before {
  background: linear-gradient(135deg, #a18cd1, #fbc2eb);
}

.app-card:hover {
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: none;
  transform: translateY(-6px) scale(1.02) translateZ(0);
}

.app-card:hover::before {
  opacity: 0.1;
}

.card-topline {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 2;
}

.card-controls {
  gap: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.app-card:hover .card-controls {
  opacity: 1;
}

.drag-handle,
.card-menu {
  color: var(--text-secondary);
}

.card-main {
  position: relative;
  z-index: 1;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0;
  text-align: center;
}

.app-icon {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  margin-bottom: 1rem;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, #f5f7fa, #e8ecf1);
  font-size: 3rem;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-card:hover .app-icon {
  transform: scale(1.1) rotate(-3deg);
}

.app-copy h3 {
  margin: 0 0 0.5rem;
  color: var(--text-primary);
  font-size: 1.18rem;
  font-weight: 700;
}

.app-copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.84rem;
  line-height: 1.5;
  -webkit-line-clamp: 3;
}

.compact-cards .app-grid {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.9rem;
}

.compact-cards .app-card {
  min-height: 150px;
  padding: 1rem 0.85rem;
}

.compact-cards .app-icon {
  width: 48px;
  height: 48px;
  flex-basis: 48px;
  margin-bottom: 0.55rem;
  border-radius: 13px;
  font-size: 1.9rem;
}

.compact-cards .app-copy h3 {
  margin-bottom: 0.25rem;
  font-size: 1rem;
}

.compact-cards .app-copy p {
  font-size: 0.75rem;
  -webkit-line-clamp: 2;
}

.hide-app-descriptions .app-card {
  min-height: 150px;
}

.hide-app-descriptions .app-icon {
  margin-bottom: 0.65rem;
}

.compact-cards.hide-app-descriptions .app-card {
  min-height: 118px;
}

.page-footer {
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem 0 1.5rem;
  border-top: 0;
  text-align: center;
}

@media (max-width: 768px) {
  .topbar,
  .workspace-shell,
  .page-footer {
    width: calc(100% - 32px);
  }

  .topbar {
    display: flex;
    min-height: auto;
    padding-top: 1rem;
    gap: 0.8rem;
  }

  .brand-copy strong {
    font-size: 1.3rem;
  }

  .command-trigger {
    order: 3;
    min-width: 100%;
    flex-basis: 100%;
    margin-left: 0;
  }

  .command-trigger > span:nth-child(2),
  .command-trigger kbd {
    display: initial;
  }

  .top-actions {
    margin-left: auto;
  }

  .workspace-bar {
    align-items: stretch;
    gap: 0.65rem;
    padding: 0.6rem;
  }

  .app-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.8rem;
  }

  .app-card {
    min-height: 180px;
    padding: 1.2rem 1rem;
  }

  .app-icon {
    width: 52px;
    height: 52px;
    flex-basis: 52px;
    margin-bottom: 0.6rem;
    border-radius: 14px;
    font-size: 2rem;
  }

  .app-copy h3 {
    font-size: 1rem;
  }

  .app-copy p {
    font-size: 0.78rem;
    -webkit-line-clamp: 2;
  }

  .compact-cards .app-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }

  .compact-cards .app-card {
    min-height: 138px;
  }

  .compact-cards.hide-app-descriptions .app-card {
    min-height: 110px;
  }

  .card-controls {
    opacity: 0.65;
  }
}

@media (max-width: 500px) {
  .command-trigger {
    width: auto;
    height: auto;
    justify-content: flex-start;
    padding: 0.5rem 0.75rem;
  }

  .command-trigger > span:nth-child(2),
  .command-trigger kbd {
    display: initial;
  }
}
</style>
