import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { createRuntimeVariableContext, mergeRuntimeVariables } from './collection-workspace'
import { runSavedRequest } from './request-executor'
import type { ApiItem } from './defaults'
import type { EnvironmentVariable } from './request-utils'
import type { RequestFiles } from './request-body'
import type { CollectionRunResult, CollectionRuntimeVariable, SavedRequest } from './types'

interface Options {
  collectionId: Readonly<Ref<string>>
  requests: Readonly<Ref<SavedRequest[]>>
  variables: Readonly<Ref<EnvironmentVariable[]>>
  files: Readonly<Ref<RequestFiles>>
  apiFor: (request: SavedRequest) => ApiItem | undefined
  select: (id: string, completed: boolean) => void
  notify: (type: 'info' | 'success' | 'warning', message: string) => void
  execute?: typeof runSavedRequest
}

export function useCollectionRunner(options: Options) {
  const collectionRunning = ref(false)
  const collectionResults = ref<CollectionRunResult[]>([])
  const collectionRuntimeVariables = ref<CollectionRuntimeVariable[]>([])
  const runningRequestId = ref<string | null>(null)
  let controller: AbortController | null = null

  function stopCollection() {
    controller?.abort()
    controller = null
    collectionRunning.value = false
    runningRequestId.value = null
  }
  watch(
    options.collectionId,
    () => {
      stopCollection()
      collectionResults.value = []
      collectionRuntimeVariables.value = []
    },
    { flush: 'sync' },
  )
  onScopeDispose(stopCollection)

  async function runActiveCollection() {
    if (collectionRunning.value) return
    if (!options.requests.value.length) {
      options.notify('info', '当前集合还没有请求')
      return
    }
    const requests: SavedRequest[] = JSON.parse(JSON.stringify(options.requests.value))
    const apis = requests.map((request) => {
      const api = options.apiFor(request)
      return api ? (JSON.parse(JSON.stringify(api)) as ApiItem) : undefined
    })
    const files = { ...options.files.value }
    const own = new AbortController()
    controller = own
    collectionRunning.value = true
    collectionResults.value = []
    collectionRuntimeVariables.value = []
    let runtime = createRuntimeVariableContext(options.variables.value.map((item) => ({ ...item })))
    try {
      for (const [index, request] of requests.entries()) {
        if (controller !== own) return
        runningRequestId.value = request.id
        options.select(request.id, false)
        const execution = await (options.execute || runSavedRequest)(
          request,
          apis[index],
          runtime,
          { files, signal: own.signal },
        )
        if (controller !== own) return
        collectionResults.value.push(execution.result)
        options.select(request.id, true)
        runtime = mergeRuntimeVariables(
          runtime,
          execution.extracted.map((item) => ({ key: item.variable, value: item.value })),
        )
        for (const variable of execution.extracted) {
          const record = {
            key: variable.variable,
            value: variable.value,
            sourceRequestId: request.id,
            sourceRequestName: request.name,
          }
          const existing = collectionRuntimeVariables.value.findIndex(
            (item) => item.key === record.key,
          )
          if (existing >= 0) collectionRuntimeVariables.value[existing] = record
          else collectionRuntimeVariables.value.push(record)
        }
      }
      const passed = collectionResults.value.filter((item) => item.ok).length
      options.notify(
        passed === requests.length ? 'success' : 'warning',
        `集合运行完成：${passed}/${requests.length} 通过`,
      )
    } finally {
      if (controller === own) stopCollection()
    }
  }
  return {
    collectionRunning,
    collectionResults,
    collectionRuntimeVariables,
    runningRequestId,
    runActiveCollection,
    stopCollection,
  }
}
