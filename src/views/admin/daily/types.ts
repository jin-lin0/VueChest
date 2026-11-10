export type CredentialFieldType = 'password' | 'text' | 'textarea'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface CredentialField {
  key: string
  label: string
  type?: CredentialFieldType
  required?: boolean
  placeholder?: string
  help?: string
}

export interface RunRecord {
  id: number
  success: boolean
  durationMs: number
  detail?: string | null
  createdAt: string
}

export interface TaskItem {
  id: string
  name: string
  description?: string
  timeZone: string
  executor: 'server' | 'worker' | 'global'
  requiresCredentials?: boolean
  enabled: boolean
  credentialFields: CredentialField[]
  configured: boolean
  running: boolean
  todayCompleted: boolean
  lastCompletedDate: string | null
  lastRun: RunRecord | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

export interface LogRecord extends RunRecord {
  ownerId: number | null
  task: string
}

export interface PagedData<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface RunResult {
  task: string
  status: string
  summary: string
  recorded?: boolean
}
