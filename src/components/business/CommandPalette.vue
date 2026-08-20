<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { APP_MODULES } from '@/config'
import { useAuthStore, useMarketStore, useWorkspaceStore } from '@/stores'
import { COMMAND_PALETTE_EVENT } from '@/lib/command-palette'

interface CommandItem {
  id: string
  type: 'app' | 'navigation'
  label: string
  description: string
  icon: string
  route: string
  appKey?: string
  keywords: string
}

const router = useRouter()
const authStore = useAuthStore()
const marketStore = useMarketStore()
const workspaceStore = useWorkspaceStore()

const isOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

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
  return entries
})

const allCommands = computed(() => [...appCommands.value, ...navigationCommands.value])

const results = computed(() => {
  const text = query.value.trim().toLowerCase()
  if (text) {
    return allCommands.value
      .filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(text))
      .slice(0, 14)
  }

  const recent = new Map(
    workspaceStore.config.recentApps.map((item, index) => [item.appKey, index]),
  )

  const apps = [...appCommands.value].sort((a, b) => {
    return (recent.get(a.appKey || '') ?? 999) - (recent.get(b.appKey || '') ?? 999)
  })
  return [...apps.slice(0, 9), ...navigationCommands.value].slice(0, 14)
})

const open = (initialQuery = '') => {
  query.value = initialQuery
  selectedIndex.value = 0
  isOpen.value = true
  nextTick(() => inputRef.value?.focus())
}

const close = () => {
  isOpen.value = false
  query.value = ''
}

const execute = (item: CommandItem | undefined) => {
  if (!item) return
  if (item.appKey) workspaceStore.recordRecent(item.appKey)
  close()
  router.push(item.route)
}

const handleOpenEvent = (event: Event) => {
  const detail = (event as CustomEvent<{ query?: string }>).detail
  open(detail?.query || '')
}

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    isOpen.value ? close() : open()
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
    execute(results.value[selectedIndex.value])
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
              placeholder="搜索应用或页面…"
              autocomplete="off"
              aria-label="搜索命令"
            />
            <kbd>ESC</kbd>
          </div>

          <div class="palette-results">
            <p class="palette-heading">{{ query ? '搜索结果' : '快速打开' }}</p>
            <button
              v-for="(item, index) in results"
              :key="item.id"
              class="palette-item"
              :class="{ selected: selectedIndex === index }"
              @mouseenter="selectedIndex = index"
              @click="execute(item)"
            >
              <span class="item-icon">{{ item.icon }}</span>
              <span class="item-copy">
                <strong>{{ item.label }}</strong>
                <small>{{ item.description }}</small>
              </span>
              <span class="item-kind">{{ item.type === 'app' ? '应用' : '页面' }}</span>
            </button>

            <div v-if="results.length === 0" class="palette-empty">
              <span>○</span>
              <p>没有找到“{{ query }}”</p>
            </div>
          </div>

          <footer class="palette-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>↵</kbd> 打开</span>
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
  transition: transform 0.18s ease, opacity 0.18s ease;
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
