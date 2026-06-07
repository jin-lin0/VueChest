import { createApp } from 'vue'
import * as Vue from 'vue'
import { createPinia } from 'pinia'
import * as VueRouter from 'vue-router'

import App from './App.vue'
import router from './router'
import { initStorage } from './utils'
import { useAuthStore } from './stores'
import { useMarketStore } from './stores/market'

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
