import type { Router } from 'vue-router'

export function createRouterGuard(router: Router) {
  router.beforeEach(async (to) => {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    await authStore.initAuth()

    const requiresAuth = to.meta.requiresAuth === true
    const requiresSuperAdmin = to.meta.requiresSuperAdmin === true
    const requiresAdmin = to.meta.requiresAdmin === true

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
