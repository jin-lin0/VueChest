// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import Popover from '../Popover.vue'

let app: App
let root: HTMLElement

async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}

function trigger() {
  return document.querySelector<HTMLButtonElement>('.trigger')!
}

function mountPopover() {
  const open = ref(false)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(
            Popover,
            {
              open: open.value,
              'onUpdate:open': (value: boolean) => {
                open.value = value
              },
            },
            {
              trigger: (slotProps: { toggle: () => void }) =>
                h('button', { class: 'trigger', onClick: slotProps.toggle }, 'open'),
              default: () => h('div', { class: 'content' }, 'panel'),
            },
          )
      },
    }),
  )
  app.mount(root)
  return open
}

afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Popover', () => {
  it('opens from the trigger slot and closes when mousedown lands outside', async () => {
    mountPopover()
    await flush()

    trigger().click()
    await flush()
    expect(document.querySelector('.content')).not.toBeNull()

    // 面板内部按下不算「外部」，否则在面板里操作时会被自己的关闭逻辑打断
    document
      .querySelector('.content')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()
    expect(document.querySelector('.content')).not.toBeNull()

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()
    expect(document.querySelector('.content')).toBeNull()
  })

  it('toggles closed from the trigger when already open', async () => {
    mountPopover()
    await flush()

    trigger().click()
    await flush()
    expect(document.querySelector('.content')).not.toBeNull()

    trigger().click()
    await flush()
    expect(document.querySelector('.content')).toBeNull()
  })

  it('closes on Escape while open', async () => {
    mountPopover()
    await flush()
    trigger().click()
    await flush()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()

    expect(document.querySelector('.content')).toBeNull()
  })

  it('stops Escape from reaching outer layers while open', async () => {
    mountPopover()
    await flush()
    trigger().click()
    await flush()

    let reachedWindow = false
    const listener = () => {
      reachedWindow = true
    }
    window.addEventListener('keydown', listener)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    window.removeEventListener('keydown', listener)

    // 同一次 ESC 不该连带关掉外层弹层（useOverlay 在 window 上监听）
    expect(reachedWindow).toBe(false)
  })

  it('does not swallow Escape while closed', async () => {
    mountPopover()
    await flush()

    let reachedWindow = false
    const listener = () => {
      reachedWindow = true
    }
    window.addEventListener('keydown', listener)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    window.removeEventListener('keydown', listener)

    expect(reachedWindow).toBe(true)
  })
})
