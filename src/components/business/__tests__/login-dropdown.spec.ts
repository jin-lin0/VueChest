// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

const mocks = vi.hoisted(() => ({ apiPost: vi.fn() }))

vi.mock('@/lib/request', () => ({
  api: { get: vi.fn(), post: mocks.apiPost, put: vi.fn(), delete: vi.fn() },
}))

import LoginDropdown from '../LoginDropdown.vue'
import { useAuthStore } from '@/stores/auth'

let app: App
let root: HTMLElement
let router: Router
let pinia: Pinia

async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}

function menu() {
  return document.querySelector('.dropdown-menu')
}

function trigger() {
  return document.querySelector<HTMLButtonElement>('.user-btn')!
}

async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(LoginDropdown)
  app.use(pinia)
  app.use(router)
  await router.push('/')
  await router.isReady()
  app.mount(root)
  await flush()
}

beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.user = { id: 1, username: 'tester', role: 'user', isActive: true, installedApps: [] }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/login', component: { render: () => null } },
      { path: '/developer', component: { render: () => null } },
    ],
  })
})

afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('LoginDropdown 收起行为', () => {
  /**
   * 回归点：改用 Popover 之前，这个下拉打开后点页面空白处不会收起——
   * 它只有根节点的 `@click.stop` 和菜单容器上的 `@click`，没有任何 document 监听，
   * 也不渲染遮罩，只能点菜单项或再点一次头像按钮才关得掉。
   */
  it('打开后点页面空白处收起', async () => {
    await mount()
    trigger().click()
    await flush()
    expect(menu()).not.toBeNull()

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()

    expect(menu()).toBeNull()
  })

  it('点菜单内部不收起', async () => {
    await mount()
    trigger().click()
    await flush()

    document
      .querySelector('.dropdown-info')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()

    expect(menu()).not.toBeNull()
  })

  it('再次点击头像按钮收起', async () => {
    await mount()
    trigger().click()
    await flush()
    expect(menu()).not.toBeNull()

    trigger().click()
    await flush()

    expect(menu()).toBeNull()
  })

  it('ESC 收起', async () => {
    await mount()
    trigger().click()
    await flush()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()

    expect(menu()).toBeNull()
  })

  /**
   * 回归点：Popover 在 document 上监听 keydown 做「ESC 收起」，而改名输入框原本
   * 也吃 ESC（取消改名）。不加 `.stop` 的话输入框里的 ESC 会冒泡到 document，
   * 变成关掉整个下拉，输入框自己的取消逻辑再也没机会执行。
   */
  it('内联改昵称时按 ESC 只退出编辑态，不关掉整个下拉', async () => {
    await mount()
    trigger().click()
    await flush()

    document.querySelector<HTMLButtonElement>('.name-edit-icon')!.click()
    await flush()
    expect(document.querySelector('.name-input')).not.toBeNull()

    const input = document.querySelector<HTMLInputElement>('.name-input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
    await flush()

    expect(document.querySelector('.name-input')).toBeNull()
    expect(menu()).not.toBeNull()
  })

  it('未登录时菜单只提供登录入口，点击后收起并带上回跳地址', async () => {
    const auth = useAuthStore()
    auth.token = null
    auth.user = null

    await mount()
    trigger().click()
    await flush()

    const login = Array.from(document.querySelectorAll<HTMLButtonElement>('.dropdown-item')).find(
      (node) => node.textContent?.trim() === '登录',
    )
    expect(login).toBeDefined()

    login!.click()
    await flush()

    expect(menu()).toBeNull()
    // 导航是异步的（要跑守卫与组件解析），nextTick 等不到
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/login')
    })
    expect(router.currentRoute.value.query.redirect).toBe('/')
  })
})
