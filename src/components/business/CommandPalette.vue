<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { APP_MODULES } from '@/config'
import { useAuthStore } from '@/stores/auth'
import { useMarketStore } from '@/stores/market'
import { useWorkspaceStore } from '@/stores/workspace'
import { COMMAND_PALETTE_EVENT } from '@/lib/command-palette'
import { getStorage, setStorage } from '@/lib/storage'
import { useToast } from '@/composables/useToast'
import { loadBuiltinAppCommandProviders } from '@/apps/app-commands'
import type { AppCommandOutcome, AppCommandProvider } from '@/lib/app-command'

interface CommandItem {
  id: string
  type: 'app' | 'navigation' | 'action'
  label: string
  description: string
  icon: string
  route?: string
  action?: () => AppCommandOutcome | void | Promise<AppCommandOutcome | void>
  appKey?: string
  keywords: string
  kindLabel?: string
  priority?: number
  disabledReason?: () => string | null
}

const RECENT_ACTIONS_KEY = 'command-palette:recent-actions'

const router = useRouter()
const authStore = useAuthStore()
const marketStore = useMarketStore()
const workspaceStore = useWorkspaceStore()
const { addToast } = useToast()
const appCommandProviders = ref<AppCommandProvider[]>([])

const isOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const commandCatalogVersion = ref(0)
const recentActionIds = ref<string[]>(getStorage<string[]>(RECENT_ACTIONS_KEY, []) || [])
let commandProvidersPromise: Promise<AppCommandProvider[]> | null = null

async function ensureCommandProviders() {
  if (appCommandProviders.value.length) return
  commandProvidersPromise ||= loadBuiltinAppCommandProviders()
  try {
    appCommandProviders.value = await commandProvidersPromise
    commandCatalogVersion.value += 1
  } catch {
    commandProvidersPromise = null
    addToast('error', 'App 快捷操作加载失败')
  }
}

const appCommands = computed<CommandItem[]>(() => [
  ...APP_MODULES.filter((app) => !app.devOnly || import.meta.env.DEV).map((app) => ({
    id: `app-builtin-${app.id}`,
    type: 'app' as const,
    label: app.name,
    description: app.description,
    icon: app.icon,
    route: app.route,
    appKey: `builtin:${app.id}`,
    keywords: `${app.name} ${app.description} application tool`,
  })),
  ...marketStore.installedApps.map((app) => ({
    id: `app-market-${app.id}`,
    type: 'app' as const,
    label: app.name,
    description: app.description,
    icon: app.icon,
    route: app.route,
    appKey: `market:${app.id}`,
    keywords: `${app.name} ${app.description} market`,
  })),
])

const marketCommands = computed<CommandItem[]>(() =>
  marketStore.availableApps
    .filter((app) => !marketStore.isInstalled(app.id))
    .map((app) => ({
      id: `market-${app.id}`,
      type: 'navigation' as const,
      label: `${app.name}（市场）`,
      description: app.description,
      icon: app.icon,
      route: `/market/${app.id}`,
      keywords: `${app.name} ${app.description} 市场 安装`,
    })),
)

const workspaceCommands = computed<CommandItem[]>(() =>
  workspaceStore.config.workspaces.map((workspace) => ({
    id: `workspace-${workspace.id}`,
    type: 'navigation' as const,
    label: `切换到 ${workspace.name}`,
    description: '切换当前工作区并返回首页',
    icon: workspace.icon,
    action: () => {
      workspaceStore.setActiveWorkspace(workspace.id)
      router.push('/')
    },
    keywords: `${workspace.name} 工作区 切换 workspace`,
  })),
)

