<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { COMMAND_PALETTE_EVENT } from '@/lib/command-palette'

/**
 * 全局命令面板的**热键壳**：只负责常驻监听 Cmd/Ctrl+K 与 openCommandPalette() 事件，
 * 真正的面板（命令目录、App 快捷操作、文档检索、键盘导航）在 CommandPalettePanel.vue 里，
 * 通过 defineAsyncComponent 懒加载。
 *
 * 为什么拆：面板是入口 chunk 里最大的单个组件（约 16.8KB 未压缩）。它只在用户主动唤起时
 * 才有用，却一直挤在首屏关键路径上，而入口 gzip 预算本就贴着上限。拆开后面板变成独立 chunk，
 * 在应用挂载后随即加载、不阻塞首帧。
 *
 * 为什么不直接把整个 CommandPalette 换成 defineAsyncComponent：那样 Cmd/Ctrl+K 的监听会
 * 跟着面板一起被推迟，chunk 落地前的几百毫秒里热键是哑的（首页「打开全局搜索」按钮触发的
 * 自定义事件同样会丢）。热键必须由入口里的壳常驻，面板晚到不影响唤起。
 *
 * 面板常驻挂载、只由 `open` prop 驱动显隐，<Transition> 的入场/离场动画与拆分前完全一致。
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
