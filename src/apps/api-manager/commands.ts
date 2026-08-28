import { STORAGE_KEYS } from '@/config'
import { getStorage } from '@/lib/storage'
import { defineAppCommandProvider, type AppCommandDefinition } from '@/lib/app-command'

interface CollectionReference {
  id: string
  name: string
}

interface RequestReference {
  id: string
  name: string
  collectionId: string
}

export function useApiManagerCommandProvider() {
  return defineAppCommandProvider({
    appKey: 'builtin:1',
    appName: 'API 工作台',
    commands: () => {
      const collections =
        getStorage<CollectionReference[]>(STORAGE_KEYS.API_MANAGER_COLLECTIONS, []) || []
      const requests =
        getStorage<RequestReference[]>(STORAGE_KEYS.API_MANAGER_SAVED_REQUESTS, []) || []
      const commands: AppCommandDefinition[] = []

      for (const collection of collections.slice(0, 8)) {
        const count = requests.filter((request) => request.collectionId === collection.id).length
        commands.push({
          id: `api-run-collection-${collection.id}`,
          label: `运行 API 集合：${collection.name}`,
          description: `${count} 个请求 · 打开执行视图并按顺序运行`,
          icon: '▶',
          keywords: ['API', '集合', '运行', '请求', collection.name],
          priority: 64,
          disabledReason: () => (count ? null : '这个集合还没有请求'),
          execute: ({ router }) => {
            router.push({
              path: '/api-manager',
              query: {
                runCollection: collection.id,
                command: String(Date.now()),
              },
            })
          },
        })
      }

      commands.push(
        ...requests.slice(0, 12).map(
          (request): AppCommandDefinition => ({
            id: `api-open-request-${request.id}`,
            label: `打开 API 请求：${request.name}`,
            description:
              collections.find((item) => item.id === request.collectionId)?.name || '保存的请求',
            icon: '↗',
            keywords: ['API', '请求', '打开', request.name],
            priority: 52,
            execute: ({ router }) => {
              router.push({
                path: '/api-manager',
                query: { request: request.id, command: String(Date.now()) },
              })
            },
          }),
        ),
      )
      return commands
    },
  })
}
