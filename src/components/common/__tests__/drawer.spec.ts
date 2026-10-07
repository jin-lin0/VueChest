// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import Drawer from '../Drawer.vue'

let app: App
let root: HTMLElement

async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}

function mountDrawer(
  props: Record<string, unknown>,
  slots: Record<string, () => unknown> = { default: () => '正文' },
) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(
    defineComponent({
      // props 是测试用的宽松字面量、插槽里放的是纯文本，都放宽以避开 h 的重载类型体操
      setup: () => () => h(Drawer, props as never, slots as never),
    }),
  )
  app.mount(root)
}

function panel(selector: string) {
  return document.querySelector<HTMLElement>(selector)
}

afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.style.overflow = ''
})

describe('Drawer 贴底变体', () => {
  it('贴底定位，并让出内联 width（否则会盖掉 .bottom 的整宽）', async () => {
    mountDrawer({ open: true, side: 'bottom', width: 320 })
    await flush()

    const el = panel('.vc-drawer.bottom')
    expect(el).not.toBeNull()
    expect(el!.style.width).toBe('')
  })

  it('左右侧边抽屉仍保留内联 width', async () => {
    mountDrawer({ open: true, side: 'right', width: 320 })
    await flush()

    expect(panel('.vc-drawer.right')?.style.width).toBe('320px')
  })

  it('高度上限通过 CSS 变量下发（落在 overlay 上靠继承传给面板）', async () => {
    mountDrawer({
      open: true,
      side: 'bottom',
      style: { '--vc-drawer-max-h': 'min(72vh, 520px)' },
    })
    await flush()

    expect(panel('.vc-drawer-overlay')?.style.getPropertyValue('--vc-drawer-max-h')).toBe(
      'min(72vh, 520px)',
    )
  })

  it('渲染 footer 插槽', async () => {
    mountDrawer({ open: true, side: 'bottom' }, { default: () => '正文', footer: () => '脚注' })
    await flush()

    expect(panel('.vc-drawer__footer')?.textContent).toBe('脚注')
  })

  it('未提供 footer 插槽时不渲染空脚部', async () => {
    mountDrawer({ open: true, side: 'bottom' })
    await flush()

    expect(panel('.vc-drawer__footer')).toBeNull()
  })

  it('贴底时默认无障碍标签为「底部面板」，沿用「侧边面板」会误导读屏', async () => {
    mountDrawer({ open: true, side: 'bottom' })
    await flush()

    expect(panel('.vc-drawer.bottom')?.getAttribute('aria-label')).toBe('底部面板')
  })

  it('显式 ariaLabel 优先于 title 与方向默认值', async () => {
    mountDrawer({ open: true, side: 'bottom', ariaLabel: '通知中心' })
    await flush()

    expect(panel('.vc-drawer.bottom')?.getAttribute('aria-label')).toBe('通知中心')
  })
})

describe('Drawer noPadding', () => {
  /**
   * 这里刻意用 CSS 里那条规则自己的复合选择器 `.vc-drawer__body.no-padding` 去查询。
   * 它等价于「这条 CSS 能不能命中」——属性挂在别的节点（例如外层 <aside>）时查不到，
   * 而只断言 body.classList.contains('no-padding') 是发现不了的，那正是本 bug 的形态。
   */
  it('noPadding 时 .vc-drawer__body.no-padding 能命中', async () => {
    mountDrawer({ open: true, noPadding: true })
    await flush()

    expect(panel('.vc-drawer__body.no-padding')).not.toBeNull()
  })

  it('noPadding 的类不能落在外层面板上（否则 CSS 永不命中、prop 静默失效）', async () => {
    mountDrawer({ open: true, noPadding: true })
    await flush()

    expect(panel('.vc-drawer.no-padding')).toBeNull()
  })

  it('默认不加 no-padding，保留默认内边距', async () => {
    mountDrawer({ open: true })
    await flush()

    expect(panel('.vc-drawer__body.no-padding')).toBeNull()
  })

  // 贴底是 NotificationCenter 的真实场景，且它独有圆角与 body flex 两条规则，单列一条锁住
  it('贴底 + noPadding 组合下类仍落在 body 上', async () => {
    mountDrawer({ open: true, side: 'bottom', noPadding: true })
    await flush()

    expect(panel('.vc-drawer.bottom .vc-drawer__body.no-padding')).not.toBeNull()
  })
})
