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
import { useCloudSyncStore } from '@/stores/cloudSync'
import { useWorkspaceStore } from '@/stores/workspace'
import { recordGameLaunchFromRoute } from '@/apps/game-center/profile'

const router = useRouter()
const MusicPlayer = defineAsyncComponent(() => import('@/components/business/MusicPlayer.vue'))
const authStore = useAuthStore()
const workspaceStore = useWorkspaceStore()
const cloudSyncStore = useCloudSyncStore()
const isRouteLoading = ref(false)
let syncUserRequest = 0

workspaceStore.init()

watch(
  () => authStore.user?.id,
  async (userId) => {
    const requestId = ++syncUserRequest
    if (!userId) {
      workspaceStore.switchToGuest()
      return
    }

    // auth 已在应用挂载前完成初始化。先同步恢复该用户的本地工作区，确保首页首帧
    // 不会短暂渲染访客默认顺序；云端选择与较新布局随后在后台对账。
    workspaceStore.switchToUser(userId)

    // 先读取账号保存的同步选择，再决定是否拉取工作区，避免用户取消某一类别后
    // 下一台设备仍在登录时自动覆盖本地数据。旧后端没有 /sync 时继续沿用工作区同步。
    try {
      await cloudSyncStore.fetchRemote()
    } catch {
      /* 保留本机同步选择 */
    }
    if (requestId !== syncUserRequest) return

    if (cloudSyncStore.selection.includes('workspace')) {
      await workspaceStore.syncWithServer(userId)
    } else {
      workspaceStore.switchToUser(userId)
    }
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
          <KeepAlive include="WorkspaceHomeView">
            <component :is="Component" />
          </KeepAlive>
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
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

button,
input,
select,
textarea {
  font-family: inherit;
}

@media (max-width: 768px) {
  body {
    font-size: var(--font-size-body);
  }
}

/* 路由过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

/* 默认 transition 会让新旧页面短暂同时占据普通文档流，导致返回首页时被离开页
   挤出正确位置。离开页改为覆盖淡出，新页面从首帧开始负责布局。 */
.fade-leave-active {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  pointer-events: none;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
