// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import MarkdownViewLazy from '../MarkdownViewLazy'

/**
 * `@/lib/markdown`（marked + DOMPurify + highlight.js）是整条链上最贵的一段。
 * 这里用工厂计数来证明「只有真的渲染时才加载」，而不是只断言源码长相。
 */
const markdownModule = vi.hoisted(() => ({ loads: 0 }))
const render = vi.hoisted(() => vi.fn((text: string) => text))
vi.mock('@/lib/markdown', () => {
  markdownModule.loads += 1
  return { renderMarkdown: render }
})

/**
 * 只推几轮宏任务，**不等**动态 import 完成 —— 用来观察「还没开始加载」那一刻的状态。
 * 反过来，要等它加载完就用 vi.waitFor（Vite 首次转换 MarkdownView.vue 是真 I/O，
 * 固定轮次会随机器快慢而抖）。
 */
const tick = async () => {
  for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

describe('MarkdownViewLazy', () => {
  it('未渲染时不加载 markdown 栈，真正渲染后才加载并出内容', async () => {
    const show = ref(false)
    const root = document.createElement('div')
    const app = createApp({
      setup: () => () => (show.value ? h(MarkdownViewLazy, { content: '**正文**' }) : h('p', '空')),
    })
    app.mount(root)
    await tick()

    // 关键断言：条件没成立时，连 chunk 都不会去取，markdown 栈更是碰都没碰
    expect(root.textContent).toBe('空')
    expect(markdownModule.loads).toBe(0)
    expect(render).not.toHaveBeenCalled()

    show.value = true
    await vi.waitFor(() => expect(root.textContent).toBe('**正文**'))

    expect(markdownModule.loads).toBeGreaterThan(0)
    expect(render).toHaveBeenCalledWith('**正文**', { tocLevel: 0 })
    app.unmount()
  })

  it('透传 content / tocLevel / streaming 给真正的 MarkdownView', async () => {
    render.mockClear()
    const root = document.createElement('div')
    const app = createApp({
      render: () => h(MarkdownViewLazy, { content: '# 标题', tocLevel: 2, streaming: false }),
    })
    app.mount(root)
    await vi.waitFor(() => expect(root.textContent).toBe('# 标题'))

    expect(render).toHaveBeenCalledWith('# 标题', { tocLevel: 2 })
    expect(root.querySelector('.markdown-body')).not.toBeNull()
    app.unmount()
  })
})

/**
 * 首屏不变式（两向，缺一不可）：
 *  - 「点了才显示正文」的路由，不许把 MarkdownView / @/lib/markdown 静态引入 ——
 *    否则 47.7KB gzip 又回到首屏关键路径上（对应 check-route-budget 里那三条路由的收紧）。
 *  - 「首帧就要显示正文」的页面，必须保持静态引入 —— 改成懒加载只是把成本挪到渲染时，
 *    对这些页面反而是净损失。
 *
 * 这条不变式只能从源码侧守：`market-apps/**` 之外的类型检查与单测都不会因为
 * 一个静态 import 而报错，逐路由体积闸门又要跑完整构建才会发现。
 */
describe('markdown 渲染栈的首屏归属', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

  const 按需渲染 = [
    'src/apps/interview/App.vue',
    'src/apps/bilibili-subtitle/App.vue',
    'src/apps/bilibili-subtitle/components/AnalysisFollowUp.vue',
    'src/apps/stock/knowledge/App.vue',
  ]
  const 首帧渲染 = [
    'src/views/Docs.vue',
    'src/apps/ai-chat/App.vue',
    'src/views/admin/QuestionManagement.vue',
  ]

  it.each(按需渲染)('%s 用 MarkdownViewLazy，不静态引入 markdown 栈', (path) => {
    const source = read(path)
    expect(source).toContain("from '@/components/common/MarkdownViewLazy'")
    expect(source).not.toContain("from '@/components/common/MarkdownView.vue'")
    expect(source).not.toContain("from '@/lib/markdown'")
  })

  it.each(首帧渲染)('%s 首帧就要出正文，保持静态引入', (path) => {
    const source = read(path)
    const 静态引入 =
      source.includes("from '@/components/common/MarkdownView.vue'") ||
      source.includes("from '@/lib/markdown'")
    expect(静态引入).toBe(true)
    expect(source).not.toContain("from '@/components/common/MarkdownViewLazy'")
  })
})
