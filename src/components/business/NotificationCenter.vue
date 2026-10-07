<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import Skeleton from '@/components/common/Skeleton.vue'
import { useNotificationStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import {
  describeNotificationType,
  formatAbsoluteTime,
  formatRelativeTime,
  formatUnreadBadge,
  isSafeInternalLink,
  resolveNotificationLink,
  type AppNotification,
} from '@/lib/notification-format'

defineOptions({ name: 'NotificationCenter' })

/** 下拉面板只做「快速预览」，超过这个数量引导去通知中心页看全量 */
const PREVIEW_LIMIT = 6

const router = useRouter()
const route = useRoute()
const store = useNotificationStore()
const authStore = useAuthStore()
const { addToast } = useToast()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const isMarkingAll = ref(false)

const badgeText = computed(() => formatUnreadBadge(store.unreadCount))
const previewItems = computed(() => store.items.slice(0, PREVIEW_LIMIT))
const hasMoreThanPreview = computed(() => store.pagination.total > previewItems.value.length)
/** 首次打开还没拿到数据时才显示骨架，避免已有内容时闪一下 */
const showSkeleton = computed(() => store.isLoading && !store.isInitialized)
/**
 * 只有「首屏拉取失败」才用错误态顶掉空态。
 *
 * 判据绑 `isInitialized` 而不是 `items.length`：`loadError` 挂在共享 store 上，
 * 通知中心页的 loadMore 失败也会写它。若只看列表是否为空，一次陈旧错误就会把
 * 这里本来正确的空态顶掉。真正「一条都没成功拿到过」时才该显示错误。
 */
const showError = computed(() => Boolean(store.loadError) && !store.isInitialized)

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value && !store.isInitialized && !store.isLoading) void store.load()
}

function close() {
  isOpen.value = false
}

/** 面板内联重试：load() 会先清掉 loadError 再重新拉第一页 */
function retryLoad() {
  void store.load()
}

async function handleMarkAllRead() {
  if (isMarkingAll.value) return
  isMarkingAll.value = true
  try {
    const result = await store.markAllRead()
    addToast(result.ok ? 'success' : 'error', result.message)
  } finally {
    isMarkingAll.value = false
  }
}

function goToAll() {
  close()
  void router.push('/notifications')
}

/** 点击单条：先本地置已读（乐观），再跳转；跳转地址必须过站内白名单 */
function openItem(item: AppNotification) {
  if (!item.read) void store.markRead([item.id])
  const link = resolveNotificationLink(item)
  close()
  void router.push(isSafeInternalLink(link) ? link : '/notifications')
}

function onDocumentPointerDown(event: MouseEvent) {
  if (!isOpen.value) return
  const target = event.target as Node | null
  if (target && rootRef.value?.contains(target)) return
  close()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) close()
}

