<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { RouteLoadingBar, MusicPlayer } from '@/components'

const router = useRouter()
const isRouteLoading = ref(false)

router.beforeEach((to, from, next) => {
  if (to.path !== from.path) {
    isRouteLoading.value = true
  }
  next()
})

router.afterEach(() => {
  setTimeout(() => {
    isRouteLoading.value = false
  }, 100)
})
</script>

<template>
  <div class="app">
    <RouteLoadingBar :loading="isRouteLoading" />
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <MusicPlayer />
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
