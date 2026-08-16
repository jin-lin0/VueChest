import { ref, computed, onScopeDispose } from 'vue'

/**
 * 验证码倒计时：点击获取后 N 秒内禁用按钮并逐秒倒数。
 * 返回：
 *  - count：剩余秒数（0 表示未激活）
 *  - active：是否处于倒计时中
 *  - start：以给定秒数启动倒计时（默认 defaultSeconds）
 * 组件/作用域卸载时自动清理定时器。
 */
export function useCountdown(defaultSeconds = 60) {
  const count = ref(0)
  const active = computed(() => count.value > 0)
  let timer: ReturnType<typeof setInterval> | null = null

  function clear() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(seconds = defaultSeconds) {
    clear()
    count.value = seconds
    timer = setInterval(() => {
      count.value -= 1
      if (count.value <= 0) {
        count.value = 0
        clear()
      }
    }, 1000)
  }

  onScopeDispose(clear)
  return { count, active, start }
}
