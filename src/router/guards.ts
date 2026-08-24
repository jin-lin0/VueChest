import type { Router } from 'vue-router'
import { isKnowledgeDocId } from '@/docs/knowledge/access'

export function createRouterGuard(router: Router) {
  router.beforeEach(async (to) => {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    if (!authStore.isInitialized) await authStore.initAuth()

    const requiresAuth = to.meta.requiresAuth === true
    const requiresSuperAdmin = to.meta.requiresSuperAdmin === true
    const requiresAdmin = to.meta.requiresAdmin === true

    // /docs 同时承载公开帮助文档和管理员知识库：普通用户可访问前者，
    // 但不能通过手动拼接 ?doc=xxx 绕过知识库 Tab 的前端隐藏。
    if (to.path === '/docs' && isKnowledgeDocId(to.query.doc)) {
      if (!authStore.isAuthenticated) {
        return { path: '/login', query: { redirect: to.fullPath } }
      }
      if (!authStore.isAdmin) return '/docs'
    }

    if (requiresAuth && !authStore.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (requiresSuperAdmin && !authStore.isSuperAdmin) {
      return '/'
    }

    if (requiresAdmin && !authStore.isAdmin) {
      return '/'
    }

    if (authStore.isAuthenticated && to.path === '/login') {
      const redirect = to.query.redirect as string
      if (redirect) return redirect
      if (authStore.isAdmin) return '/admin'
      return '/'
    }

    return true
  })

  router.afterEach((to) => {
    if (to.meta.title) {
      document.title = `${to.meta.title} - ${import.meta.env.VITE_APP_TITLE || 'VueChest'}`
    }
  })
}
