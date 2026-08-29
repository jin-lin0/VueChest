<script lang="ts">
/** 与 Docs.vue 约定的注入 key：所有文件夹的展开状态（id -> boolean）共享一份响应式表 */
export const DOC_EXPANDED_KEY = 'doc-expanded-map'
</script>

<script setup lang="ts">
import { inject } from 'vue'
import type { DocItem } from '@/docs/types'
import { isFolder } from '@/docs/types'

withDefaults(
  defineProps<{
    nodes: DocItem[]
    activeId: string
    /** 嵌套层级，用于缩进 */
    depth?: number
  }>(),
  { depth: 0 },
)
const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'folder-contextmenu', payload: { node: DocItem; x: number; y: number }): void
}>()

// 共享展开表：默认收起，只展开激活路径或用户主动打开的目录。
const expanded = inject<Record<string, boolean>>(DOC_EXPANDED_KEY, {})

function toggle(n: DocItem) {
  expanded[n.id] = !isOpen(n)
}
function isOpen(n: DocItem) {
  return expanded[n.id] === true
}
function onSelect(id: string) {
  emit('select', id)
}
function onFolderContextMenu(payload: { node: DocItem; x: number; y: number }) {
  emit('folder-contextmenu', payload)
}
function openFolderContextMenu(event: MouseEvent, node: DocItem) {
  emit('folder-contextmenu', { node, x: event.clientX, y: event.clientY })
}
</script>

<template>
  <ul class="doc-nav-list" :style="{ '--depth': depth }">
    <li v-for="n in nodes" :key="n.id">
      <!-- 文件夹节点：可折叠分组（只切换自身展开状态，不影响其它文件夹） -->
      <template v-if="isFolder(n)">
        <button
          class="doc-nav-folder"
          :class="{ open: isOpen(n) }"
          title="右键可展开全部层级"
          @click="toggle(n)"
          @contextmenu.prevent.stop="openFolderContextMenu($event, n)"
        >
          <span class="doc-caret">▸</span>
          <span class="doc-folder-title">{{ n.title }}</span>
        </button>
        <div v-show="isOpen(n)" class="doc-nav-children">
          <DocNavTree
            :nodes="n.children!"
            :active-id="activeId"
            :depth="depth + 1"
            @select="onSelect"
            @folder-contextmenu="onFolderContextMenu"
          />
        </div>
      </template>
      <!-- 叶子文档节点 -->
      <button
        v-else
        class="doc-nav-item"
        :class="{ active: n.id === activeId }"
        @click="onSelect(n.id)"
      >
        {{ n.title }}
      </button>
    </li>
  </ul>
</template>

<style scoped>
.doc-nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* 子级缩进：每深一层左移 */
.doc-nav-children {
  margin-left: var(--space-3, 12px);
  padding-left: var(--space-1, 4px);
  border-left: 1px solid var(--border-light, #eee);
}

.doc-nav-folder {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-primary, #222);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-sm, 6px);
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-fast, 0.15s);
  display: flex;
  align-items: center;
  gap: 6px;
}
.doc-nav-folder:hover {
  background: var(--bg-hover, #f3f4f6);
}
.doc-caret {
  display: inline-block;
  font-size: var(--font-size-caption);
  color: var(--text-muted, #999);
  transition: transform 0.18s ease;
  transform: rotate(0deg);
}
.doc-nav-folder.open .doc-caret {
  transform: rotate(90deg);
}
.doc-folder-title {
  flex: 1;
}

.doc-nav-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-secondary, #555);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-sm, 6px);
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: var(--transition-fast, 0.15s);
  border-left: 3px solid transparent;
}
.doc-nav-item:hover {
  background: var(--bg-hover, #f3f4f6);
  color: var(--text-primary, #222);
}
.doc-nav-item.active {
  background: var(--accent-bg, #eef2ff);
  color: var(--accent, #4f46e5);
  font-weight: 600;
  border-left-color: var(--accent, #4f46e5);
}
</style>
