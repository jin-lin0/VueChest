<script setup lang="ts">
defineProps<{
  sections: {
    key: string
    title: string
    collapsible?: boolean
    collapsed?: boolean
    items: { id: string; name: string; icon: string; desc: string }[]
  }[]
  activeId: string
  pinnedIds: string[]
  search: string
  empty: boolean
}>()
const emit = defineEmits<{
  'update:search': [v: string]
  select: [id: string]
  ctxmenu: [e: MouseEvent, id: string]
  toggle: [key: string]
}>()
</script>

<template>
  <div class="tb-search">
    <span class="tb-search-icon">🔍</span>
    <input
      :value="search"
      class="tb-search-input"
      type="text"
      placeholder="搜索工具…"
      aria-label="搜索工具"
      @input="emit('update:search', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="search"
      class="tb-search-clear"
      aria-label="清除"
      @click="emit('update:search', '')"
    >
      ✕
    </button>
  </div>
  <template v-for="sec in sections" :key="sec.key">
    <button
      v-if="sec.collapsible"
      class="tb-group-title tb-group-toggle"
      :class="{ collapsed: sec.collapsed }"
      @click="emit('toggle', sec.key)"
    >
      <span class="tb-caret">{{ sec.collapsed ? '▸' : '▾' }}</span
      ><span>{{ sec.title }}</span>
    </button>
    <div v-else class="tb-group-title">{{ sec.title }}</div>
    <template v-if="sec.items.length">
      <button
        v-for="t in sec.items"
        :key="t.id"
        class="tb-tool-btn"
        :class="{ active: t.id === activeId }"
        :title="t.desc"
        @click="emit('select', t.id)"
        @contextmenu="emit('ctxmenu', $event, t.id)"
      >
        <span class="tb-tool-icon">{{ t.icon }}</span>
        <span class="tb-tool-name">{{ t.name }}</span>
        <span v-if="pinnedIds.includes(t.id)" class="tb-pin-dot">📌</span>
      </button>
    </template>
  </template>
  <p v-if="empty" class="tb-empty">未找到匹配「{{ search }}」的工具</p>
</template>

<style scoped>
.tb-search {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  margin-bottom: 0.4rem;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}
.tb-search-icon {
  opacity: 0.55;
  font-size: 0.85rem;
}
.tb-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-body);
  font-size: 0.85rem;
}
.tb-search-input::placeholder {
  color: var(--text-muted);
}
.tb-search-clear {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 0.2rem;
}
.tb-search-clear:hover {
  color: var(--text-primary);
}

.tb-group-title {
  margin: 0.7rem 0.3rem 0.3rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tb-group-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  text-transform: uppercase;
}
.tb-group-toggle:hover {
  color: var(--text-secondary);
}
.tb-caret {
  font-size: 0.6rem;
  transition: transform 0.15s ease;
}
.tb-empty {
  margin: 0.5rem 0.4rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.tb-tool-btn {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  border: 1px solid transparent;
  background: transparent;
  font-size: 0.9rem;
  text-align: left;
  transition: var(--transition-fast);
}
.tb-tool-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}
.tb-tool-btn.active {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border-color: transparent;
  font-weight: 600;
}
.tb-tool-btn.active .tb-pin-dot {
  filter: grayscale(1) brightness(2);
}
.tb-tool-icon {
  font-size: 1.1rem;
}
.tb-tool-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-pin-dot {
  font-size: 0.7rem;
  opacity: 0.85;
}

@media (max-width: 720px) {
  .tb-search {
    padding: 0.5rem 0.6rem;
  }
  .tb-tool-btn {
    justify-content: flex-start;
  }
}
</style>
