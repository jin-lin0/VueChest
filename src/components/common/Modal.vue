<script setup lang="ts">
import { useOverlay } from '../../composables/useOverlay'
defineOptions({ name: 'VcModal', inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 是否打开（支持 v-model:open） */
    open: boolean
    /** 标题，留空则不显示标题栏（除非提供了 #header 插槽） */
    title?: string
    /** 宽度：数字按 px，字符串原样（如 'min(90vw, 720px)'） */
    width?: string | number
    /** 强制暗色作用域 */
    dark?: boolean
    /** 点击遮罩是否关闭 */
    closeOnOverlay?: boolean
    /** 是否显示关闭按钮 */
    showClose?: boolean
    /** 关闭按钮无障碍标签 */
    closeLabel?: string
  }>(),
  {
    width: 480,
    dark: false,
    closeOnOverlay: true,
    showClose: true,
    closeLabel: '关闭',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

const { close } = useOverlay({
  isOpen: () => props.open,
  onClose: () => {
    emit('update:open', false)
    emit('close')
  },
})
</script>

<template>
  <Teleport to="body">
    <Transition name="vc-modal">
      <div
        v-if="open"
        class="vc-modal-overlay"
        :class="{ 'vc-dark': dark }"
        v-bind="$attrs"
        @click.self="closeOnOverlay && close()"
      >
        <div
          class="vc-modal"
          :style="{ width: typeof width === 'number' ? width + 'px' : width }"
          role="dialog"
          aria-modal="true"
        >
          <header v-if="title || $slots.header" class="vc-modal__header">
            <slot name="header">
              <h2 class="vc-modal__title">{{ title }}</h2>
            </slot>
            <button
              v-if="showClose"
              class="vc-modal__close"
              type="button"
              :aria-label="closeLabel"
              @click="close"
            >
              &times;
            </button>
          </header>
          <div class="vc-modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="vc-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.vc-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--vc-modal-z, var(--z-modal, 1100));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--vc-modal-overlay-pad, 24px);
  background: var(--vc-modal-overlay, rgba(0, 0, 0, 0.5));
  backdrop-filter: var(--vc-modal-overlay-blur, blur(4px));
  -webkit-backdrop-filter: blur(4px);
}
.vc-modal {
  max-width: 100%;
  max-height: var(--vc-modal-max-h, 90vh);
  display: flex;
  flex-direction: column;
  background: var(--vc-modal-bg, var(--bg-card));
  border: var(--vc-modal-border, none);
  border-radius: var(--vc-modal-radius, 18px);
  box-shadow: var(--vc-modal-shadow, 0 20px 60px rgba(0, 0, 0, 0.2));
  overflow: hidden;
}
.vc-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: var(--vc-modal-header-pad, 24px 28px);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.vc-modal__title {
  margin: 0;
  font-size: var(--vc-modal-title-size, 20px);
  font-weight: 700;
  color: var(--text-primary);
}
.vc-modal__close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--vc-modal-close-font, 28px);
  line-height: 1;
  cursor: pointer;
  width: var(--vc-modal-close-size, 36px);
  height: var(--vc-modal-close-size, 36px);
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
}
.vc-modal__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.vc-modal__body {
  padding: var(--vc-modal-body-pad, 24px 28px);
  overflow: auto;
}
.vc-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--vc-modal-footer-gap, 12px);
  padding: var(--vc-modal-footer-pad, 16px 28px);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

/* 遮罩淡入 + 面板缩放上浮 */
.vc-modal-enter-active,
.vc-modal-leave-active {
  transition: opacity 0.2s ease;
}
.vc-modal-enter-active .vc-modal,
.vc-modal-leave-active .vc-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.vc-modal-enter-from,
.vc-modal-leave-to {
  opacity: 0;
}
.vc-modal-enter-from .vc-modal,
.vc-modal-leave-to .vc-modal {
  transform: translateY(-12px) scale(0.98);
  opacity: 0;
}
</style>
