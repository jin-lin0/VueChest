<script lang="ts">
/** 与 Docs.vue 约定的注入 key：所有文件夹的展开状态（id -> boolean）共享一份响应式表 */
export const DOC_EXPANDED_KEY = 'doc-expanded-map'
</script>

<script setup lang="ts">
import { inject } from 'vue'
import type { DocItem } from '@/docs/types'
import { isFolder } from '@/docs/types'

const props = withDefaults(
  defineProps<{
    nodes: DocItem[]
    activeId: string
    /** 嵌套层级，用于缩进 */
    depth?: number
  }>(),
  { depth: 0 },
)
const emit = defineEmits<{ (e: 'select', id: string): void }>()

// 共享展开表：缺失视为收起（undefined 当作 false）
const expanded = inject<Record<string, boolean>>(DOC_EXPANDED_KEY, {})

function toggle(n: DocItem) {
  expanded[n.id] = !expanded[n.id]
}
function onSelect(id: string) {
  emit('select', id)
}
</script>

<template>
  <ul class="doc-nav-list" :style="{ '--depth': depth }">
    <li v-for="n in nodes" :key="n.id">
      <!-- 文件夹节点：可折叠分组（只切换自身展开状态，不影响其它文件夹） -->
      <template v-if="isFolder(n)">
        <button class="doc-nav-folder" :class="{ open: expanded[n.id] }" @click="toggle(n)">
          <span class="doc-caret">▸</span>
          <span class="doc-folder-title">{{ n.title }}</span>
        </button>
        <div v-show="expanded[n.id]" class="doc-nav-children">
          <DocNavTree
            :nodes="n.children!"
            :active-id="activeId"
            :depth="depth + 1"
            @select="onSelect"
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
  font-size: 14px;
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
  font-size: 10px;
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
  font-size: 14px;
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
