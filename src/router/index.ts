import { createRouter, createWebHistory } from 'vue-router'
import { createRouterGuard } from './guards'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
      meta: { title: '首页' },
    },
    {
      path: '/api-manager',
      name: 'api-manager',
      component: () => import('../apps/api-manager/App.vue'),
      meta: { title: 'API 管理' },
    },
    {
      path: '/ai-chat',
      name: 'ai-chat',
      component: () => import('../apps/ai-chat/App.vue'),
      meta: { title: 'AI 聊天' },
    },
    {
      path: '/stock',
      name: 'stock',
      component: () => import('../apps/stock/App.vue'),
      meta: { title: '股票分析' },
    },
    {
      path: '/bilibili-subtitle',
      name: 'bilibili-subtitle',
      component: () => import('../apps/bilibili-subtitle/App.vue'),
      meta: { title: 'B站字幕' },
    },
    {
      path: '/music',
      name: 'music',
      component: () => import('../apps/music/App.vue'),
      meta: { title: '音乐' },
    },
    {
      path: '/racing',
      name: 'racing',
      component: () => import('../apps/racing/App.vue'),
      meta: { title: '赛车游戏' },
    },
    {
      path: '/interview',
      name: 'interview',
      component: () => import('../apps/interview/App.vue'),
      meta: { title: '面试问答' },
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('../views/market/AppMarket.vue'),
      meta: { title: '应用市场' },
    },
    {
      path: '/market/:id(\\d+)',
      name: 'market-detail',
      component: () => import('../views/market/AppMarketDetail.vue'),
      meta: { title: '应用详情' },
    },
    {
      path: '/market/upload',
      name: 'market-upload',
      component: () => import('../views/market/AppUpload.vue'),
      meta: { title: '上传应用', requiresAuth: true },
    },
    {
      path: '/snake',
      name: 'snake',
      component: () => import('../apps/snake/App.vue'),
      meta: { title: '贪吃蛇' },
    },
    {
      path: '/snake/local',
      name: 'snake-local',
      component: () => import('../apps/snake/views/LocalBattle.vue'),
      meta: { title: '贪吃蛇 · 本地对战' },
    },
    {
      path: '/snake/ai',
      name: 'snake-ai',
      component: () => import('../apps/snake/views/AiBattle.vue'),
      meta: { title: '贪吃蛇 · 人机对战' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/auth/UserLogin.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/auth/UserRegister.vue'),
      meta: { title: '注册' },
    },
    {
      path: '/admin',
      component: () => import('../layouts/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('../views/admin/AdminDashboard.vue'),
          meta: { title: '仪表盘' },
        },
        {
          path: 'questions',
          name: 'admin-questions',
          component: () => import('../views/admin/QuestionManagement.vue'),
          meta: { title: '问题管理' },
        },
        {
          path: 'questions/create',
          name: 'admin-question-create',
          component: () => import('../views/admin/QuestionEditor.vue'),
          meta: { title: '新建题目' },
        },
        {
          path: 'questions/:id/edit',
          name: 'admin-question-edit',
          component: () => import('../views/admin/QuestionEditor.vue'),
          meta: { title: '编辑题目' },
        },
        {
          path: 'categories',
          name: 'admin-categories',
          component: () => import('../views/admin/CategoryManagement.vue'),
          meta: { title: '分类管理' },
        },
        {
          path: 'apps',
          name: 'admin-apps',
          component: () => import('../views/admin/AppManagement.vue'),
          meta: { title: '应用管理' },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/UserManagement.vue'),
          meta: { title: '用户管理', requiresSuperAdmin: true },
        },
      ],
    },
  ],
})

createRouterGuard(router)

export default router
