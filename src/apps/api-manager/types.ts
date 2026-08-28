import type { AuthConfig, ExtractionResult, ExtractionRule } from './collection-runner'
import type { ApiItem } from './defaults'
import type {
  AssertionResult,
  AssertionRule,
  EnvironmentVariable,
  RequestHeader,
} from './request-utils'

export interface ApiResponse {
  status: number
  statusText: string
  data: unknown
  time: number
  contentType: string
  headers: Record<string, string>
  imageUrl?: string
  truncated: boolean
  size: number
}

export interface RequestHistoryItem {
  id: string
  apiId: string | number
  apiName: string
  method: ApiItem['method']
  createdAt: string
  time: number
  status?: number
  ok: boolean
  error?: string
}

export interface ApiEnvironment {
  id: string
  name: string
  variables: EnvironmentVariable[]
}

export interface ApiCollection {
  id: string
  name: string
  color: string
}

export interface SavedRequest {
  id: string
  name: string
  collectionId: string
  apiId: string | number
  paramValues: Record<string, string>
  headers: RequestHeader[]
  body: string
  assertions: AssertionRule[]
  auth?: AuthConfig
  extractions?: ExtractionRule[]
  retryCount?: number
  timeoutMs?: number
  createdAt: string
}

export interface AuthDraft {
  type: AuthConfig['type']
  token: string
  name: string
  value: string
  location: 'header' | 'query'
  username: string
  password: string
}

export interface CollectionRunResult {
  id: string
  name: string
  status?: number
  statusText?: string
  time: number
  ok: boolean
  testsPassed: number
  testsTotal: number
  request: {
    method: ApiItem['method']
    url: string
    headers: Record<string, string>
    body: string
  }
  response?: {
    headers: Record<string, string>
    body: string
    contentType: string
    size: number
    truncated: boolean
  }
  assertions: AssertionResult[]
  extractions: ExtractionResult[]
  error?: string
}

export interface CollectionRuntimeVariable {
  key: string
  value: string
  sourceRequestId: string
  sourceRequestName: string
}

export interface SavedRequestRun {
  result: CollectionRunResult
  extracted: Array<{ variable: string; value: string }>
}

export type WorkspaceStepTab = 'request' | 'response' | 'extract' | 'assertions'
export type WorkspaceResponseSection = 'body' | 'headers'
