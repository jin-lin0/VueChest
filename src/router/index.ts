import { createRouter, createWebHistory } from 'vue-router'
import { createRouterGuard } from './guards'
import UserLogin from '../views/UserLogin.vue'
import UserRegister from '../views/UserRegister.vue'

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
      path: '/todo',
      name: 'todo',
      component: () => import('../views/Todo.vue'),
      meta: { title: '待办事项' },
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('../views/Notes.vue'),
      meta: { title: '笔记' },
    },
    {
      path: '/bookmark',
      name: 'bookmark',
      component: () => import('../views/Bookmark.vue'),
      meta: { title: '书签' },
    },
    {
      path: '/pomodoro',
      name: 'pomodoro',
      component: () => import('../views/Pomodoro.vue'),
      meta: { title: '番茄钟' },
    },
    {
      path: '/expense',
      name: 'expense',
      component: () => import('../views/Expense.vue'),
      meta: { title: '支出管理' },
    },
    {
      path: '/api-manager',
      name: 'api-manager',
      component: () => import('../views/ApiManager.vue'),
      meta: { title: 'API 管理' },
    },
    {
      path: '/special-days',
      name: 'special-days',
      component: () => import('../views/SpecialDays.vue'),
      meta: { title: '特殊日子' },
    },
    {
      path: '/ai-chat',
      name: 'ai-chat',
      component: () => import('../views/AIChat.vue'),
      meta: { title: 'AI 聊天' },
    },
    {
      path: '/stock',
      name: 'stock',
      component: () => import('../views/StockAnalysis.vue'),
      meta: { title: '股票分析' },
    },
    {
      path: '/music',
      name: 'music',
      component: () => import('../views/Music.vue'),
      meta: { title: '音乐' },
    },
    {
      path: '/racing',
      name: 'racing',
      component: () => import('../views/RacingGame.vue'),
      meta: { title: '赛车游戏' },
    },
    {
      path: '/interview',
      name: 'interview',
      component: () => import('../views/InterviewQuiz.vue'),
      meta: { title: '面试问答' },
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('../views/AppMarket.vue'),
      meta: { title: '应用市场' },
    },
    {
      path: '/market/:id(\\d+)',
      name: 'market-detail',
      component: () => import('../views/AppMarketDetail.vue'),
      meta: { title: '应用详情' },
    },
    {
      path: '/market/upload',
      name: 'market-upload',
      component: () => import('../views/AppUpload.vue'),
      meta: { title: '上传应用', requiresAdmin: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => Promise.resolve(UserLogin),
      meta: { title: '登录' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => Promise.resolve(UserRegister),
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
          component: () => import('../views/AdminDashboard.vue'),
          meta: { title: '仪表盘' },
        },
        {
          path: 'questions',
          name: 'admin-questions',
          component: () => import('../views/admin/QuestionManagement.vue'),
          meta: { title: '问题管理' },
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
