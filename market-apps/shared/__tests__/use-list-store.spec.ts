// @vitest-environment happy-dom
/**
 * `useListStore` 的持久化**时机**。
 *
 * 核心不变式只有一句：一次改动必须在同一个任务内落到桥接上，
 * 不能把唯一副本压在计时器里。市场应用跑在不透明源 iframe（`public/sandbox.html`）里，
 * 宿主切换应用或返回时会直接把 iframe 移出 DOM，其中的计时器随之被销毁。
 * 2026-10-15 用 `iframe_teardown_delivery_probe.js` 实测（sandbox="allow-scripts"）：
 *   - 子 frame 在拆除前同步发出的 `postMessage`：父站**收得到**（1/1）；
 *   - 子 frame 里 `setTimeout(…, 500)`：iframe 移除后**一次都没执行**（0/1）；
 *   - 拆除时 `pagehide`/`unload`/`beforeunload`/`visibilitychange` **一个都不触发**（[]）。
 * 于是旧的 500ms 防抖 = 「用户改完立刻点返回 → 改动凭空消失，且没有任何提示」，
 * 而「在 pagehide 里补一次 flush」这种看起来对的修法其实一行都不会执行。
 *
 * 因此断言全部只看「推进微任务后有没有写」：**不推进任何计时器**。
 * 旧实现（写入压在 500ms 定时器里）在这里必然是 0 次。
 */
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
  // 走真实 bridge（不 mock）：这样「改动 → 桥接」这段同步性本身也被测到。
  // 记录时必须快照，因为沙箱侧 `setStorage` 也是 `JSON.parse(JSON.stringify(value))` ——
  // 直接存引用的话，先前那条记录的 value 会随之后的 push 一起变，断言就成了假的。
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
