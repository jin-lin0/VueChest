import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { dbApplyPatch, dbGetAll } from '../db'
import { applyStoragePatch, getStorage, initStorage } from '../storage'

describe('durable storage patches', () => {
  it('persists the recovery point before replacing data and preserves unrelated keys', async () => {
    await initStorage()
    await applyStoragePatch({
      recovery: { original: 1 },
      selected: { original: 1 },
      unrelated: 'keep',
    })
    await applyStoragePatch({ selected: { cloud: 2 }, empty: null })
    expect(getStorage('selected')).toEqual({ cloud: 2 })
    expect(await dbGetAll()).toMatchObject({
      recovery: { original: 1 },
      selected: { cloud: 2 },
      unrelated: 'keep',
    })
    await applyStoragePatch({ selected: getStorage('recovery') })
    expect((await dbGetAll()).selected).toEqual({ original: 1 })
  })

  it('rolls back a transaction containing an uncloneable value', async () => {
    await dbApplyPatch({ transactionFirst: 'before' })
    await expect(
      dbApplyPatch({ transactionFirst: 'after', transactionBad: () => undefined }),
    ).rejects.toThrow()
    expect((await dbGetAll()).transactionFirst).toBe('before')
  })
})
