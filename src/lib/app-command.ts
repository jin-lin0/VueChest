import type { Router } from 'vue-router'
import type { ToastType } from '@/composables/useToast'

export interface AppCommandOutcome {
  message?: string
  type?: ToastType
}

export interface AppCommandContext {
  router: Router
}

export interface AppCommandDefinition {
  id: string
  label: string
  description: string
  icon: string
  keywords?: string[]
  priority?: number
  disabledReason?: () => string | null
  execute: (
    context: AppCommandContext,
  ) => AppCommandOutcome | void | Promise<AppCommandOutcome | void>
}

export interface AppCommandProvider {
  appKey: string
  appName: string
  commands: () => AppCommandDefinition[]
}

/**
 * App 对全局命令面板的公开协议。
 * provider 放在 App 自己的目录内，命令面板只消费协议，不依赖 App 内部实现。
 */
export function defineAppCommandProvider(provider: AppCommandProvider): AppCommandProvider {
  return provider
}
