import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

const storage = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@/lib/storage', () => ({
  getStorage: (key: string, fallback?: unknown) =>
    storage.has(key) ? storage.get(key) : (fallback ?? null),
}))

import { STORAGE_KEYS } from '@/config'
import { useStockCommandProvider } from '../stock/commands'
import { useInterviewCommandProvider } from '../interview/commands'
import { useApiManagerCommandProvider } from '../api-manager/commands'

const createContext = () => {
  const push = vi.fn()
  return { push, context: { router: { push } as unknown as Router } }
}

beforeEach(() => storage.clear())

describe('app command providers', () => {
  it('exposes portfolio and dynamic stock research commands', async () => {
    storage.set(STORAGE_KEYS.STOCK_RECENT, [{ code: '600519', name: '贵州茅台' }])
    const commands = useStockCommandProvider().commands()
    expect(commands.map((command) => command.label)).toContain('查看模拟持仓')
    const research = commands.find((command) => command.id === 'stock-open-600519')!
    const { push, context } = createContext()

    await research.execute(context)

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/stock',
        query: expect.objectContaining({ code: '600519' }),
      }),
    )
  })

  it('describes interview actions from persisted learning state', () => {
    storage.set(STORAGE_KEYS.INTERVIEW_LEARNING, {
      version: 1,
      records: {},
      favorites: [],
      lastQuestionId: 42,
    })
    const commands = useInterviewCommandProvider().commands()
    expect(
      commands.find((command) => command.id === 'interview-continue')?.disabledReason?.(),
    ).toBeNull()
    expect(commands.map((command) => command.id)).toEqual(
      expect.arrayContaining(['interview-random', 'interview-unpracticed', 'interview-review']),
    )
  })

  it('exposes saved API requests and runnable collections', async () => {
    storage.set(STORAGE_KEYS.API_MANAGER_COLLECTIONS, [{ id: 'users', name: '用户流程' }])
    storage.set(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, [
      { id: 'get-user', name: '获取用户', collectionId: 'users' },
    ])
    const commands = useApiManagerCommandProvider().commands()
    const run = commands.find((command) => command.id === 'api-run-collection-users')!
    const { push, context } = createContext()

    await run.execute(context)

    expect(run.disabledReason?.()).toBeNull()
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api-manager',
        query: expect.objectContaining({ runCollection: 'users' }),
      }),
    )
  })
})
