import { reactive } from 'vue'

// 模块级响应式状态：全局只有一个确认弹窗实例。
// 调用 confirm(message) 会返回一个 Promise，用户点击「确定」resolve(true)，「取消」/遮罩/ESC resolve(false)。
interface ConfirmState {
  visible: boolean
  message: string
  resolve: ((value: boolean) => void) | null
}

const state = reactive<ConfirmState>({
  visible: false,
  message: '',
  resolve: null,
})

/**
 * 在业务组件中调用，弹出一个全局确认框。
 * const ok = await confirm('确定删除？'); if (!ok) return;
 */
export function useConfirm() {
  function confirm(message: string): Promise<boolean> {
    state.resolve?.(false)
    state.message = message
    state.visible = true
    return new Promise<boolean>((resolve) => {
      state.resolve = resolve
    })
  }
  return { confirm }
}

// 仅供 ConfirmDialog.vue 内部使用，处理按钮回调。
export function useConfirmController() {
  function handleConfirm() {
    state.visible = false
    state.resolve?.(true)
    state.resolve = null
  }

  function handleCancel() {
    state.visible = false
    state.resolve?.(false)
    state.resolve = null
  }

  return { state, handleConfirm, handleCancel }
}
