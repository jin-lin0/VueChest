<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOverlay } from '../../composables/useOverlay'
defineOptions({ name: 'VcDrawer', inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 是否打开（支持 v-model:open） */
    open: boolean
    returnFocus?: HTMLElement | null
    /** 滑出方向：left / right 为侧边抽屉，bottom 为贴底面板 */
    side?: 'left' | 'right' | 'bottom'
    /** 标题，留空则不显示标题栏（除非提供了 #header 插槽） */
    title?: string
    /**
     * 无障碍标签。未设置时退化为 title；再退化为按方向的默认文案。
     * 用于「需要给面板一个准确名字、但不想渲染标题栏」的场景。
     */
    ariaLabel?: string
    /**
     * 宽度：数字按 px，字符串原样（如 '82vw'、'min(360px, 88vw)'）。
     * 仅左右侧边抽屉生效；bottom 恒为整宽，高度请用 --vc-drawer-max-h 控制。
     */
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

// bottom 恒为整宽、高度自适应，此时 width 不参与内联样式（否则会覆盖 .bottom 的 width:100%）
const panelStyle = computed(() =>
  props.side === 'bottom'
    ? undefined
    : { width: typeof props.width === 'number' ? `${props.width}px` : props.width },
)
// 贴底面板沿用「侧边面板」做默认无障碍标签会误导读屏
const defaultLabel = computed(() => (props.side === 'bottom' ? '底部面板' : '侧边面板'))

const panel = ref<HTMLElement | null>(null)
const { close } = useOverlay({
  element: () => panel.value,
  returnFocus: () => props.returnFocus || null,
  isOpen: () => props.open,
  onClose: () => {
    emit('update:open', false)
    emit('close')
  },
})
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
          :class="side"
          :style="panelStyle"
          ref="panel"
          tabindex="-1"
          :aria-label="ariaLabel || title || defaultLabel"
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
          <!-- no-padding 必须挂在 body 上：CSS 规则是 .vc-drawer__body.no-padding。
               挂到外层 <aside> 上规则永远不命中，prop 会静默失效。 -->
          <div
            class="vc-drawer__body vc-scrollbar vc-scrollbar--thin"
            :class="{ 'no-padding': noPadding }"
          >
            <slot />
          </div>
          <footer v-if="$slots.footer" class="vc-drawer__footer">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.vc-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--vc-drawer-z, var(--z-drawer, 1000));
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
.vc-drawer.bottom {
  top: auto;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: auto;
  max-width: none;
  max-height: var(--vc-drawer-max-h, 85vh);
  border-top: 1px solid var(--border-light);
  border-radius: var(--vc-drawer-radius-bottom, 16px 16px 0 0);
}
/* 贴底面板的内容往往自带「头/体/脚」分段，让 body 成为 flex 容器，
   内容才能用 max-height:100% + 内部滚动自行分配高度，而不是把整块撑出视口 */
.vc-drawer.bottom .vc-drawer__body {
  display: flex;
  flex-direction: column;
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
  font-size: var(--font-size-body-lg);
  font-weight: 700;
  color: var(--text-primary);
}
.vc-drawer__close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-heading);
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
.vc-drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--vc-drawer-footer-gap, 12px);
  padding: var(--vc-drawer-footer-pad, 0.75rem 1rem);
  /* 贴底面板会在 iPhone 上压到 home indicator，这里补安全区 */
  padding-bottom: calc(var(--vc-drawer-footer-pad-b, 0.75rem) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
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
.vc-drawer-enter-from .vc-drawer.bottom,
.vc-drawer-leave-to .vc-drawer.bottom {
  transform: translateY(100%);
}

/* 减少动态偏好下只保留遮罩透明度过渡，不做位移 */
@media (prefers-reduced-motion: reduce) {
  .vc-drawer-enter-active .vc-drawer,
  .vc-drawer-leave-active .vc-drawer {
    transition: none;
  }
}
</style>
