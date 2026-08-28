<template>
  <div
    class="skeleton"
    :class="{ 'skeleton-text': text, 'skeleton-circle': circle }"
    :style="style"
  ></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'VcSkeleton' })

const props = withDefaults(
  defineProps<{
    width?: string | number
    height?: string | number
    radius?: string | number
    text?: boolean
    circle?: boolean
    block?: boolean
  }>(),
  { width: '100%', height: 16, radius: 6, text: false, circle: false, block: true },
)

const style = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  borderRadius:
    props.circle || typeof props.radius === 'number'
      ? props.circle
        ? '50%'
        : `${props.radius}px`
      : props.radius,
  display: props.block ? 'block' : 'inline-block',
}))
</script>

<style scoped>
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-subtle) 25%,
    var(--bg-hover) 37%,
    var(--bg-subtle) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

.skeleton-text {
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
