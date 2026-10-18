// 全局 Toast 入口，转发到已注册的宿主实例。

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastHost {
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: number) => void
}

// 模块级单例引用，由 App.vue 的 Toast 宿主在挂载时注册。
let host: ToastHost | null = null

interface PendingToast {
  type: ToastType
  message: string
  duration?: number
}

/** 启动可能早于 Toast 宿主挂载，注册前的提示按顺序补发。 */
const pending: PendingToast[] = []

/** 队列满时保留较早提示，避免后续错误挤掉首个故障。 */
const MAX_PENDING = 20

/** 仅供 App.vue 挂载全局 Toast 宿主时调用。 */
export function registerToastHost(instance: ToastHost | null) {
  host = instance
  if (!host) return
  // 按产生顺序补发，避免「先因后果」被倒过来；补发不是递归调用 addToast，
  // 所以补发过程中新产生的提示会走正常路径，不会插队到队列前面。
  const queued = pending.splice(0, pending.length)
  for (const toast of queued) {
    host.addToast(toast.type, toast.message, toast.duration)
  }
}

/**
 * 在任意组件中弹出全局提示：
 * const { addToast } = useToast(); addToast('error', '解析失败')
 */
export function useToast() {
  function addToast(type: ToastType, message: string, duration?: number) {
    if (host) {
      host.addToast(type, message, duration)
      return
    }
    if (pending.length < MAX_PENDING) {
      pending.push({ type, message, duration })
    }
  }

  function removeToast(id: number) {
    host?.removeToast(id)
  }

  return { addToast, removeToast }
}
