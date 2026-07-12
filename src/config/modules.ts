import aiChat from '@/apps/ai-chat'
import apiManager from '@/apps/api-manager'
import music from '@/apps/music'
import racing from '@/apps/racing'
import interview from '@/apps/interview'
import stock from '@/apps/stock'
import snake from '@/apps/snake'

export interface AppModule {
  id: number
  name: string
  icon: string
  route: string
  description: string
  devOnly?: boolean
}

function appDef(
  id: number,
  app: { route: string; meta: { name: string; icon: string; description: string } },
): AppModule {
  return { id, name: app.meta.name, icon: app.meta.icon, route: app.route, description: app.meta.description }
}

export const APP_MODULES: AppModule[] = [
  appDef(13, snake),
  appDef(12, interview),
  appDef(11, racing),
  appDef(9, stock),
  appDef(10, music),
  appDef(8, aiChat),
  appDef(1, apiManager),
]


