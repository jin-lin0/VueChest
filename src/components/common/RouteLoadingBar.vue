<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    loading?: boolean
  }>(),
  {
    loading: false,
  },
)

const progress = ref(0)
const visible = ref(false)
let animationFrame: number | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null
let isNavigating = false

const startTracking = () => {
  isNavigating = true
  progress.value = 0
  visible.value = true

  animateProgress()
}

const animateProgress = () => {
  if (!isNavigating) return

  if (progress.value < 90) {
    const increment = Math.random() * 2
    progress.value = Math.min(progress.value + increment, 90)
  }

  animationFrame = requestAnimationFrame(animateProgress)
}

const completeProgress = () => {
  isNavigating = false

  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  progress.value = 100

  hideTimeout = setTimeout(() => {
    visible.value = false
    progress.value = 0
  }, 300)
}

watch(
  () => props.loading,
  (newVal) => {
    if (newVal) {
      startTracking()
    } else {
      completeProgress()
    }
  },
)

onMounted(() => {
  if (props.loading) {
    startTracking()
  }
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
  }
})
</script>

<template>
  <Transition name="loading-bar">
    <div v-if="visible" class="route-loading-bar">
      <div class="progress-bar" :style="{ width: progress + '%' }"></div>
      <div class="progress-glow"></div>
    </div>
  </Transition>
</template>

<style scoped>
.route-loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #67c23a);
  transition: width 0.3s ease-out;
  position: relative;
}

.progress-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: glow 1.5s infinite;
}

@keyframes glow {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.loading-bar-enter-active,
.loading-bar-leave-active {
  transition: opacity 0.3s ease;
}

.loading-bar-enter-from,
.loading-bar-leave-to {
  opacity: 0;
}
</style>
