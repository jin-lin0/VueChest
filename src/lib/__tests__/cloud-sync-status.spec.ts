import { describe, expect, it } from 'vitest'
import { resolveCloudSyncStatus } from '../cloud-sync-status'

const base = {
  authenticated: true,
  selectedCount: 3,
  selectiveSyncing: false,
  remoteUpdatedAt: null,
  workspaceSelected: true,
  workspaceSyncState: 'local' as const,
  workspaceLastSyncedAt: null,
}

describe('home cloud sync status', () => {
  it('does not report synced when selected data has no cloud copy', () => {
    expect(resolveCloudSyncStatus(base)).toBe('pending')
  })

  it('respects disabled and local-only states', () => {
    expect(resolveCloudSyncStatus({ ...base, authenticated: false })).toBe('local')
    expect(resolveCloudSyncStatus({ ...base, selectedCount: 0 })).toBe('disabled')
  })

  it('reports selective or workspace progress and failures', () => {
    expect(resolveCloudSyncStatus({ ...base, selectiveSyncing: true })).toBe('syncing')
    expect(resolveCloudSyncStatus({ ...base, workspaceSyncState: 'error' })).toBe('error')
  })

  it('uses either selective data or the selected workspace as cloud evidence', () => {
    expect(resolveCloudSyncStatus({ ...base, remoteUpdatedAt: 10 })).toBe('synced')
    expect(resolveCloudSyncStatus({ ...base, workspaceLastSyncedAt: 10 })).toBe('synced')
    expect(
      resolveCloudSyncStatus({
        ...base,
        workspaceSelected: false,
        workspaceLastSyncedAt: 10,
      }),
    ).toBe('pending')
  })
})
