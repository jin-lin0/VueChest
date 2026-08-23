import aiChat from '@/apps/ai-chat'
import apiManager from '@/apps/api-manager'
import music from '@/apps/music'
import racing from '@/apps/racing'
import interview from '@/apps/interview'
import stock from '@/apps/stock'
import bilibiliSubtitle from '@/apps/bilibili-subtitle'
import snake from '@/apps/snake'
import devToolbox from '@/apps/dev-toolbox'
import rhythm from '@/apps/rhythm'
import neonSurvivor from '@/apps/neon-survivor'
import gameCenter from '@/apps/game-center'

export interface AppModule {
  id: number
  name: string
  icon: string
  route: string
  description: string
  devOnly?: boolean
  defaultHidden?: boolean
}

function appDef(
  id: number,
  app: { route: string; meta: { name: string; icon: string; description: string } },
  devOnly = false,
  defaultHidden = false,
): AppModule {
  return {
    id,
    name: app.meta.name,
    icon: app.meta.icon,
    route: app.route,
    description: app.meta.description,
    devOnly,
    defaultHidden,
  }
}

export const APP_MODULES: AppModule[] = [
  appDef(18, gameCenter),
  appDef(17, neonSurvivor, false, true),
  appDef(16, rhythm, false, true),
  appDef(14, bilibiliSubtitle),
  appDef(13, snake, false, true),
  appDef(15, devToolbox),
  appDef(12, interview),
  appDef(11, racing, false, true),
  appDef(9, stock),
  appDef(10, music),
  appDef(8, aiChat),
  appDef(1, apiManager),
]
