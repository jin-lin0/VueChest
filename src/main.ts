import { createApp } from 'vue'
import * as Vue from 'vue'
import { createPinia } from 'pinia'
import * as VueRouter from 'vue-router'

import App from './App.vue'
import router from './router'
import { initStorage } from './utils'
import { useAuthStore } from './stores'
import { useMarketStore } from './stores/market'
import { getClientGeo, getGeoHeader } from './utils/clientGeo'

// 浏览器端定位，通过请求头发送给后端
getClientGeo().then((geo) => {
  if (geo) sessionStorage.setItem('client_geo', JSON.stringify(geo))
})

// 全局 fetch 代理：自动添加定位头
const origFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
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

initStorage().then(() => {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)

  app.mount('#app')

  const authStore = useAuthStore()
  authStore.initAuth()

  const marketStore = useMarketStore()
  marketStore.initInstalledApps()
})
