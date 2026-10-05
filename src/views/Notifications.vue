<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import Skeleton from '@/components/common/Skeleton.vue'
import { useNotificationStore } from '@/stores/notifications'
import { useToast } from '@/composables/useToast'
import {
  describeNotificationType,
  formatAbsoluteTime,
  formatRelativeTime,
  isSafeInternalLink,
  resolveNotificationLink,
  type AppNotification,
} from '@/lib/notification-format'

// 文件名是单个单词，显式声明多词组件名以满足 vue/multi-word-component-names
defineOptions({ name: 'NotificationsView' })

const router = useRouter()
const store = useNotificationStore()
const { addToast } = useToast()

const markingAll = ref(false)
/** 记录正在删除的 id，避免用户连点两次发出两个删除请求 */
const removingId = ref<number | null>(null)

const subtitle = computed(() => {
  if (store.isLoading && !store.isInitialized) return '正在加载…'
  if (store.unreadOnly) return `${store.pagination.total} 条未读通知`
  if (store.hasUnread) return `共 ${store.pagination.total} 条 · ${store.unreadCount} 条未读`
  return `共 ${store.pagination.total} 条`
})

function goBack() {
  // 直接访问 /notifications 时没有上一页，回首页而不是退出站点
  if (window.history.length > 1) router.back()
  else void router.push('/')
}

function openItem(item: AppNotification) {
  if (!item.read) void store.markRead([item.id])
  const link = resolveNotificationLink(item)
  if (isSafeInternalLink(link)) void router.push(link)
}

async function handleMarkAllRead() {
  if (markingAll.value) return
  markingAll.value = true
  try {
    const result = await store.markAllRead()
    addToast(result.ok ? 'success' : 'error', result.message)
  } finally {
    markingAll.value = false
  }
}

async function handleRemove(item: AppNotification) {
  if (removingId.value !== null) return
  removingId.value = item.id
  try {
    const result = await store.remove(item.id)
    addToast(result.ok ? 'success' : 'error', result.message)
  } finally {
    removingId.value = null
  }
}

function toggleUnreadOnly() {
  void store.setUnreadOnly(!store.unreadOnly)
}

onMounted(() => {
  void store.load()
})
</script>

<template>
  <div class="notifications-page">
    <header class="page-head">
      <button class="back-btn" type="button" @click="goBack">← 返回</button>
      <div class="head-copy">
        <h1>通知中心</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div class="head-actions">
        <button
          class="ghost-btn"
          type="button"
          :class="{ 'is-active': store.unreadOnly }"
          @click="toggleUnreadOnly"
        >
          只看未读
        </button>
        <button
          class="primary-btn"
          type="button"
          :disabled="markingAll || !store.hasUnread"
          @click="handleMarkAllRead"
        >
          {{ markingAll ? '处理中…' : '全部已读' }}
        </button>
      </div>
    </header>

    <p v-if="store.loadError" class="error-line">{{ store.loadError }}</p>

    <div v-if="store.isLoading && !store.isInitialized" class="list-skeleton">
      <Skeleton v-for="index in 5" :key="index" height="64" radius="12" />
    </div>

    <EmptyState
      v-else-if="!store.items.length"
      icon="🔔"
      :title="store.unreadOnly ? '没有未读通知' : '暂无通知'"
      :description="
        store.unreadOnly ? '切换回「全部通知」可以看到历史消息' : '审核结果与评论回复会出现在这里'
      "
    />

    <ul v-else class="notice-list">
      <li
        v-for="item in store.items"
        :key="item.id"
        class="notice-card"
        :class="{ 'is-unread': !item.read }"
      >
        <button class="card-hit" type="button" @click="openItem(item)">
          <span class="card-icon" aria-hidden="true">
            {{ describeNotificationType(item.type).icon }}
          </span>
          <span class="card-main">
            <span class="card-title-row">
              <span class="card-type">{{ describeNotificationType(item.type).label }}</span>
              <time class="card-time" :title="formatAbsoluteTime(item.createdAt)">
                {{ formatRelativeTime(item.createdAt) }}
              </time>
            </span>
            <span class="card-title">{{ item.title }}</span>
            <span v-if="item.body" class="card-body">{{ item.body }}</span>
          </span>
          <span v-if="!item.read" class="card-dot" aria-hidden="true"></span>
        </button>
        <button
          class="remove-btn"
          type="button"
          aria-label="删除该通知"
          :disabled="removingId !== null"
          @click.stop="handleRemove(item)"
        >
          ×
        </button>
      </li>
    </ul>

    <div v-if="store.pagination.hasMore && store.items.length" class="load-more">
      <button
        class="ghost-btn"
        type="button"
        :disabled="store.isLoadingMore"
        @click="store.loadMore()"
      >
        {{ store.isLoadingMore ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.notifications-page {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-8);
}

.page-head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.back-btn {
  flex: 0 0 auto;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.back-btn:hover {
  border-color: var(--accent-light);
  color: var(--accent);
}

.head-copy {
  flex: 1;
  min-width: 0;
}

.head-copy h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-title-lg);
}

.head-copy p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-meta);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.primary-btn,
.ghost-btn {
  padding: 0.42rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-meta);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.primary-btn {
  border: 1px solid transparent;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.primary-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
}

.ghost-btn:hover:not(:disabled) {
  border-color: var(--accent-light);
  color: var(--accent);
}

.ghost-btn.is-active {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 600;
}

.ghost-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.error-line {
  margin: 0 0 var(--space-4);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: var(--font-size-meta);
}

.list-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.notice-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-card {
  position: relative;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  transition: border-color var(--transition-fast);
}

.notice-card:hover {
  border-color: var(--accent-light);
}

.notice-card.is-unread {
  border-left: 3px solid var(--accent);
}

.card-hit {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-4) 2.2rem var(--space-4) var(--space-4);
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-md);
}

.card-icon {
  flex: 0 0 auto;
  font-size: var(--font-size-title);
  line-height: 1.35;
}

.card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.card-type {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--tag-bg);
  color: var(--text-secondary);
  font-size: var(--font-size-2xs);
}

.card-time {
  color: var(--text-muted);
  font-size: var(--font-size-2xs);
}

.card-title {
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: 600;
  line-height: 1.5;
}

.card-body {
  color: var(--text-secondary);
  font-size: var(--font-size-meta);
  line-height: 1.55;
  white-space: pre-wrap;
}

.card-dot {
  position: absolute;
  top: var(--space-4);
  right: 2.2rem;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.remove-btn {
  position: absolute;
  top: 50%;
  right: var(--space-3);
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: var(--radius-full);
  background: none;
  color: var(--text-dim);
  font-size: var(--font-size-body-lg);
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.remove-btn:hover:not(:disabled) {
  background: var(--danger-bg);
  color: var(--danger);
}

.remove-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-5);
}

@media (max-width: 640px) {
  .page-head {
    flex-wrap: wrap;
  }

  .head-actions {
    width: 100%;
  }

  .head-actions .ghost-btn,
  .head-actions .primary-btn {
    flex: 1;
  }
}
</style>
