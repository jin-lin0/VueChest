import { inject, onUnmounted, ref, watch, type InjectionKey, type Ref, type WatchSource } from 'vue'

/** 全局「实时转换」开关注入键（boolean ref，未注入时视为开启） */
export const REALTIME_KEY: InjectionKey<Ref<boolean>> = Symbol('devtoolbox:realtime')

/** 「注册当前工具的手动转换入口」注入键，供外壳「立即转换」按钮调用 */
export const REGISTER_KEY: InjectionKey<(fn: (() => void) | null) => void> = Symbol(
  'devtoolbox:register-converter',
)

export interface UseRealtimeOptions {
  /** 触发自动转换的响应式来源；变化时在开关开启时自动执行 `run`。省略则只注册「立即转换」入口。 */
  watch?: WatchSource | WatchSource[]
  /** 初次挂载即执行一次（仅当开关开启）。 */
  immediate?: boolean
  /** 深监听（用于对象 / 数组来源）。 */
  deep?: boolean
}

/**
 * 把 `run` 接入开发工具箱全局「实时转换」开关。
 *
 * - `run` 会在 `watch` 指定的来源变化时自动执行（仅当开关开启）；
 * - 同时把「未加门」的 `run` 注册给外壳「立即转换」按钮，关闭实时后可手动触发；
 * - 组件卸载时自动注销，避免泄漏到下一个工具。
 *
 * 业务组件里不再需要手写 `watch(...)` + `if (realtimeEnabled) run()`，
 * 一行 `useRealtime(run, { watch: [input, dir] })` 即可；带深监听用
 * `useRealtime(run, { watch: obj, deep: true })`，挂载即跑用 `{ immediate: true }`。
 */
export function useRealtime(run: () => void, options: UseRealtimeOptions = {}): void {
  const realtimeEnabled = inject<Ref<boolean>>(REALTIME_KEY, ref(true))
  const register = inject<(fn: (() => void) | null) => void>(REGISTER_KEY)

  if (register) {
    register(run)
    onUnmounted(() => register(null))
  }

  if (options.watch !== undefined) {
    watch(
      options.watch,
      () => {
        if (realtimeEnabled.value) run()
      },
      { immediate: options.immediate, deep: options.deep },
    )
  }
}
