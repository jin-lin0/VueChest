import { onScopeDispose } from 'vue'

/** 新请求替代旧请求，作用域销毁时取消；异步结果写入前仍需检查 isCurrent。 */
export function useLatestRequest() {
  let active: AbortController | null = null

  function cancel() {
    active?.abort()
    active = null
  }

  function start() {
    cancel()
    const controller = new AbortController()
    active = controller
    return {
      signal: controller.signal,
      isCurrent: () => active === controller && !controller.signal.aborted,
      finish: () => {
        if (active === controller) active = null
      },
    }
  }

  onScopeDispose(cancel)
  return { start, cancel }
}
