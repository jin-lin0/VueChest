<script setup lang="ts">
import { CustomSelect } from '@/components'
import { computed } from 'vue'
const props = defineProps<{ goal: number; completed: number; due: number; busy: boolean }>()
const emit = defineEmits<{ 'update:goal': [value: number]; review: [] }>()
const goals = computed(() =>
  [...new Set([5, 10, 15, 20, 30, 50, props.goal])]
    .sort((a, b) => a - b)
    .map((value) => ({ value, label: `每天 ${value} 题` })),
)
</script>

<template>
  <section class="review-plan" aria-label="每日复习计划">
    <div class="plan-summary">
      <strong>今日计划</strong>
      <span role="status"
        >已练 {{ completed }} / {{ goal }} 题{{ completed >= goal ? ' · 目标已完成' : '' }}</span
      >
      <progress :value="Math.min(completed, goal)" :max="goal" aria-label="今日练习进度"></progress>
      <small>同一天同一道题只计一次；到期题优先复习。</small>
    </div>
    <div class="plan-actions">
      <CustomSelect
        :model-value="props.goal"
        :options="goals"
        @update:model-value="emit('update:goal', Number($event))"
      />
      <button type="button" :disabled="busy || due === 0" @click="emit('review')">
        到期复习 · {{ due }} 题
      </button>
    </div>
  </section>
</template>

<style scoped>
.review-plan {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  border-radius: 16px;
}
.plan-summary {
  display: grid;
  gap: 0.45rem;
  flex: 1;
  min-width: 200px;
  color: var(--text-primary);
}
.plan-summary span {
  font-size: var(--font-size-body);
}
.plan-summary small {
  color: var(--text-secondary);
}
progress {
  width: min(100%, 320px);
  height: 0.5rem;
  accent-color: var(--accent);
}
.plan-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.plan-actions button {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 0.65rem 1rem;
  background: var(--accent-bg);
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.plan-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (max-width: 600px) {
  .plan-actions {
    width: 100%;
  }
}
</style>
