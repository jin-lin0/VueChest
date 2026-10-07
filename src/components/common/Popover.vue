<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 锚定式下拉浮层（非模态）。
 *
 * 与 Modal / Drawer 的分工：
 * - Modal / Drawer 是模态层，复用 useOverlay，管焦点困焦与滚动锁；
 * - Popover 是「贴着触发器展开」的轻量浮层，刻意不做困焦、不锁滚动——
 *   下拉菜单把焦点困住会让用户 Tab 不出去，锁滚动则会打断页面浏览。
 *   它只负责两件事：点外部收起、ESC 收起。
 */
defineOptions({ name: 'VcPopover' })

const props = withDefaults(
  defineProps<{
    /** 是否打开（支持 v-model:open） */
    open: boolean
    /** 面板相对触发器的水平对齐方向 */
    align?: 'start' | 'end'
  }>(),
  {
    align: 'end',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

const rootRef = ref<HTMLElement | null>(null)

function close() {
  emit('update:open', false)
  emit('close')
}

function toggle() {
  emit('update:open', !props.open)
}

/**
 * 「点外部收起」以组件根为豁免范围：触发器与面板都渲染在根内，
 * 所以点触发器不会被判成外部，否则会与触发器的 toggle 撞成「先关后开」。
 */
function onDocumentMouseDown(event: MouseEvent) {
  if (!props.open) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (rootRef.value?.contains(target)) return
  close()
}

/**
 * document 上的 keydown 会继续冒泡到 window（useOverlay 在那里监听），
 * 因此这里 stopPropagation 可以避免同一次 ESC 连带关掉外层抽屉。
 * 未打开时直接返回，不拦截——否则会挡住外层弹层的 ESC。
 */
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.open) return
  event.stopPropagation()
  close()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="rootRef" class="vc-popover">
    <slot name="trigger" :open="open" :toggle="toggle" :close="close" />
    <div v-if="open" class="vc-popover__panel" :class="`align-${align}`">
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped>
.vc-popover {
  position: relative;
}

/* 只负责定位：背景、宽度、阴影由内容组件自带，避免两处争抢同一组视觉属性 */
.vc-popover__panel {
  position: absolute;
  top: calc(100% + 6px);
  z-index: var(--vc-popover-z, var(--z-drawer, 1000));
  animation: vcPopoverIn var(--transition-fast, 0.15s ease);
}

.vc-popover__panel.align-end {
  right: 0;
}

.vc-popover__panel.align-start {
  left: 0;
}

@keyframes vcPopoverIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vc-popover__panel {
    animation: none;
  }
}
</style>
