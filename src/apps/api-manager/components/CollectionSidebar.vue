<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Check, X, Layers3, Download, Upload } from '@lucide/vue'
import type { ApiCollection, SavedRequest } from '../types'
const props = defineProps<{
  collections: ApiCollection[]
  savedRequests: SavedRequest[]
  activeCollectionId: string
}>()
const showNewCollectionInput = defineModel<boolean>('showNew', { required: true })
const newCollectionName = defineModel<string>('name', { required: true })
const workspaceFileRef = ref<HTMLInputElement | null>(null)
const emit = defineEmits<{
  select: [id: string]
  context: [event: MouseEvent, id: string]
  create: []
  cancel: []
  export: []
  import: [event: Event]
}>()
const collectionRequestCount = (id: string) =>
  props.savedRequests.filter((request) => request.collectionId === id).length
</script>

<template>
  <aside class="flow-collection-sidebar">
    <div class="flow-sidebar-heading">
      <span>集合</span>
      <button type="button" aria-label="新建集合" @click="showNewCollectionInput = true">
        <Plus :size="16" />
      </button>
    </div>
    <form
      v-if="showNewCollectionInput"
      class="flow-new-collection"
      @submit.prevent="emit('create')"
    >
      <input
        v-model="newCollectionName"
        type="text"
        aria-label="新集合名称"
        placeholder="集合名称"
        autofocus
        @keydown.esc="emit('cancel')"
      />
      <button type="submit" aria-label="创建集合"><Check :size="15" /></button>
      <button class="cancel" type="button" aria-label="取消新建集合" @click="emit('cancel')">
        <X :size="15" />
      </button>
    </form>
    <nav class="flow-collection-list" aria-label="请求集合">
      <button
        v-for="collection in collections"
        :key="collection.id"
        type="button"
        :class="{ active: collection.id === activeCollectionId }"
        @click="emit('select', collection.id)"
        @contextmenu.prevent="emit('context', $event, collection.id)"
      >
        <Layers3 :size="15" />
        <span>{{ collection.name }}</span>
        <b>{{ collectionRequestCount(collection.id) }}</b>
      </button>
    </nav>
    <div class="flow-sidebar-footer">
      <button type="button" @click="emit('export')"><Download :size="15" /> 导出</button>
      <button type="button" @click="workspaceFileRef?.click()"><Upload :size="15" /> 导入</button>
      <input
        ref="workspaceFileRef"
        type="file"
        accept="application/json,.json"
        hidden
        @change="emit('import', $event)"
      />
    </div>
  </aside>
</template>
