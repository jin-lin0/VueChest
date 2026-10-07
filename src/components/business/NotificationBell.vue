<script setup lang="ts">
import { computed } from 'vue'
import { formatUnreadBadge } from '@/lib/notification-format'
import { useNotificationStore } from '@/stores/notifications'

/**
 * 通知铃铛触发器。
 *
 * 独立成组件是因为它要在两种容器下复用：宽屏挂在 Popover 的触发位，
 * 窄屏与贴底抽屉并排（抽屉不能包住触发器）。两处外观与无障碍属性必须一致。
 */
defineOptions({ name: 'NotificationBell' })

defineProps<{ open: boolean }>()
defineEmits<{ toggle: [] }>()

const store = useNotificationStore()
const badgeText = computed(() => formatUnreadBadge(store.unreadCount))
</script>

<template>
  <button
    class="bell-btn"
    :class="{ 'is-open': open }"
    type="button"
    :aria-label="store.hasUnread ? `通知中心，${store.unreadCount} 条未读` : '通知中心'"
    :aria-expanded="open"
    aria-haspopup="dialog"
    @click="$emit('toggle')"
  >
    <span class="bell-icon" aria-hidden="true">🔔</span>
    <span v-if="badgeText" class="unread-badge">{{ badgeText }}</span>
  </button>
</template>

<style scoped>
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
</style>
