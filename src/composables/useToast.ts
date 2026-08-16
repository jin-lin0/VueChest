// 全局 Toast 单例：业务组件不再各自持有 Toast 状态与模板，
// 统一 `const { addToast } = useToast()` 调用挂在 App.vue 上的唯一宿主实例。
// 宿主即 components/common/Toast.vue（自带 3s 自动消失计时），此处只做转发。

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastHost {
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: number) => void
}

// 模块级单例引用，由 App.vue 的 Toast 宿主在挂载时注册。
let host: ToastHost | null = null

/** 仅供 App.vue 挂载全局 Toast 宿主时调用。 */
export function registerToastHost(instance: ToastHost | null) {
  host = instance
}

/**
 * 在任意组件中弹出全局提示：
 * const { addToast } = useToast(); addToast('error', '解析失败')
 */
export function useToast() {
  function addToast(type: ToastType, message: string, duration?: number) {
    host?.addToast(type, message, duration)
  }

  function removeToast(id: number) {
    host?.removeToast(id)
  }

  return { addToast, removeToast }
}
