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

// 浏览器端定位：同步缓存 → 异步更新
const storedGeo = sessionStorage.getItem('client_geo')
let geoHeader: Record<string, string> = {}
if (storedGeo) {
  try { geoHeader = getGeoHeader(JSON.parse(storedGeo)) as Record<string, string> } catch {}
}
getClientGeo().then((geo) => {
  if (geo) sessionStorage.setItem('client_geo', JSON.stringify(geo))
})

// 全局 fetch 代理：自动添加定位头
const origFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  if (geoHeader['X-Client-Geo']) headers.set('X-Client-Geo', geoHeader['X-Client-Geo'])
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
