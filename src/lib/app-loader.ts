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
  try {
    const script = document.createElement('script')
    script.textContent = code
    document.head.appendChild(script)
    document.head.removeChild(script)

    const exports = (window as unknown as { MarketApp?: RawMarketBundle }).MarketApp
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
