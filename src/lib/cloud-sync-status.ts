import type { WorkspaceSyncState } from '@/stores/workspace'

export type CloudSyncStatus = 'local' | 'disabled' | 'pending' | 'syncing' | 'synced' | 'error'

interface CloudSyncStatusInput {
  authenticated: boolean
  selectedCount: number
  selectiveSyncing: boolean
  remoteUpdatedAt: number | null
  workspaceSelected: boolean
  workspaceSyncState: WorkspaceSyncState
  workspaceLastSyncedAt: number | null
}

export function resolveCloudSyncStatus(input: CloudSyncStatusInput): CloudSyncStatus {
  if (!input.authenticated) return 'local'
  if (!input.selectedCount) return 'disabled'
  if (
    input.selectiveSyncing ||
    (input.workspaceSelected && input.workspaceSyncState === 'syncing')
  ) {
    return 'syncing'
  }
  if (input.workspaceSelected && input.workspaceSyncState === 'error') return 'error'
  if (input.remoteUpdatedAt || (input.workspaceSelected && input.workspaceLastSyncedAt)) {
    return 'synced'
  }
  return 'pending'
}
