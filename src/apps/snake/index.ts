import App from './App.vue'

export default {
  component: App,
  route: '/snake',
  meta: {
    name: 'PK贪吃蛇',
    icon: '🐍',
    description: '贪吃蛇双人对战 & 人机对战，在方块中一决高下',
  },
  children: [
    {
      path: 'local',
      name: 'snake-local',
      component: () => import('./views/LocalBattle.vue'),
      meta: { title: '贪吃蛇 · 本地对战' },
    },
    {
      path: 'ai',
      name: 'snake-ai',
      component: () => import('./views/AiBattle.vue'),
      meta: { title: '贪吃蛇 · 人机对战' },
    },
  ],
}
