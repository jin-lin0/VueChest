// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import Modal from '../Modal.vue'
import CustomSelect from '../CustomSelect.vue'

let app: App
let root: HTMLElement
async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}
function press(key: string, shiftKey = false) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  )
}
function button(text: string) {
  return Array.from(document.querySelectorAll('button')).find((node) => node.textContent === text)!
}
afterEach(async () => {
  app?.unmount()
  await flush()
  root?.remove()
  document.body.style.overflow = ''
})

describe('shared modal keyboard behavior', () => {
  it('moves focus inside, cycles both directions, closes only the top modal and restores focus', async () => {
    const outer = ref(false),
      inner = ref(false)
    root = document.createElement('div')
    document.body.append(root)
    document.body.style.overflow = 'clip'
    app = createApp({
      setup: () => () =>
        h('main', [
          h(
            'button',
            {
              onClick: () => {
                outer.value = true
              },
            },
            'Open',
          ),
          h(
            Modal,
            {
              open: outer.value,
              title: 'Outer',
              onClose: () => {
                outer.value = false
              },
            },
            {
              default: () => [
                h(
                  'button',
                  {
                    onClick: () => {
                      inner.value = true
                    },
                  },
                  'Nested',
                ),
                h('button', 'Last'),
              ],
            },
          ),
          h(
            Modal,
            {
              open: inner.value,
              title: 'Inner',
              onClose: () => {
                inner.value = false
              },
            },
            { default: () => h('button', 'Inside') },
          ),
        ]),
    })
    app.mount(root)
    button('Open').focus()
    button('Open').click()
    await flush()
    const outerDialog = document.querySelector('[aria-label="Outer"]')!
    expect(outerDialog.contains(document.activeElement)).toBe(true)
    press('Tab', true)
    expect(document.activeElement).toBe(button('Last'))
    press('Tab')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭')
    button('Nested').focus()
    button('Nested').click()
    await flush()
    expect(document.querySelector('[aria-label="Inner"]')!.contains(document.activeElement)).toBe(
      true,
    )
    press('Escape')
    await flush()
    expect(inner.value).toBe(false)
    expect(outer.value).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(button('Nested'))
    press('Escape')
    await flush()
    expect(document.activeElement).toBe(button('Open'))
    expect(document.body.style.overflow).toBe('clip')
  })

  it('allows the existing searchable select portal and lets Escape close its menu first', async () => {
    const open = ref(true)
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      setup: () => () =>
        h(
          Modal,
          {
            open: open.value,
            title: 'Select',
            onClose: () => {
              open.value = false
            },
          },
          {
            default: () =>
              h(CustomSelect, { searchable: true, options: [{ label: 'One', value: 'one' }] }),
          },
        ),
    })
    app.mount(root)
    await flush()
    const trigger = document.querySelector<HTMLElement>('[role="combobox"]')!
    trigger.click()
    await flush()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('搜索选项')
    press('Escape')
    await flush()
    expect(open.value).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })
})
