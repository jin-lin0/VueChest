import { ref, computed, onScopeDispose } from 'vue'

/**
 * 验证码倒计时：点击获取后 N 秒内禁用按钮并逐秒倒数。
 * 返回：
 *  - count：剩余秒数（0 表示未激活）
 *  - active：是否处于倒计时中
 *  - start：以给定秒数启动倒计时（默认 defaultSeconds）
 * 组件/作用域卸载时自动清理定时器。
 *
 * 剩余秒数一律由「截止时刻 − 当前墙钟」算出，而不是每收到一次定时器回调就减 1：
 * 标签页隐藏后浏览器会节流定时器（Chrome 88+ 在隐藏超过 5 分钟、链式回调计数 ≥5
 * 且页面静音 30 秒后，改为每分钟才检查一次，
 * https://developer.chrome.com/blog/timer-throttling-in-chrome-88）。
 * 按回调次数计数，会让「切到邮箱看一眼验证码再回来」的用户发现按钮仍然长时间禁用 ——
 * 服务端早已允许重发，界面却还在拦。同仓 MusicPlayer 的睡眠定时器用的就是这个写法。
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
