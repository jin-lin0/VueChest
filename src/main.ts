import { createApp } from 'vue'
import * as Vue from 'vue'
import { createPinia } from 'pinia'
import * as Pinia from 'pinia'
import * as VueRouter from 'vue-router'

import App from './App.vue'
import router from './router'
import { initStorage } from './utils'
import { useAuthStore } from './stores'
import { useMarketStore } from './stores/market'
import { getClientGeo, getGeoHeader } from './utils/clientGeo'

// 全局 fetch 代理：自动添加定位头
const origFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
  if (!url.includes('/api/')) return origFetch(input, init)

  const headers = new Headers(init?.headers)
  try {
    const stored = sessionStorage.getItem('client_geo')
    if (stored) {
      const h = getGeoHeader(JSON.parse(stored))
      if (h['X-Client-Geo']) headers.set('X-Client-Geo', h['X-Client-Geo'])
    }
  } catch {}
  return origFetch(input, { ...init, headers })
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
    }
  })
}

import { getStorage, setStorage } from './utils/storage'
;(window as any).__VueChest__ = {
  Vue,
  VueRouter,
  defineComponent: Vue.defineComponent,
  defineAsyncComponent: Vue.defineAsyncComponent,
  h: Vue.h,
  ref: Vue.ref,
  computed: Vue.computed,
  reactive: Vue.reactive,
  watch: Vue.watch,
  onMounted: Vue.onMounted,
  onUnmounted: Vue.onUnmounted,
}

initStorage().then(async () => {
  const app = createApp(App)
  const pinia = createPinia()

  // 挂到全局，供 Market App 共享 Pinia 模块 + 存储层
  ;(window as any).__VueChest__.Pinia = Pinia // Pinia 模块（含 defineStore）
  ;(window as any).__VueChest__.storage = { getStorage, setStorage }

  app.use(pinia)
  app.use(router)

  app.mount('#app')

  // 定位不阻塞首屏，完成后会自动用于后续请求。
  getClientGeo().then((geo) => {
    if (geo) sessionStorage.setItem('client_geo', JSON.stringify(geo))
  })

  const authStore = useAuthStore()
  await authStore.initAuth()

  const marketStore = useMarketStore()
  // 先从本地 IndexedDB 恢复已安装的 App
  marketStore.initInstalledApps()
  // 再从服务端拉取缺失的 App（跨设备同步）
  // 同时处理：本地有但服务端没记录的情况（未登录时安装的）
  if (authStore.token && authStore.user) {
    const serverIds = authStore.user.installedApps || []
    const localIds = marketStore.installedApps.map((a) => a.id)
    const hasMissingOnLocal = serverIds.some((id) => !localIds.includes(id))
    const hasMissingOnServer = localIds.some((id) => !serverIds.includes(id))

    if (hasMissingOnLocal) {
      await marketStore.syncFromServer(serverIds)
    }
    if (hasMissingOnServer) {
      await marketStore.syncToServer()
    }
  }
})
