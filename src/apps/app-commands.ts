import type { AppCommandProvider } from '@/lib/app-command'

/**
 * 系统 App 命令的组合入口。每个 App 只在自己的 commands.ts 中暴露能力；
 * 新 App 接入时只需增加一个懒加载器，命令面板无需了解内部 store 或业务逻辑，
 * 也不会因为全局命令面板而把所有 App 的 store 和实现拉进首屏。
 */
export async function loadBuiltinAppCommandProviders(): Promise<AppCommandProvider[]> {
  const [music, devToolbox] = await Promise.all([
    import('./music/commands'),
    import('./dev-toolbox/commands'),
  ])
  return [music.useMusicCommandProvider(), devToolbox.useDevToolboxCommandProvider()]
}