const navigationCommands = computed<CommandItem[]>(() => {
  const entries: CommandItem[] = [
    {
      id: 'nav-home',
      type: 'navigation',
      label: '返回工作台',
      description: '打开当前工作区',
      icon: '⌂',
      route: '/',
      keywords: '首页 工作台 home workspace',
    },
    {
      id: 'nav-market',
      type: 'navigation',
      label: '应用市场',
      description: '发现和安装新应用',
      icon: '◇',
      route: '/market',
      keywords: '市场 安装 market apps',
    },
    {
      id: 'nav-installed-apps',
      type: 'navigation',
      label: '已安装应用管理',
      description: '管理应用数据、权限、版本和卸载',
      icon: '▦',
      route: '/market/installed',
      keywords: '已安装 应用 数据 权限 卸载',
    },
    {
      id: 'nav-app-updates',
      type: 'navigation',
      label: '应用更新',
      description: '检查、批量更新和自动更新',
      icon: '↻',
      route: '/market/updates',
      keywords: '应用 更新 版本 update',
    },
    {
      id: 'nav-workspace-templates',
      type: 'navigation',
      label: '工作区模板',
      description: '导入、导出和分享工作区',
      icon: '▧',
      route: '/workspace/templates',
      keywords: '工作区 模板 分享 导入 导出',
    },
    {
      id: 'action-global-settings',
      type: 'navigation',
      label: '打开全局设置',
      description: '调整首页显示和设备偏好',
      icon: '⚙',
      route: '/?panel=settings',
      keywords: '全局 设置 preferences',
    },
    {
      id: 'action-create-workspace',
      type: 'navigation',
      label: '创建工作区',
      description: '新建一个空白工作区',
      icon: '+',
      route: '/?panel=create-workspace',
      keywords: '新建 创建 工作区',
    },
    {
      id: 'action-organize-apps',
      type: 'navigation',
      label: '整理当前工作区',
      description: '添加或移除当前工作区应用',
      icon: '⠿',
      route: '/?panel=organize',
      keywords: '整理 应用 工作区',
    },
    {
      id: 'nav-docs',
      type: 'navigation',
      label: '帮助文档',
      description: '查看使用说明与开发文档',
      icon: '▤',
      route: '/docs',
      keywords: '帮助 文档 docs guide',
    },
  ]
  if (authStore.isAdmin) {
    entries.push({
      id: 'nav-admin',
      type: 'navigation',
      label: '管理后台',
      description: '管理应用、题库与用户',
      icon: '⚙',
      route: '/admin',
      keywords: '管理 后台 admin',
    })
  }
  if (authStore.isAuthenticated) {
    entries.push({
      id: 'nav-account-settings',
      type: 'navigation',
      label: '设备与云端',
      description: '管理登录设备和云端工作区',
      icon: '🔐',
      route: '/settings/account',
      keywords: '设备 会话 登录 云端 同步 account sessions',
    })
  }
  return entries
})

const dataCommands = computed<CommandItem[]>(() =>
  marketStore.installedApps.map((app) => ({
    id: `clear-data-${app.id}`,
    type: 'navigation' as const,
    label: `清除 ${app.name} 数据`,
    description: '打开应用管理并确认清除本地数据',
    icon: app.icon,
    route: `/market/installed?action=clear&app=${app.id}`,
    keywords: `${app.name} 清除 数据 storage`,
  })),
)

const appActionCommands = computed<CommandItem[]>(() => {
  // App 内的动态命令（如流水线预设）需要在每次打开面板时重新读取。
  void commandCatalogVersion.value
  return appCommandProviders.value.flatMap((provider) =>
    provider.commands().map((command) => ({
      id: `action-${provider.appKey}-${command.id}`,
      type: 'action' as const,
      label: command.label,
      description: command.description,
      icon: command.icon,
      appKey: provider.appKey,
      keywords: `${provider.appName} ${command.label} ${command.description} ${(command.keywords || []).join(' ')}`,
      kindLabel: provider.appName,
      priority: command.priority || 0,
      disabledReason: command.disabledReason,
      action: () => command.execute({ router }),
    })),
  )
})

const allCommands = computed(() => [
  ...appActionCommands.value,
  ...appCommands.value,
  ...marketCommands.value,
  ...workspaceCommands.value,
  ...navigationCommands.value,
  ...dataCommands.value,
])

const results = computed(() => {
  const text = query.value.trim().toLowerCase()
  if (text) {
    return allCommands.value
      .map((item) => {
        const label = item.label.toLowerCase()
        const haystack = `${item.label} ${item.description} ${item.keywords}`.toLowerCase()
        const tokens = text.split(/\s+/).filter(Boolean)
        if (!tokens.every((token) => haystack.includes(token))) return { item, score: -1 }
        const score =
          label === text ? 1000 : label.startsWith(text) ? 800 : label.includes(text) ? 600 : 300
        return { item, score: score + (item.priority || 0) }
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)
      .slice(0, 14)
  }

  const recent = new Map(
    workspaceStore.config.recentApps.map((item, index) => [item.appKey, index]),
  )

  const apps = [...appCommands.value].sort((a, b) => {
    return (recent.get(a.appKey || '') ?? 999) - (recent.get(b.appKey || '') ?? 999)
  })
  const recentActions = new Map(recentActionIds.value.map((id, index) => [id, index]))
  const actions = [...appActionCommands.value].sort((a, b) => {
    const recentA = recentActions.get(a.id)
    const recentB = recentActions.get(b.id)
    if (recentA !== undefined || recentB !== undefined) {
      return (recentA ?? 999) - (recentB ?? 999)
    }
    return (b.priority || 0) - (a.priority || 0)
  })
  return [...actions.slice(0, 4), ...apps.slice(0, 6), ...navigationCommands.value].slice(0, 14)
})

const open = (initialQuery = '') => {
  commandCatalogVersion.value += 1
  void ensureCommandProviders()
  query.value = initialQuery
  selectedIndex.value = 0
  isOpen.value = true
  if (marketStore.availableApps.length === 0) void marketStore.fetchApps({ limit: 50 })
  nextTick(() => inputRef.value?.focus())
}

const close = () => {
  isOpen.value = false
  query.value = ''
}

const execute = async (item: CommandItem | undefined) => {
  if (!item) return
  const disabledReason = item.disabledReason?.()
  if (disabledReason) {
    addToast('info', disabledReason)
    return
  }
  if (item.appKey) workspaceStore.recordRecent(item.appKey)
  if (item.type === 'action') {
    recentActionIds.value = [
      item.id,
      ...recentActionIds.value.filter((id) => id !== item.id),
    ].slice(0, 12)
    setStorage(RECENT_ACTIONS_KEY, recentActionIds.value)
  }
  close()
  try {
    if (item.action) {
      const outcome = await item.action()
      if (outcome?.message) addToast(outcome.type || 'success', outcome.message)
    } else if (item.route) {
      await router.push(item.route)
    }
  } catch (error) {
    addToast('error', error instanceof Error ? error.message : '命令执行失败')
  }
}

const handleOpenEvent = (event: Event) => {
  const detail = (event as CustomEvent<{ query?: string }>).detail
  open(detail?.query || '')
}

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (isOpen.value) close()
    else open()
    return
  }
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void execute(results.value[selectedIndex.value])
  }
}

