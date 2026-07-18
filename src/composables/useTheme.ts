import { ref } from 'vue'

// 全站唯一的主题状态（模块级单例）：后台与公开页共享同一份 isDark，
// 切换一处即全站生效；同时持久化到 localStorage，刷新不丢。
const isDark = ref(false)
let initialized = false

// ---- app 主题订阅通道 ----
// 供 app（系统内置 app / 市场上传 app）自愿消费：CSS 变量只能管样式，
// 而 app 用 canvas / ECharts / JS 决定的颜色够不到，需要在主题切换时收到通知去重绘。
type ThemeChangeCallback = (isDark: boolean) => void
const themeSubscribers = new Set<ThemeChangeCallback>()

function notifySubscribers(dark: boolean) {
  themeSubscribers.forEach((cb) => {
    try {
      cb(dark)
    } catch (e) {
      // 单个 app 回调报错不影响其他订阅者
      console.error('[theme] subscriber callback error:', e)
    }
  })
}

function applyTheme(dark: boolean) {
  const changed = isDark.value !== dark
  isDark.value = dark
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark)
  }
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  } catch {
    /* localStorage 不可用时忽略 */
  }
  if (changed) notifySubscribers(dark)
}

export function initTheme() {
  if (initialized) return isDark.value
  let dark = false
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') dark = true
    else if (saved === 'light') dark = false
    else dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    dark = false
  }
  applyTheme(dark)
  initialized = true
  return isDark.value
}

export function toggleTheme() {
  applyTheme(!isDark.value)
}

export function useTheme() {
  return { isDark, initTheme, toggleTheme }
}

/**
 * 暴露给 app 的运行时主题对象（opt-in）。
 *
 * app 想跟随深色模式就消费它，不想跟随就完全忽略——平台不强制。
 * 典型用途：app 内用 canvas / ECharts / JS 决定颜色时，CSS 变量够不到，
 * 靠 `isDark` 判断当前主题、靠 `onChange` 在切换时重绘。
 *
 * 两条触达通道指向同一个对象：
 *  - 系统 app（Vue 组件）：`inject('appTheme')`
 *  - 市场 app（运行时注入的 JS）：`window.__APP_THEME__`
 */
export interface AppTheme {
  /** 当前是否深色（实时读取，无需自己维护） */
  readonly isDark: boolean
  /**
   * 订阅主题切换。回调会在每次切换后收到最新的 isDark。
   * @returns 取消订阅函数（app 卸载时调用，避免泄漏）
   */
  onChange(cb: (isDark: boolean) => void): () => void
}

let appThemeSingleton: AppTheme | null = null

export function getAppTheme(): AppTheme {
  if (appThemeSingleton) return appThemeSingleton
  appThemeSingleton = {
    get isDark() {
      return isDark.value
    },
    onChange(cb: (isDark: boolean) => void) {
      themeSubscribers.add(cb)
      return () => {
        themeSubscribers.delete(cb)
      }
    },
  }
  return appThemeSingleton
}
