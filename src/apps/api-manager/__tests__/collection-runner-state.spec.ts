import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useCollectionRunner } from '../useCollectionRunner'
import { createSavedRequestFromApi } from '../saved-request'
import type { ApiItem } from '../defaults'
import type { SavedRequestRun } from '../types'

const api: ApiItem = {
  id: 'one',
  name: '请求',
  method: 'GET',
  url: 'https://example.com',
  params: [],
  description: '',
  category: '',
}
const completed = (id: string): SavedRequestRun => ({
  result: {
    id,
    name: id,
    ok: true,
    time: 1,
    testsPassed: 0,
    testsTotal: 0,
    request: { method: 'GET', url: api.url, headers: {}, body: '' },
    assertions: [],
    extractions: [],
  },
  extracted: [],
})

describe('collection execution ownership', () => {
  it('switching collection cancels and suppresses an old completion while the new one runs', async () => {
    const scope = effectScope()
    const collectionId = ref('first')
    const requests = ref([createSavedRequestFromApi(api, 'first')])
    const pending: Array<(value: SavedRequestRun) => void> = []
    const signals: AbortSignal[] = []
    const notify = vi.fn()
    const runner = scope.run(() =>
      useCollectionRunner({
        collectionId,
        requests,
        variables: ref([]),
        files: ref({}),
        apiFor: () => api,
        select: vi.fn(),
        notify,
        execute: vi.fn((_request, _api, _variables, options) => {
          signals.push(options!.signal!)
          return new Promise<SavedRequestRun>((resolve) => pending.push(resolve))
        }),
      }),
    )!
    const first = runner.runActiveCollection()
    collectionId.value = 'second'
    expect(signals[0].aborted).toBe(true)
    const second = runner.runActiveCollection()
    pending[0](completed('old'))
    await first
    expect(runner.collectionRunning.value).toBe(true)
    expect(runner.collectionResults.value).toEqual([])
    expect(notify).not.toHaveBeenCalled()
    pending[1](completed('new'))
    await second
    expect(runner.collectionResults.value[0].id).toBe('new')
    scope.stop()
  })

  it('uses a fixed request snapshot and aborts on scope disposal', async () => {
    const scope = effectScope()
    const requests = ref([
      createSavedRequestFromApi(api, 'first'),
      createSavedRequestFromApi(api, 'first'),
    ])
    let finish!: (value: SavedRequestRun) => void
    const execute = vi.fn(
      (_request, _api, _variables, options) =>
        new Promise<SavedRequestRun>((resolve) => {
          finish = resolve
          expect(options.signal.aborted).toBe(false)
        }),
    )
    const runner = scope.run(() =>
      useCollectionRunner({
        collectionId: ref('first'),
        requests,
        variables: ref([]),
        files: ref({}),
        apiFor: () => api,
        select: vi.fn(),
        notify: vi.fn(),
        execute,
      }),
    )!
    const running = runner.runActiveCollection()
    requests.value[0].name = 'changed during run'
    expect(execute.mock.calls[0][0].name).toBe('请求')
    scope.stop()
    expect(execute.mock.calls[0][3].signal.aborted).toBe(true)
    finish(completed('late'))
    await running
    expect(execute).toHaveBeenCalledTimes(1)
    expect(runner.collectionResults.value).toEqual([])
  })
})
