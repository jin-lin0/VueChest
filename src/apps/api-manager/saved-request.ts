import type { ApiItem } from './defaults'
import { REQUEST_TIMEOUT_MS } from './request-executor'
import type { RequestHeader } from './request-utils'
import type { SavedRequest } from './types'
import { canSendBody } from './request-body'

interface SavedRequestFactoryOptions {
  createId?: () => string
  now?: () => string
}

const defaultFactoryOptions: Required<SavedRequestFactoryOptions> = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

function factoryOptions(options: SavedRequestFactoryOptions): Required<SavedRequestFactoryOptions> {
  return { ...defaultFactoryOptions, ...options }
}

export function createRequestHeader(
  name = '',
  value = '',
  createId: () => string = defaultFactoryOptions.createId,
): RequestHeader {
  return { id: createId(), name, value, enabled: true }
}

export function createSavedRequestFromApi(
  api: ApiItem,
  collectionId: string,
  name = api.name,
  options: SavedRequestFactoryOptions = {},
): SavedRequest {
  const factory = factoryOptions(options)
  return {
    id: factory.createId(),
    name,
    collectionId,
    apiId: api.id,
    paramValues: Object.fromEntries(api.params.map((param) => [param.name, param.defaultValue])),
    headers: [createRequestHeader('Accept', '*/*', factory.createId)],
    body: canSendBody(api.method) ? '{\n  \n}' : '',
    assertions: [
      { id: factory.createId(), type: 'status', expected: '200', enabled: true },
      { id: factory.createId(), type: 'time', expected: '2000', enabled: false },
    ],
    auth: { type: 'none' },
    extractions: [],
    retryCount: 0,
    timeoutMs: REQUEST_TIMEOUT_MS,
    createdAt: factory.now(),
  }
}

export function cloneSavedRequestToCollection(
  saved: SavedRequest,
  collectionId: string,
  options: SavedRequestFactoryOptions = {},
): SavedRequest {
  const factory = factoryOptions(options)
  return {
    ...saved,
    id: factory.createId(),
    collectionId,
    paramValues: { ...saved.paramValues },
    formFields: saved.formFields?.map((field) => ({ ...field, id: factory.createId() })),
    headers: saved.headers.map((header) => ({ ...header, id: factory.createId() })),
    assertions: saved.assertions.map((rule) => ({ ...rule, id: factory.createId() })),
    extractions: (saved.extractions || []).map((rule) => ({
      ...rule,
      id: factory.createId(),
    })),
    auth: saved.auth ? { ...saved.auth } : { type: 'none' },
    createdAt: factory.now(),
  }
}
