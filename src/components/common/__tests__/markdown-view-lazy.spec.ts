// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import MarkdownViewLazy from '../MarkdownViewLazy'

/** 通过渲染模块的加载次数验证按需加载。 */
const markdownModule = vi.hoisted(() => ({ loads: 0 }))
const render = vi.hoisted(() => vi.fn((text: string) => text))
vi.mock('@/lib/markdown', () => {
  markdownModule.loads += 1
  return { renderMarkdown: render }
})

/** 观察未渲染时不加载的状态；等待实际动态导入时使用 vi.waitFor。 */
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

/** 交互后才出现的正文延后加载，首帧正文保留直接导入。 */
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
