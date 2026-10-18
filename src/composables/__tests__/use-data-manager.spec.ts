// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDataManager } from '../useDataManager'

/**
 * 数据管理的三条路径（导出 / 导入 / 重置）都会**整表覆盖**本地数据，
 * 原先它们只活在 WorkspaceHome.vue 内部，要验证得先挂载 2600 行的首页。
 *
 * 这些用例锁的是用户实际会看到的差别：
 *   - 解析失败与写库失败必须给不同的说法（原来写库失败也说「JSON 解析失败」，
 *     用户会去反复检查一个本来完全正确的备份文件）；
 *   - 重置失败必须说话（原来没有 try/catch：状态行不动、页面不刷新，拒绝只进控制台）；
 *   - 「成功」的绿色样式必须来自显式状态，不能靠 `importStatus.includes('重置')` 猜 ——
 *     否则「重置失败」会被判成成功。
 */

const mocks = vi.hoisted(() => ({
  exportAllData: vi.fn(),
  importAllData: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  exportAllData: mocks.exportAllData,
  importAllData: mocks.importAllData,
}))

const reload = vi.fn()
const confirm = vi.fn()

function createManager() {
  return useDataManager({ confirm, reload })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mocks.exportAllData.mockResolvedValue({})
  mocks.importAllData.mockResolvedValue(undefined)
  confirm.mockResolvedValue(true)
})

describe('导入：解析失败与写入失败必须分开说', () => {
  it('JSON 解析失败：只说解析失败，不碰存储', async () => {
    const manager = createManager()
    manager.importText.value = '{ 这不是 JSON'

    await manager.handleImport()

    expect(manager.importStatus.value).toBe('JSON 解析失败，请检查文件内容')
    expect(manager.importOk.value).toBe(false)
    expect(mocks.importAllData).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('写入失败：说的是「写入本地数据时出错」，绝不能再说成解析失败', async () => {
    mocks.importAllData.mockRejectedValue(new Error('QuotaExceededError'))
    const manager = createManager()
    manager.importText.value = JSON.stringify({ docs: [] })

    await manager.handleImport()

    expect(mocks.importAllData).toHaveBeenCalledTimes(1)
    expect(manager.importStatus.value).toContain('导入失败')
    expect(manager.importStatus.value).toContain('QuotaExceededError')
    expect(manager.importStatus.value).toContain('原有数据未被改动')
    expect(manager.importStatus.value).not.toContain('JSON 解析失败')
    expect(manager.importOk.value).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('结构性不合法的备份（空对象 / 数组 / 非对象）单独提示，不写库', async () => {
    const manager = createManager()
    for (const bad of ['{}', '[]', '"文本"', 'null']) {
      manager.importText.value = bad
      await manager.handleImport()
      expect(manager.importStatus.value).toBe('请选择有效且非空的 VueChest 备份文件')
    }
    expect(mocks.importAllData).not.toHaveBeenCalled()
  })

  it('成功：状态转绿，并在 700ms 后刷新页面', async () => {
    vi.useFakeTimers()
    const manager = createManager()
    manager.importText.value = JSON.stringify({ docs: [{ id: 1 }] })

    await manager.handleImport()

    expect(mocks.importAllData).toHaveBeenCalledWith({ docs: [{ id: 1 }] })
    expect(manager.importStatus.value).toBe('导入成功，即将刷新页面')
    expect(manager.importOk.value).toBe(true)
    expect(reload).not.toHaveBeenCalled()

    vi.advanceTimersByTime(700)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('导入进行中不接受第二次触发：整表覆盖不允许并发', async () => {
    let release: (() => void) | undefined
    mocks.importAllData.mockImplementation(
      () =>
        new Promise<void>((resolveImport) => {
          release = () => resolveImport()
        }),
    )
    const manager = createManager()
    manager.importText.value = JSON.stringify({ docs: [] })

    const first = manager.handleImport()
    expect(manager.busy.value).toBe(true)
    await manager.handleImport()

    expect(mocks.importAllData).toHaveBeenCalledTimes(1)

    release?.()
    await first
    expect(manager.busy.value).toBe(true)
  })
})

describe('重置：失败也要说话', () => {
  it('确认框等待期间禁止导入，成功后等待刷新期间禁止再次重置', async () => {
    vi.useFakeTimers()
    let accept!: (ok: boolean) => void
    confirm.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          accept = resolve
        }),
    )
    const manager = createManager()
    manager.importText.value = '{"docs":[]}'
    const reset = manager.handleReset()
    await manager.handleImport()
    expect(mocks.importAllData).not.toHaveBeenCalled()
    accept(true)
    await reset
    await manager.handleReset()
    await manager.handleImport()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(mocks.importAllData).toHaveBeenCalledExactlyOnceWith({})
    vi.advanceTimersByTime(700)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('用户取消：不写库、不刷新、不显示状态', async () => {
    confirm.mockResolvedValue(false)
    const manager = createManager()

    await manager.handleReset()

    expect(mocks.importAllData).not.toHaveBeenCalled()
    expect(manager.importStatus.value).toBe('')
    expect(reload).not.toHaveBeenCalled()
  })

  it('清库失败：报「重置失败」并保持非成功样式，且不刷新页面', async () => {
    mocks.importAllData.mockRejectedValue(new Error('QuotaExceededError'))
    const manager = createManager()

    await expect(manager.handleReset()).resolves.toBeUndefined()

    expect(manager.importStatus.value).toContain('重置失败')
    expect(manager.importStatus.value).toContain('原有数据未被改动')
    expect(manager.importOk.value).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(manager.busy.value).toBe(false)
  })

  it('清库成功：状态转绿并刷新页面', async () => {
    vi.useFakeTimers()
    const manager = createManager()

    await manager.handleReset()

    expect(mocks.importAllData).toHaveBeenCalledWith({})
    expect(manager.importStatus.value).toBe('已重置，即将刷新页面')
    expect(manager.importOk.value).toBe(true)
    vi.advanceTimersByTime(700)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('导出', () => {
  it('把全部数据打成 JSON 交给浏览器下载', async () => {
    mocks.exportAllData.mockResolvedValue({ docs: [{ id: 1 }] })
    const blobs: Blob[] = []
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      blobs.push(blob as Blob)
      return 'blob:mock'
    }
    URL.revokeObjectURL = () => {}
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      const manager = createManager()
      await manager.handleExport()

      expect(click).toHaveBeenCalledTimes(1)
      expect(blobs).toHaveLength(1)
      expect(await blobs[0].text()).toContain('"id": 1')
    } finally {
      click.mockRestore()
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })
})

describe('状态样式不得靠子串猜', () => {
  it('WorkspaceHome 的成功样式由 importOk 决定', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/WorkspaceHome.vue'), 'utf8')

    expect(source).toContain(':class="{ success: importOk }"')
    // `importStatus.includes('重置')` 会把「重置失败」判成成功（绿字）
    expect(source).not.toMatch(/importStatus\.includes\(/)
  })
})
