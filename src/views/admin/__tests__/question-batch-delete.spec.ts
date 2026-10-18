// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'


const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/lib/request', () => ({
  // 组件经 '@/components' 间接带入了音乐 store → musicApi，它会读 API_BASE
  API_BASE: 'http://localhost:3000',
  api: { get: mocks.apiGet, post: mocks.apiPost, delete: mocks.apiDelete, put: vi.fn() },
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: mocks.confirm }),
  useConfirmController: () => ({ confirm: mocks.confirm }),
}))

vi.mock('@/lib/markdown', () => ({ renderMarkdown: (text: string) => text }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

import QuestionManagement from '../QuestionManagement.vue'

const questions = [
  { id: 7, title: '两数之和', categoryId: 1, difficulty: 'easy', options: [], answer: 'a', analysis: '' },
  { id: 8, title: '反转链表', categoryId: 1, difficulty: 'medium', options: [], answer: 'b', analysis: '' },
  { id: 9, title: '最长回文', categoryId: 1, difficulty: 'hard', options: [], answer: 'c', analysis: '' },
]

let app: App
let root: HTMLElement

async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}

async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(QuestionManagement)
  app.mount(root)
  await flush()
}

/** 勾选第 index 道题的复选框，触发真实的 @change。 */
async function checkRow(index: number) {
  const box = root.querySelectorAll<HTMLInputElement>('.row-check input[type="checkbox"]')[index]
  if (!box) throw new Error(`第 ${index} 行的复选框没渲染出来`)
  box.checked = true
  box.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}

function batchButton() {
  // 用 Array.from 而不是展开语法：测试工程的 lib 是 ["ESNext", "DOM"]，
  // 不含 DOM.Iterable，NodeList 在类型层面不可迭代（浏览器里实际可以）。
  return Array.from(root.querySelectorAll('button')).find((el) =>
    el.textContent?.includes('批量删除'),
  )
}

const categories = [{ id: 1, name: '前端' }]

beforeEach(() => {
  mocks.apiGet.mockReset().mockImplementation((path: string) => {
    if (path === '/api/questions/categories') return Promise.resolve(categories)
    if (path.startsWith('/api/questions?')) {
      return Promise.resolve({ questions, total: questions.length, totalPages: 1 })
    }
    return Promise.reject(new Error(`unexpected path: ${path}`))
  })
  mocks.apiPost.mockReset().mockResolvedValue({ data: { requested: 3, deleted: 3 } })
  mocks.apiDelete.mockReset().mockResolvedValue({})
  mocks.confirm.mockReset().mockResolvedValue(true)
  mocks.push.mockReset()
})

afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('后台批量删除题目', () => {
  it('勾中多道题后点批量删除，只发一次批量请求，不再逐个 DELETE', async () => {
    await mount()
    await checkRow(0)
    await checkRow(1)
    await checkRow(2)

    const button = batchButton()
    expect(button, '勾选后应该出现「批量删除」按钮').toBeTruthy()
    button!.dispatchEvent(new Event('click', { bubbles: true }))
    await flush()

    expect(mocks.apiDelete).not.toHaveBeenCalled()
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    expect(mocks.apiPost.mock.calls[0][0]).toBe('/api/questions/batch-delete')
    expect(mocks.apiPost.mock.calls[0][1]).toEqual({ ids: [7, 8, 9] })
  })

  it('服务端只删掉一部分时如实提示，不谎报全部成功', async () => {
    mocks.apiPost.mockResolvedValue({ data: { requested: 3, deleted: 1 } })
    await mount()
    await checkRow(0)
    await checkRow(1)
    await checkRow(2)
    batchButton()!.dispatchEvent(new Event('click', { bubbles: true }))
    await flush()

    const text = document.body.innerText
    expect(text).toContain('已删除 1 道题目')
    expect(text).toContain('2 道已不存在')
  })

  it('请求失败后仍然刷新列表，界面回到服务端的真实状态', async () => {
    mocks.apiPost.mockRejectedValue(new Error('网络连接失败，请检查网络或确认服务已启动'))
    await mount()
    const listCalls = () => mocks.apiGet.mock.calls.filter((c) => String(c[0]).startsWith('/api/questions?'))
    const before = listCalls().length

    await checkRow(0)
    batchButton()!.dispatchEvent(new Event('click', { bubbles: true }))
    await flush()

    expect(listCalls().length).toBeGreaterThan(before)
    expect(document.body.innerText).toContain('网络连接失败')
  })

  it('用户取消确认时不发任何请求', async () => {
    mocks.confirm.mockResolvedValue(false)
    await mount()
    await checkRow(0)
    batchButton()!.dispatchEvent(new Event('click', { bubbles: true }))
    await flush()

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })
})
