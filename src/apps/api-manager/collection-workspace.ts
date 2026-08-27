export interface CollectionRequestRecord {
  id: string
  collectionId: string
}

export interface VariableValue {
  key: string
  value: string
}

export interface RuntimeVariableRecord extends VariableValue {
  id: string
  enabled: boolean
}

export function requestsForCollection<T extends CollectionRequestRecord>(
  requests: readonly T[],
  collectionId: string,
) {
  return requests.filter((request) => request.collectionId === collectionId)
}

export function upsertCollectionRequest<T extends CollectionRequestRecord>(
  requests: readonly T[],
  request: T,
) {
  const existingIndex = requests.findIndex((item) => item.id === request.id)
  if (existingIndex < 0) return [request, ...requests]

  return requests.map((item, index) => (index === existingIndex ? request : item))
}

export function findVariableReferences(values: readonly string[]) {
  const references = new Set<string>()
  const pattern = /{{\s*([^{}]+?)\s*}}/g

  for (const value of values) {
    for (const match of value.matchAll(pattern)) {
      const key = match[1]?.trim()
      if (key) references.add(key)
    }
  }

  return [...references]
}

export function createRuntimeVariableContext(
  environmentVariables: readonly RuntimeVariableRecord[],
) {
  return environmentVariables.filter((item) => item.enabled).map((item) => ({ ...item }))
}

export function mergeRuntimeVariables(
  current: readonly RuntimeVariableRecord[],
  extracted: readonly VariableValue[],
) {
  const next = current.map((item) => ({ ...item }))

  for (const variable of extracted) {
    const index = next.findIndex((item) => item.key === variable.key)
    const record: RuntimeVariableRecord = {
      id: index >= 0 ? next[index].id : `runtime:${variable.key}`,
      key: variable.key,
      value: variable.value,
      enabled: true,
    }
    if (index >= 0) next[index] = record
    else next.push(record)
  }

  return next
}

export function toggleSelection<T>(selected: readonly T[], value: T) {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
}

export function isRequestUrlTemplate(value: string) {
  return /^(https?:\/\/|{{\s*[\w.-]+\s*}})/i.test(value.trim())
}
