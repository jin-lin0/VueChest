import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from 'vue'

/**
 * 响应式媒体查询。
 *
 * 初始值在 setup 阶段同步读出，而不是等 onMounted 再补——否则窄屏下会先按宽屏
 * 布局渲染一帧再切换，出现可见的闪烁。
 * SSR 安全：没有 matchMedia 时恒为 false。
 */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const mediaQueryList = supported ? window.matchMedia(query) : null
  const matches = ref(mediaQueryList?.matches ?? false)

  if (mediaQueryList) {
    const onChange = (event: MediaQueryListEvent) => {
      matches.value = event.matches
    }
    onMounted(() => mediaQueryList.addEventListener('change', onChange))
    onBeforeUnmount(() => mediaQueryList.removeEventListener('change', onChange))
  }

  return readonly(matches)
}
