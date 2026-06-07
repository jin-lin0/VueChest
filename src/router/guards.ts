import type { Router } from 'vue-router'

// 公开路由（无需认证）
// const PUBLIC_ROUTES = ['/', '/login', '/admin/login']

/**
 * 创建路由守卫
 * @param router Vue Router 实例
 */
export function createRouterGuard(router: Router) {
  router.beforeEach(async (to) => {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    // 确保认证已初始化
    await authStore.initAuth()

    // 检查是否需要认证
    const requiresAuth = to.meta.requiresAuth === true

    // 如果访问需要认证的路由但未登录
    if (requiresAuth && !authStore.isAuthenticated) {
      return {
        path: '/admin/login',
        query: { redirect: to.fullPath },
      }
    }

    // 检查是否需要 super_admin 权限
    if (to.meta.requiresSuperAdmin && !authStore.isAdmin) {
      return '/'
    }

    // 如果已登录但访问登录页
    if (authStore.isAuthenticated && (to.path === '/admin/login' || to.path === '/login')) {
      // 如果有重定向参数，跳转到重定向地址
      const redirect = to.query.redirect as string
      if (redirect) {
        return redirect
      }
      return '/admin'
    }

    // 其他情况正常导航
    return true
  })

  router.afterEach((to) => {
    // 页面切换后更新页面标题
    if (to.meta.title) {
      document.title = `${to.meta.title} - ${import.meta.env.VITE_APP_TITLE || 'VueChest'}`
    }
  })
}