function onVisibilityChange() {
  if (document.hidden || !authStore.isAuthenticated) return
  void store.refreshUnread()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// 路由变化（含点击面板内的跳转）一律收起面板，避免跨页面残留浮层
watch(() => route.fullPath, close)

// 登出时根节点被 v-if 摘掉，但组件实例与 isOpen 都还在。不复位的话，
// 同一实例在重新登录后会带着上次打开的面板直接出现。
watch(
  () => authStore.isAuthenticated,
  (authenticated) => {
    if (!authenticated) close()
  },
)
</script>

<template>
  <div v-if="authStore.isAuthenticated" ref="rootRef" class="notification-center" @click.stop>
    <button
      class="bell-btn"
      :class="{ 'is-open': isOpen }"
      type="button"
      :aria-label="store.hasUnread ? `通知中心，${store.unreadCount} 条未读` : '通知中心'"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <span class="bell-icon" aria-hidden="true">🔔</span>
      <span v-if="badgeText" class="unread-badge">{{ badgeText }}</span>
    </button>

    <div v-if="isOpen" class="panel" role="dialog" aria-label="通知中心">
      <header class="panel-head">
        <div class="head-title">
          <strong>通知</strong>
          <span v-if="store.hasUnread" class="head-count">{{ store.unreadCount }} 条未读</span>
        </div>
        <div class="head-actions">
          <button
            v-if="store.hasUnread"
            class="link-btn"
            type="button"
            :disabled="isMarkingAll"
            @click="handleMarkAllRead"
          >
            全部已读
          </button>
          <button class="link-btn" type="button" @click="goToAll">全部通知</button>
        </div>
      </header>

      <div class="panel-body">
        <div v-if="showSkeleton" class="panel-skeleton">
          <Skeleton v-for="index in 3" :key="index" height="46" radius="10" />
        </div>

        <div v-else-if="showError" class="panel-error">
          <p class="panel-error-text">{{ store.loadError }}</p>
          <button class="retry-btn" type="button" @click="retryLoad">重试</button>
        </div>

        <EmptyState
          v-else-if="!store.items.length"
          icon="🔔"
          title="暂无通知"
          description="审核结果与评论回复会出现在这里"
        />

        <ul v-else class="notice-list">
          <li
            v-for="item in previewItems"
            :key="item.id"
            class="notice-item"
            :class="{ 'is-unread': !item.read }"
          >
            <button class="notice-hit" type="button" @click="openItem(item)">
              <span class="notice-icon" aria-hidden="true">
                {{ describeNotificationType(item.type).icon }}
              </span>
              <span class="notice-main">
                <span class="notice-title-row">
                  <span class="notice-title">{{ item.title }}</span>
                  <time class="notice-time" :title="formatAbsoluteTime(item.createdAt)">
                    {{ formatRelativeTime(item.createdAt) }}
                  </time>
                </span>
                <span v-if="item.body" class="notice-body">{{ item.body }}</span>
              </span>
              <span v-if="!item.read" class="notice-dot" aria-hidden="true"></span>
            </button>
          </li>
        </ul>
      </div>

      <footer v-if="hasMoreThanPreview" class="panel-foot">
        <button class="foot-btn" type="button" @click="goToAll">
          查看全部 {{ store.pagination.total }} 条
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.notification-center {
  position: relative;
}

.bell-btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: var(--bg-glass);
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.bell-btn:hover,
.bell-btn.is-open {
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.12);
}

.bell-icon {
  font-size: var(--font-size-title);
  line-height: 1;
}

.unread-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--danger);
  color: var(--text-inverse);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--bg-page);
}

.panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 340px;
  max-width: min(92vw, 340px);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-drawer);
  overflow: hidden;
  animation: noticeDropIn var(--transition-fast);
}

@keyframes noticeDropIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}

.head-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.head-title strong {
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
}

.head-count {
  color: var(--danger);
  font-size: var(--font-size-meta);
  white-space: nowrap;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.link-btn {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-size: var(--font-size-meta);
  cursor: pointer;
  white-space: nowrap;
  transition: opacity var(--transition-fast);
}

.link-btn:hover:not(:disabled) {
  opacity: 0.75;
}

.link-btn:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.panel-body {
  max-height: min(60vh, 420px);
  overflow-y: auto;
}

.panel-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
}

.panel-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
}

.panel-error-text {
  margin: 0;
  min-width: 0;
  color: var(--danger);
  font-size: var(--font-size-meta);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.retry-btn {
  flex: 0 0 auto;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--accent);
  font-size: var(--font-size-meta);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.retry-btn:hover {
  border-color: var(--accent-light);
  background: var(--accent-bg);
}

.notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-item + .notice-item {
  border-top: 1px solid var(--border-light);
}

.notice-item.is-unread {
  background: var(--accent-bg);
}

.notice-hit {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.notice-hit:hover {
  background: var(--bg-hover);
}

.notice-icon {
  flex: 0 0 auto;
  font-size: var(--font-size-body-lg);
  line-height: 1.4;
}

.notice-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notice-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.notice-title {
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-time {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: var(--font-size-2xs);
  white-space: nowrap;
}

.notice-body {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notice-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.panel-foot {
  border-top: 1px solid var(--border-light);
}

.foot-btn {
  width: 100%;
  padding: var(--space-3);
  border: none;
  background: none;
  color: var(--accent);
  font-size: var(--font-size-meta);
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.foot-btn:hover {
  background: var(--accent-bg);
}
</style>
