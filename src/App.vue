<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { APP_MODULES } from '@/config'
import RouteLoadingBar from '@/components/common/RouteLoadingBar.vue'
import Toast from '@/components/common/Toast.vue'
import CommandPalette from '@/components/business/CommandPalette.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { registerToastHost } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'
import { recordGameLaunchFromRoute } from '@/apps/game-center/profile'

const router = useRouter()
const MusicPlayer = defineAsyncComponent(() => import('@/components/business/MusicPlayer.vue'))
const authStore = useAuthStore()
const workspaceStore = useWorkspaceStore()
const isRouteLoading = ref(false)

workspaceStore.init()

watch(
  () => authStore.user?.id,
  (userId) => {
    if (userId) void workspaceStore.syncWithServer(userId)
    else workspaceStore.switchToGuest()
  },
  { immediate: true },
)

// 全局唯一 Toast 宿主：注册后任意组件都能用 useToast().addToast(...) 弹提示
const toastHost = ref<InstanceType<typeof Toast> | null>(null)
onMounted(() => registerToastHost(toastHost.value))

router.beforeEach((to, from, next) => {
  if (to.path !== from.path) {
    isRouteLoading.value = true
  }
  next()
})

router.afterEach((to) => {
  setTimeout(() => {
    isRouteLoading.value = false
  }, 100)

  const builtin = APP_MODULES.find((app) => app.route === to.path)
  if (builtin) workspaceStore.recordRecent(`builtin:${builtin.id}`)
  else if (to.name === 'market-installed' && Number(to.params.id)) {
    workspaceStore.recordRecent(`market:${Number(to.params.id)}`)
  }
  recordGameLaunchFromRoute(to.path)
})
</script>

<template>
  <div class="app">
    <RouteLoadingBar :loading="isRouteLoading" />
    <Toast ref="toastHost" />
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <!-- 注意：此处不能用 mode="out-in"。
             mode="out-in" 与 Vue Router 的异步懒加载路由组件（() => import(...)）存在已知冲突：
             浏览器返回（popstate）时，离开阶段的 transition 会永久卡死，导致新组件（如首页）永远不挂载，
             页面只剩白屏（/rhythm、/music 等路由尤为触发）。改用默认模式即可彻底规避。 -->
        <transition name="fade">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <MusicPlayer />
    <CommandPalette />
    <ConfirmDialog />
  </div>
</template>

<style>
/* 全局样式 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--bg-page);
  color: var(--text-body);
  line-height: 1.6;
  overflow-x: hidden;
}

/* App-shell：内容区是唯一的滚动容器，播放条作为 flex 兄弟节点钉在底部。
   预留空间只在根布局发生一次，各页面完全不需要感知音乐的存在（无需注入 store / 维护路由清单）。 */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

button,
input,
select,
textarea {
  font-family: inherit;
}

@media (max-width: 768px) {
  body {
    font-size: 14px;
  }
}

/* 路由过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
