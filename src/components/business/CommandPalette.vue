<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { COMMAND_PALETTE_EVENT } from '@/lib/command-palette'

/**
 * 热键监听常驻入口，面板异步加载，加载期间的唤起状态由父组件保留。
 * 面板常驻挂载，以 open 控制显隐，保留离场动画。
 */
const CommandPalettePanel = defineAsyncComponent(() => import('./CommandPalettePanel.vue'))

const isOpen = ref(false)
const initialQuery = ref('')

function open(query = '') {
  initialQuery.value = query
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function handleOpenEvent(event: Event) {
  const detail = (event as CustomEvent<{ query?: string }>).detail
  open(detail?.query || '')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey) {
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (!isOpen.value) initialQuery.value = ''
      isOpen.value = !isOpen.value
    }
    return
  }
}

onMounted(() => {
  window.addEventListener(COMMAND_PALETTE_EVENT, handleOpenEvent)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener(COMMAND_PALETTE_EVENT, handleOpenEvent)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <CommandPalettePanel :open="isOpen" :initial-query="initialQuery" @close="close" />
</template>
