import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue')
    },
    {
      path: '/weather',
      name: 'weather',
      component: () => import('../views/Weather.vue')
    },
    {
      path: '/todo',
      name: 'todo',
      component: () => import('../views/Todo.vue')
    },
    {
      path: '/calculator',
      name: 'calculator',
      component: () => import('../views/Calculator.vue')
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('../views/Notes.vue')
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: () => import('../views/Gallery.vue')
    },
    {
      path: '/music',
      name: 'music',
      component: () => import('../views/Music.vue')
    }
  ],
})

export default router
