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
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
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

