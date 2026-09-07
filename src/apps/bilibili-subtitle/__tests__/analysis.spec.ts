// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import { useBilibiliAnalysis } from '../composables/useBilibiliAnalysis'
import { streamBilibiliRequest } from '../stream'
import type { AnalysisResponse, ExtractResult } from '../types'

vi.mock('@/lib/db', () => ({
  dbSet: vi.fn().mockResolvedValue(undefined),
  dbGet: vi.fn().mockResolvedValue(undefined),
  dbDelete: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../stream', () => ({ streamBilibiliRequest: vi.fn() }))
vi.mock('@/apps/ai-chat/config', () => ({
  fetchProviders: async () => [
    { id: 'test', name: 'Test', defaultModel: 'model', models: [{ id: 'model', name: 'Model' }] },
  ],
  resolveModelSelection: () => 'model',
}))
const stream = vi.mocked(streamBilibiliRequest)
let app: App
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function setup(pages = 1) {
  let analysis!: ReturnType<typeof useBilibiliAnalysis>
  const result = ref<ExtractResult>({
    title: 'Video',
    bvid: 'BVtest',
    all: true,
    pages: Array.from({ length: pages }, (_, index) => ({
      cid: index + 1,
      page: index + 1,
      part: `Part ${index + 1}`,
      duration: 10,
      text: `Subtitle ${index + 1}`,
    })),
  })
  app = createApp({
    setup() {
      analysis = useBilibiliAnalysis(result, vi.fn(), ref(false))
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  await flush()
  return analysis
}
const response = (content: string): AnalysisResponse => ({
  content,
  structured: null,
  model: 'model',
  chunkCount: 1,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
afterEach(() => {
  app?.unmount()
})

describe('subtitle analysis request ownership', () => {
  it('does not publish a late cancelled result into the replacement run', async () => {
    const old = deferred<AnalysisResponse>()
    stream.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(response('New result'))
    const analysis = await setup()
    const first = analysis.runAnalysis()
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(1))
    analysis.cancelAnalysis()
    expect(analysis.analyzing.value).toBe(false)
    await analysis.runAnalysis()
    old.resolve(response('Old result'))
    await first
    expect(analysis.analysisResults.value.map((item) => item.content)).toEqual(['New result'])
    expect(analysis.analysisError.value).toBe('')
  })

  it('keeps workers active after a partial failure and retries only unfinished parts', async () => {
    const slow = deferred<AnalysisResponse>()
    stream
      .mockRejectedValueOnce(new Error('Part one failed'))
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(response('Third'))
    const analysis = await setup(3)
    const first = analysis.runAnalysis()
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(3))
    expect(analysis.analyzing.value).toBe(true)
    slow.resolve(response('Second'))
    await first
    expect(analysis.analysisDone.value).toBe(3)
    expect(analysis.analysisResults.value[0].error).toBe('Part one failed')
    stream.mockResolvedValueOnce(response('First recovered'))
    await analysis.runAnalysis(true)
    expect(stream).toHaveBeenCalledTimes(4)
    expect(analysis.analysisResults.value.map((item) => item.content)).toEqual([
      'First recovered',
      'Second',
      'Third',
    ])
    expect(analysis.analysisError.value).toBe('')
  })

  it('cannot restore results or error text after the video is reset', async () => {
    const old = deferred<AnalysisResponse>()
    stream.mockImplementationOnce(() => old.promise)
    const analysis = await setup()
    const first = analysis.runAnalysis()
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce())
    analysis.resetAnalysis()
    old.reject(new Error('late failure'))
    await first
    expect(analysis.analysisResults.value).toEqual([])
    expect(analysis.analysisError.value).toBe('')
    expect(analysis.analysisDone.value).toBe(0)
  })

  it('ignores duplicate follow-up submissions and removes a failed unanswered turn', async () => {
    stream.mockResolvedValueOnce(response('Overview'))
    const analysis = await setup()
    await analysis.runAnalysis()
    const pending = deferred<AnalysisResponse>()
    stream.mockImplementationOnce(() => pending.promise)
    const item = analysis.analysisResults.value[0]
    const first = analysis.askAnalysisQuestion(item, 'Question')
    await analysis.askAnalysisQuestion(item, 'Duplicate')
    expect(stream).toHaveBeenCalledTimes(2)
    pending.reject(new Error('Network failed'))
    await first
    expect(analysis.analysisThreadFor(item.id)).toMatchObject({
      asking: false,
      messages: [],
      error: 'Network failed',
    })
  })
})
