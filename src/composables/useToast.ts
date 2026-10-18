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

interface PendingToast {
  type: ToastType
  message: string
  duration?: number
}

/**
 * 宿主注册之前的提示先存这里，注册时补发。
 *
 * 为什么不能直接 `host?.addToast(...)` 丢掉：宿主是在 App.vue 的 `onMounted` 里注册的，
 * 而 `main.ts` 的 `bootstrap()` 在 `app.mount()` **之前**就 await 了 `initStorage()`、
 * `initAuth()` 等一堆初始化。这条时间差里发出的提示全部会被静默吞掉 ——
 * 偏偏这段时间最该被看见：本地数据库打不开、启动期鉴权失败，都是「不说话就等于没发生」
 * 的类型。丢掉的提示没有任何补救路径（用户看不到、日志里也没有），所以只能先存后补。
 */
const pending: PendingToast[] = []

/**
 * 挂起队列上限。超出后**丢弃新来的**、保留最早的：排队时最先出现的通常才是根因
 * （例如「数据库打不开」排在「某次写入失败」前面），把根因丢了只留症状等于没报。
 */
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
