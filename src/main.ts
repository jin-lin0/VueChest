import { createApp } from 'vue'
import * as Vue from 'vue'
import { createPinia } from 'pinia'
import * as Pinia from 'pinia'
import * as VueRouter from 'vue-router'

import './styles/scrollbar.css'
import './styles/markdown.css'
import './styles/global-utils.css'
import { initTheme, getAppTheme } from './composables/useTheme'
// 首屏前先应用主题，避免浅色/深色闪烁
initTheme()
import App from './App.vue'
import router from './router'
import { initStorage } from './lib/storage'
import { useAuthStore } from './stores'
import { useMarketStore } from './stores/market'
import { getClientGeo, getGeoHeader } from './lib/clientGeo'
import { API_BASE } from './lib/request'

const BACKEND_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin
  } catch {
    return ''
  }
})()

function isOwnBackend(url: string): boolean {
  if (!BACKEND_ORIGIN) return false
  try {
    const target = new URL(url, window.location.origin)
    return target.origin === BACKEND_ORIGIN
  } catch {
    return false
  }
}

// 全局 fetch 代理：对后端自动添加定位头
const origFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()

  if (!isOwnBackend(url)) return origFetch(input, init)

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

import { getStorage, setStorage } from './lib/storage'
// 暴露给 app 的运行时主题对象（opt-in）：{ isDark, onChange }
const appTheme = getAppTheme()
type VueChestRuntime = {
  Vue: typeof Vue
  VueRouter: typeof VueRouter
  defineComponent: typeof Vue.defineComponent
  defineAsyncComponent: typeof Vue.defineAsyncComponent
  h: typeof Vue.h
  ref: typeof Vue.ref
  computed: typeof Vue.computed
  reactive: typeof Vue.reactive
  watch: typeof Vue.watch
  onMounted: typeof Vue.onMounted
  onUnmounted: typeof Vue.onUnmounted
  theme: typeof appTheme
  Pinia?: typeof Pinia
  storage?: { getStorage: typeof getStorage; setStorage: typeof setStorage }
}
const runtimeWindow = window as typeof window & {
  __VueChest__: VueChestRuntime
  __APP_THEME__: typeof appTheme
}
runtimeWindow.__VueChest__ = {
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
  theme: appTheme, // 市场 app 也可通过 __VueChest__.theme 读取
}
// 市场 app（运行时注入的纯 JS）读取主题的主通道
runtimeWindow.__APP_THEME__ = appTheme

initStorage().then(async () => {
  const app = createApp(App)
  const pinia = createPinia()

  // 挂到全局，供 Market App 共享 Pinia 模块 + 存储层
  runtimeWindow.__VueChest__.Pinia = Pinia // Pinia 模块（含 defineStore）
  runtimeWindow.__VueChest__.storage = { getStorage, setStorage }

  app.use(pinia)

  // 在注册路由前完成令牌校验，避免直接访问受保护页面时被守卫误判为未登录。
  const authStore = useAuthStore()
  await authStore.initAuth()

  const marketStore = useMarketStore()
  marketStore.initInstalledApps()

  app.use(router)

  // 系统 app（Vue 组件）可 inject('appTheme') 自愿消费主题
  app.provide('appTheme', appTheme)

  app.mount('#app')

  // 定位不阻塞首屏，完成后会自动用于后续请求。
  getClientGeo().then((geo) => {
    if (geo) sessionStorage.setItem('client_geo', JSON.stringify(geo))
  })

  // 跨设备同步：以服务端实时列表为唯一真源对账，不再信任 auth_user_info 缓存里的 installedApps
  await marketStore.syncWithServer()
  // 检查市场应用更新；仅在用户开启自动更新时下载新版本。
  await marketStore.checkForUpdates({ autoApply: true })
})
