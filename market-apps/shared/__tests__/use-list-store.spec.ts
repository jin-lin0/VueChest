// @vitest-environment happy-dom
/** 仅推进微任务，验证修改已投递到真实存储桥，无需等待计时器。 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useListStore } from '../useListStore'

interface Item {
  id: number
  text: string
}

const writes: Array<{ key: string; value: unknown }> = []

interface FakeRuntime {
  __VueChest__?: {
    storage: {
      getStorage: (key: string, fallback?: unknown) => unknown
      setStorage: (key: string, value: unknown) => void
    }
  }
}

beforeEach(() => {
  writes.length = 0
  // 保存值的快照，避免后续原地修改污染先前的调用记录。
  ;(window as unknown as FakeRuntime).__VueChest__ = {
    storage: {
      getStorage: () => null,
      setStorage: (key, value) => {
        writes.push({ key, value: JSON.parse(JSON.stringify(value)) })
      },
    },
  }
})

describe('useListStore 持久化时机', () => {
  it('改动后只推进微任务就必须已落桥（不得留在计时器里）', async () => {
    const list = useListStore<Item>({ storageKey: 'timing', defaultValue: [] })

    list.add({ id: 1, text: 'a' })
    await nextTick()

    expect(writes).toEqual([{ key: 'timing', value: [{ id: 1, text: 'a' }] }])
  })

  it('同一任务内的多次改动合并为一次写入（靠调度器，不靠计时器）', async () => {
    const list = useListStore<Item>({ storageKey: 'burst', defaultValue: [] })

    list.add({ id: 1, text: 'a' })
    list.add({ id: 2, text: 'b' })
    await nextTick()

    expect(writes).toHaveLength(1)
    expect(writes[0].value).toHaveLength(2)
  })

  it('remove / update / clear 同样即时落桥', async () => {
    const list = useListStore<Item>({
      storageKey: 'mutations',
      defaultValue: [{ id: 1, text: 'a' }],
    })

    list.remove(1)
    await nextTick()
    expect(writes.at(-1)?.value).toEqual([])

    list.add({ id: 2, text: 'b' })
    await nextTick()
    list.update(2, { text: 'B' })
    await nextTick()
    expect(writes.at(-1)?.value).toEqual([{ id: 2, text: 'B' }])

    list.clear()
    await nextTick()
    expect(writes.at(-1)?.value).toEqual([])
  })

  it('源码不变式：该文件不得再出现计时器式持久化（注释里的说明不算）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'market-apps/shared/useListStore.ts'),
      'utf8',
    )
    // 上面的注释会引用 setTimeout 来解释为什么不能用它，所以先剥掉注释再看代码
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    expect(code).not.toMatch(/setTimeout|setInterval|\bdebounce\b/)
  })
})
