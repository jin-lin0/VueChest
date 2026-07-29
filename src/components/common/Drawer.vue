<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 是否打开（支持 v-model:open） */
    open: boolean
    /** 滑出方向 */
    side?: 'left' | 'right'
    /** 标题，留空则不显示标题栏（除非提供了 #header 插槽） */
    title?: string
    /** 宽度：数字按 px，字符串原样（如 '82vw'、'min(360px, 88vw)'） */
    width?: string | number
    /** 强制暗色作用域（用于浮在浅色背景上仍需暗色的场景，如音乐播放器） */
    dark?: boolean
    /** 点击遮罩是否关闭 */
    closeOnOverlay?: boolean
    /** 是否显示关闭按钮 */
    showClose?: boolean
    /** 关闭按钮无障碍标签 */
    closeLabel?: string
    /** 内容区是否带默认内边距 */
    noPadding?: boolean
  }>(),
  {
    side: 'left',
    width: 320,
    dark: false,
    closeOnOverlay: true,
    showClose: true,
    closeLabel: '关闭',
    noPadding: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

function close() {
  emit('update:open', false)
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    e.stopPropagation()
    close()
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="vc-drawer">
      <div
        v-if="open"
        class="vc-drawer-overlay"
        :class="{ 'vc-dark': dark }"
        v-bind="$attrs"
        @click.self="closeOnOverlay && close()"
      >
        <aside
          class="vc-drawer"
          :class="[side, { 'no-padding': noPadding }]"
          :style="{ width: typeof width === 'number' ? width + 'px' : width }"
          role="dialog"
          aria-modal="true"
        >
          <header v-if="title || $slots.header" class="vc-drawer__header">
            <slot name="header">
              <span class="vc-drawer__title">{{ title }}</span>
            </slot>
            <button
              v-if="showClose"
              class="vc-drawer__close"
              type="button"
              :aria-label="closeLabel"
              @click="close"
            >
              &times;
            </button>
          </header>
          <div class="vc-drawer__body vc-scrollbar vc-scrollbar--thin">
            <slot />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.vc-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--vc-drawer-z, 1000);
  background: var(--vc-drawer-overlay, rgba(0, 0, 0, 0.45));
}
.vc-drawer {
  position: absolute;
  top: 0;
  height: 100%;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background: var(--vc-drawer-bg, var(--bg-card));
  border-radius: var(--vc-drawer-radius, 0);
  box-shadow: var(--vc-drawer-shadow, var(--shadow-lg));
}
.vc-drawer.left {
  left: 0;
  border-right: 1px solid var(--border-light);
}
.vc-drawer.right {
  right: 0;
  border-left: 1px solid var(--border-light);
}
.vc-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: var(--vc-drawer-header-pad, 0.75rem 1rem);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.vc-drawer__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.vc-drawer__close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
}
.vc-drawer__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.vc-drawer__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--vc-drawer-body-pad, 0.75rem 1rem);
}
.vc-drawer__body.no-padding {
  padding: 0;
}

/* 遮罩淡入 + 面板滑入 */
.vc-drawer-enter-active,
.vc-drawer-leave-active {
  transition: opacity 0.25s ease;
}
.vc-drawer-enter-active .vc-drawer,
.vc-drawer-leave-active .vc-drawer {
  transition: transform 0.25s ease;
}
.vc-drawer-enter-from,
.vc-drawer-leave-to {
  opacity: 0;
}
.vc-drawer-enter-from .vc-drawer.left,
.vc-drawer-leave-to .vc-drawer.left {
  transform: translateX(-100%);
}
.vc-drawer-enter-from .vc-drawer.right,
.vc-drawer-leave-to .vc-drawer.right {
  transform: translateX(100%);
}
</style>
