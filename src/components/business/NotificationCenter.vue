<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Drawer from '@/components/common/Drawer.vue'
import Popover from '@/components/common/Popover.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import NotificationBell from './NotificationBell.vue'
import NotificationPanel from './NotificationPanel.vue'

/**
 * 通知入口：只负责「何时开、挂在什么容器上」，内容与触发器各自独立成组件。
 *
 * 容器按视口二选一，因为这两种形态本质上是不同的交互范式：
 * - 宽屏是贴着铃铛展开的下拉浮层（非模态、无遮罩、不锁滚动）；
 * - 窄屏是带遮罩的贴底抽屉（模态语义、锁滚动）。
 * 硬把宽屏也做成抽屉，会让「点铃铛扫一眼通知」变成压暗整屏 + 锁死滚动，是倒退。
 */
defineOptions({ name: 'NotificationCenter' })

/**
 * 窄屏断点。
 *
 * 宽屏下拉面板锚在 36px 宽的铃铛上，而铃铛右侧还跟着登录下拉（用户名越长它越宽），
 * 340px 的面板会向左捅出屏幕（实测：375px 溢出 87px、320px 溢出 97px）。
 * 520px 是实测的安全边界：低于它改走贴底抽屉，左右各留 12px，不会再溢出。
 */
const COMPACT_QUERY = '(max-width: 520px)'

const route = useRoute()
const store = useNotificationStore()
const authStore = useAuthStore()

const isCompact = useMediaQuery(COMPACT_QUERY)
const isOpen = ref(false)

function open() {
  isOpen.value = true
  if (!store.isInitialized && !store.isLoading) void store.load()
}

function close() {
  isOpen.value = false
}

function toggle() {
  if (isOpen.value) close()
  else open()
}

/** Popover 是受控的：它只发出意图，开关状态始终由这里持有 */
function onOpenChange(value: boolean) {
  if (value) open()
  else close()
}

/**
 * 标签页重新可见时立刻补刷一次未读角标。
 *
 * 轮询（store.startPolling）在 `document.hidden` 时是主动跳过的，所以回到前台
 * 必须补这一次，否则角标最多会陈旧一个轮询周期。
 */
function onVisibilityChange() {
  if (document.hidden || !authStore.isAuthenticated) return
  void store.refreshUnread()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
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
  <div v-if="authStore.isAuthenticated" class="notification-center" @click.stop>
    <!-- 宽屏：触发器交给 Popover 的插槽，外部点击与 ESC 由 Popover 处理 -->
    <Popover v-if="!isCompact" :open="isOpen" align="end" @update:open="onOpenChange">
      <template #trigger="{ open: panelOpen, toggle: togglePanel }">
        <NotificationBell :open="panelOpen" @toggle="togglePanel" />
      </template>
      <NotificationPanel variant="popover" @close="close" />
    </Popover>

    <!-- 窄屏：抽屉不能包住触发器（点在遮罩上要能收起），所以铃铛与抽屉并列 -->
    <template v-else>
      <NotificationBell :open="isOpen" @toggle="toggle" />
      <Drawer
        side="bottom"
        :open="isOpen"
        :no-padding="true"
        aria-label="通知中心"
        :style="{ '--vc-drawer-max-h': 'min(72vh, 520px)' }"
        @close="close"
      >
        <NotificationPanel variant="sheet" @close="close" />
      </Drawer>
    </template>
  </div>
</template>

<style scoped>
/* 收紧到内容宽度：内部的 Popover 是块级元素，靠 flex 才不会被拉成满宽 */
.notification-center {
  display: flex;
}
</style>
