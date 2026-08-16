import { onBeforeUnmount, watch } from 'vue'

export interface UseOverlayOptions {
  /** 受控的 open 状态读取（组件传 () => props.open） */
  isOpen: () => boolean
  /** 请求关闭时调用（组件传 () => { emit('update:open', false); emit('close') }） */
  onClose: () => void
  /** 请求打开时调用（可选，受控组件通常不需要） */
  onOpen?: () => void
  /** 打开时是否锁定 body 滚动，默认 true */
  lockScroll?: boolean
}

export interface UseOverlayReturn {
  /** 当前 open 状态读取器 */
  isOpen: () => boolean
  /** 请求打开 */
  open: () => void
  /** 请求关闭 */
  close: () => void
}

/**
 * Modal / Drawer 共用的浮层逻辑：
 * - Esc 键关闭（仅在 open 时绑定监听，关闭时解绑）
 * - 打开时锁定 document.body 滚动，关闭时复原
 * - 组件卸载时清理监听与滚动锁
 *
 * 组件为受控模式：open 由外部 prop 决定，close() 通过 onClose 回调
 * 向上 emit update:open=false 与 close 事件，自身不维护 open ref。
 */
export function useOverlay(options: UseOverlayOptions): UseOverlayReturn {
  const { isOpen, onClose, onOpen, lockScroll = true } = options

  function close() {
    onClose()
  }

  function open() {
    onOpen?.()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation()
      close()
    }
  }

  function lockBody() {
    if (lockScroll) document.body.style.overflow = 'hidden'
  }

  function unlockBody() {
    if (lockScroll) document.body.style.overflow = ''
  }

  watch(
    () => isOpen(),
    (v) => {
      if (v) {
        window.addEventListener('keydown', onKeydown)
        lockBody()
      } else {
        window.removeEventListener('keydown', onKeydown)
        unlockBody()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    unlockBody()
  })

  return { isOpen, open, close }
}
