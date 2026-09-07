import { nextTick, onBeforeUnmount, watch } from 'vue'

export interface UseOverlayOptions {
  isOpen: () => boolean
  /** 请求外层组件关闭，不直接修改受控状态。 */
  onClose: () => void
  onOpen?: () => void
  /** 打开时锁定页面滚动，默认开启，支持嵌套弹层。 */
  lockScroll?: boolean
  /** 弹层面板，用于约束键盘焦点。 */
  element?: () => HTMLElement | null
  /** 关闭后回到指定元素；未指定时回到打开前的焦点。 */
  returnFocus?: () => HTMLElement | null
}
export interface UseOverlayReturn {
  isOpen: () => boolean
  open: () => void
  close: () => void
}
const overlays: symbol[] = []
const scrollLocks = new Set<symbol>()
let previousOverflow = ''
const focusSelector =
  'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
function visible(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.inert) return false
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

/** 管理嵌套弹层的焦点、Esc 和滚动锁，兼容 Teleport 下拉菜单。 */
export function useOverlay(options: UseOverlayOptions): UseOverlayReturn {
  const { isOpen, onClose, onOpen, lockScroll = true } = options
  const id = Symbol('overlay')
  let registered = false
  let previousFocus: HTMLElement | null = null
  const topmost = () => overlays.at(-1) === id
  const close = () => onClose()
  const open = () => onOpen?.()
  function surfaces() {
    const root = options.element?.()
    if (!root) return []
    const portals = Array.from(
      document.querySelectorAll<HTMLElement>('[data-overlay-owner]'),
    ).filter((node) => {
      const owner = document.getElementById(node.dataset.overlayOwner || '')
      return owner && root.contains(owner)
    })
    return [root, ...portals]
  }
  const focusables = () =>
    surfaces()
      .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(focusSelector)))
      .filter((node) => node.tabIndex >= 0 && visible(node))
  function focusFirst() {
    const root = options.element?.()
    const target = root?.querySelector<HTMLElement>('[autofocus]') || focusables()[0] || root
    target?.focus({ preventScroll: true })
  }
  function onFocusIn(event: FocusEvent) {
    if (!topmost() || !options.element?.()) return
    if (!surfaces().some((root) => root.contains(event.target as Node))) focusFirst()
  }
  function onKeydown(event: KeyboardEvent) {
    if (!topmost() || !isOpen() || event.defaultPrevented || event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    } else if (event.key === 'Tab' && options.element?.()) {
      const items = focusables()
      const index = items.indexOf(document.activeElement as HTMLElement)
      event.preventDefault()
      if (!items.length) {
        options.element()?.focus()
        return
      }
      const next =
        index < 0
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length
      items[next].focus()
    }
  }
  function release() {
    if (!registered) return
    registered = false
    const wasTop = topmost()
    overlays.splice(overlays.indexOf(id), 1)
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener('focusin', onFocusIn)
    if (scrollLocks.delete(id) && !scrollLocks.size) document.body.style.overflow = previousOverflow
    const target = options.returnFocus?.() || previousFocus
    if (wasTop && target?.isConnected) {
      void nextTick(() => {
        if (!registered && target.isConnected) target.focus({ preventScroll: true })
      })
    }
  }
  watch(
    isOpen,
    (value) => {
      if (!value) {
        release()
        return
      }
      if (registered) return
      registered = true
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      overlays.push(id)
      if (lockScroll) {
        if (!scrollLocks.size) previousOverflow = document.body.style.overflow
        scrollLocks.add(id)
        document.body.style.overflow = 'hidden'
      }
      window.addEventListener('keydown', onKeydown)
      document.addEventListener('focusin', onFocusIn)
      void nextTick(() => {
        if (registered && topmost()) focusFirst()
      })
    },
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(release)
  return { isOpen, open, close }
}
