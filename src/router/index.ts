import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/todo',
      name: 'todo',
      component: () => import('../views/Todo.vue'),
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('../views/Notes.vue'),
    },
    {
      path: '/bookmark',
      name: 'bookmark',
      component: () => import('../views/Bookmark.vue'),
    },
    {
      path: '/pomodoro',
      name: 'pomodoro',
      component: () => import('../views/Pomodoro.vue'),
    },
    {
      path: '/expense',
      name: 'expense',
      component: () => import('../views/Expense.vue'),
    },
    {
      path: '/api-manager',
      name: 'api-manager',
      component: () => import('../views/ApiManager.vue'),
    },
    {
      path: '/special-days',
      name: 'special-days',
      component: () => import('../views/SpecialDays.vue'),
    },
  ],
})

export default router
