import { ref, computed, onScopeDispose } from 'vue'

/**
 * 验证码重发倒计时：按截止时刻计算剩余秒数，避免后台节流延长禁用时间。
 * 组件作用域卸载时清理定时器。
 */
export function useCountdown(defaultSeconds = 60) {
  const count = ref(0)
  const active = computed(() => count.value > 0)
  let timer: ReturnType<typeof setInterval> | null = null
  // 截止时刻（毫秒）；null 表示未激活
  let endsAt: number | null = null

  // 页面重新可见时立刻结算一次：节流下最后一次回调可能已是 1 分钟前的事，
  // 只等下一次唤醒会让用户看到一个明显过时的「N 秒后重发」。
  const onVisibilityChange = () => tick()

  function attachVisibilitySync() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function detachVisibilitySync() {
    if (typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function clear() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    detachVisibilitySync()
    endsAt = null
  }

  function tick() {
    count.value = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    if (count.value <= 0) {
      count.value = 0
      clear()
    }
  }

  function start(seconds = defaultSeconds) {
    clear()
    count.value = seconds
    endsAt = Date.now() + seconds * 1000
    attachVisibilitySync()
    timer = setInterval(tick, 1000)
  }

  onScopeDispose(clear)
  return { count, active, start }
}