watch(query, () => {
  selectedIndex.value = 0
})

onMounted(() => {
  window.addEventListener(COMMAND_PALETTE_EVENT, handleOpenEvent)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener(COMMAND_PALETTE_EVENT, handleOpenEvent)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="isOpen" class="palette-backdrop" @mousedown.self="close">
        <section class="palette-panel" role="dialog" aria-modal="true" aria-label="全局命令面板">
          <div class="palette-search">
            <span class="palette-mark">⌘</span>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="搜索应用、页面或操作…"
              autocomplete="off"
              aria-label="搜索命令"
            />
            <kbd>ESC</kbd>
          </div>

          <div class="palette-results">
            <p class="palette-heading">{{ query ? '搜索结果' : '快捷操作与最近使用' }}</p>
            <button
              v-for="(item, index) in results"
              :key="item.id"
              class="palette-item"
              :class="{ selected: selectedIndex === index, disabled: item.disabledReason?.() }"
              :aria-disabled="Boolean(item.disabledReason?.())"
              @mouseenter="selectedIndex = index"
              @click="execute(item)"
            >
              <span class="item-icon">{{ item.icon }}</span>
              <span class="item-copy">
                <strong>{{ item.label }}</strong>
                <small>{{ item.description }}</small>
              </span>
              <span class="item-kind">
                {{
                  item.type === 'action'
                    ? item.kindLabel || '操作'
                    : item.type === 'app'
                      ? '应用'
                      : '页面'
                }}
              </span>
            </button>

            <div v-if="results.length === 0" class="palette-empty">
              <span>○</span>
              <p>没有找到“{{ query }}”</p>
            </div>
          </div>

          <footer class="palette-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>↵</kbd> 打开 / 执行</span>
            <span class="palette-count">{{ results.length }} 项</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: min(15vh, 140px) 20px 20px;
  background: rgba(18, 22, 31, 0.45);
  backdrop-filter: blur(10px);
}

.palette-panel {
  width: min(680px, 100%);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border-light) 70%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  box-shadow: 0 30px 90px rgba(11, 18, 32, 0.3);
}

.palette-search {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-light);
}

.palette-mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent, #667eea), #764ba2);
  color: white;
  font-size: 17px;
  font-weight: 800;
}

.palette-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 18px;
}

kbd {
  display: inline-flex;
  min-width: 24px;
  height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font: 600 11px/1 var(--font-sans);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
}

.palette-results {
  max-height: min(52vh, 480px);
  overflow-y: auto;
  padding: 10px;
}

.palette-heading {
  padding: 5px 10px 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.palette-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 13px;
  padding: 11px 12px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.palette-item.selected {
  background: color-mix(in srgb, var(--accent, #667eea) 11%, var(--bg-hover));
}

.palette-item.disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.item-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border: 1px solid var(--border-light);
  border-radius: 11px;
  background: var(--bg-card);
  font-size: 19px;
}

.item-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.item-copy strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-copy small {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-kind {
  color: var(--text-secondary);
  font-size: 11px;
}

.palette-empty {
  display: grid;
  min-height: 170px;
  place-items: center;
  align-content: center;
  gap: 6px;
  color: var(--text-secondary);
}

.palette-empty span {
  font-size: 36px;
}

.palette-footer {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 11px 20px;
  border-top: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: 11px;
}

.palette-footer span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.palette-count {
  margin-left: auto;
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.18s ease;
}

.palette-enter-active .palette-panel,
.palette-leave-active .palette-panel {
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .palette-panel,
.palette-leave-to .palette-panel {
  transform: translateY(-14px) scale(0.98);
  opacity: 0;
}

@media (max-width: 640px) {
  .palette-backdrop {
    padding: 10px;
  }

  .palette-panel {
    border-radius: 18px;
  }

  .palette-results {
    max-height: calc(100dvh - 150px);
  }
}
</style>
