import type { Component } from 'vue'

export interface MarketAppMeta {
  name: string
  icon: string
  description: string
  version?: string
}

export interface MarketAppDefinition {
  component: Component
  route: string
  meta: MarketAppMeta
}

// 运行时注入的 bundle 在 window.MarketApp 上挂载的定义（字段均为可选，需校验）
interface RawMarketBundle {
  default?: RawMarketBundle
  component?: Component
  route?: string
  meta?: MarketAppMeta
}

// 注入 bundle 脚本并取出挂载在 window.MarketApp 上的定义。
// extractMetaFromBundle 与 loadMarketApp 共用，避免重复注入逻辑。
function runBundle(code: string): MarketAppDefinition | null {
  const w = window as unknown as { MarketApp?: RawMarketBundle }
  // 注入前先清除上一轮的残留定义，防止上一个 App 的定义被本轮误读（串号）
  delete w.MarketApp

  const script = document.createElement('script')
  script.textContent = code
  try {
    // 同步执行：bundle 会在 window.MarketApp 上挂载定义
    document.head.appendChild(script)

    // 经 as 读取，避免上面 delete 导致的类型收窄为 never
    const exports = w.MarketApp as RawMarketBundle | undefined
    if (!exports) return null

    const def = exports.default || exports
    return {
      component: def.component as Component,
      route: def.route as string,
      meta: def.meta as MarketAppMeta,
    }
  } catch (e) {
    console.error('Failed to load market app:', e)
    return null
  } finally {
    // 无论成功失败都清理：移除 script 节点 + 删除全局定义，杜绝跨 App 串号
    if (script.parentNode) script.parentNode.removeChild(script)
    delete w.MarketApp
  }
}

export function extractMetaFromBundle(code: string): MarketAppMeta | null {
  return runBundle(code)?.meta ?? null
}

export function loadMarketApp(code: string): MarketAppDefinition | null {
  const def = runBundle(code)
  if (!def || !def.component || !def.route || !def.meta) {
    console.warn('Invalid market app definition:', def)
    return null
  }
  return def
}
