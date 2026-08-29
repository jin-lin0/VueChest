<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 图标 emoji，留空则不显示 */
    icon?: string
    /** 主标题文案 */
    title?: string
    /** 次要描述文案 */
    description?: string
  }>(),
  {
    icon: '📭',
    title: '',
    description: '',
  },
)
</script>

<template>
  <div class="empty-state">
    <span v-if="icon" class="empty-icon">{{ icon }}</span>
    <p v-if="title" class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 3rem 1rem;
  color: var(--text-muted);
  text-align: center;
}
.empty-icon {
  font-size: var(--font-size-8xl);
  line-height: 1;
}
.empty-title {
  margin: 0;
  font-size: var(--font-size-body-lg);
  color: var(--text-secondary);
}
.empty-desc {
  margin: 0;
  font-size: var(--font-size-body);
  color: var(--text-muted);
}
</style>
