<template>
  <div class="vc-collapse" :class="{ 'is-open': open }">
    <button
      type="button"
      class="vc-collapse-head"
      :class="{ 'is-disabled': disabled }"
      :aria-expanded="open"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="vc-collapse-chevron" aria-hidden="true">▸</span>
      <span class="vc-collapse-title">
        <slot name="header">{{ title }}</slot>
      </span>
    </button>
    <div v-show="open" class="vc-collapse-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 受控模式：展开状态（v-model） */
    modelValue?: boolean
    /** 非受控默认是否展开 */
    defaultOpen?: boolean
    /** 标题（无 #header 插槽时用） */
    title?: string
    /** 禁用展开/收起 */
    disabled?: boolean
  }>(),
  {
    modelValue: undefined,
    defaultOpen: false,
    title: '',
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'toggle', v: boolean): void
}>()

// 受控优先；非受控时由内部 ref 维护展开状态
const isControlled = computed(() => props.modelValue !== undefined)
const innerOpen = ref(props.defaultOpen)
const open = computed(() => (isControlled.value ? props.modelValue! : innerOpen.value))

function toggle() {
  if (props.disabled) return
  const next = !open.value
  if (isControlled.value) {
    emit('update:modelValue', next)
  } else {
    innerOpen.value = next
  }
  emit('toggle', next)
}
</script>

<style scoped>
.vc-collapse {
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-subtle, #f8fafc);
  overflow: hidden;
}
.vc-collapse-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 0.8rem;
  background: transparent;
  border: none;
  color: var(--text-secondary, #475569);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: color var(--transition-fast, 0.15s);
}
.vc-collapse-head:hover:not(.is-disabled) {
  color: var(--text-primary, #1e293b);
}
.vc-collapse-head.is-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.vc-collapse-chevron {
  display: inline-block;
  font-size: 0.7rem;
  transition: transform var(--transition-fast, 0.15s);
  transform: rotate(0deg);
}
.vc-collapse.is-open .vc-collapse-chevron {
  transform: rotate(90deg);
}
.vc-collapse-title {
  flex: 1;
}
.vc-collapse-body {
  padding: 0.2rem 0.8rem 0.9rem;
}
</style>
