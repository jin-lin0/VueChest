export interface MarketAppMeta {
  name: string
  icon: string
  description: string
  version?: string
}

export interface MarketAppDefinition {
  component: any
  route: string
  meta: MarketAppMeta
}

export function extractMetaFromBundle(code: string): MarketAppMeta | null {
  try {
    const script = document.createElement('script')
    script.textContent = code
    document.head.appendChild(script)
    document.head.removeChild(script)

    const exports = (window as any).MarketApp
    if (!exports) return null

    const def = exports.default || exports
    return def.meta || null
  } catch {
    return null
  }
}

export function loadMarketApp(code: string): MarketAppDefinition | null {
  try {
    const script = document.createElement('script')
    script.textContent = code
    document.head.appendChild(script)
    document.head.removeChild(script)

    const exports = (window as any).MarketApp
    if (!exports) return null

    const def = exports.default || exports

    if (!def || !def.component || !def.route || !def.meta) {
      console.warn('Invalid market app definition:', def)
      return null
    }

    return {
      component: def.component,
      route: def.route,
      meta: def.meta,
    }
  } catch (e) {
    console.error('Failed to load market app:', e)
    return null
  }
}
