<script setup lang="ts">
import { computed, ref } from 'vue'
import { copyToClipboard } from '@/utils/clipboard'
import Toast from './Toast.vue'

type ToastType = 'success' | 'error' | 'warning' | 'info'

const props = withDefaults(
  defineProps<{
    /** 要复制的文本 */
    text?: string
    /** 显式禁用；不传时自动按 text 是否为空判断 */
    disabled?: boolean
    /** 按钮文案 */
    label?: string
    /** 是否显示 📋 图标 */
    icon?: boolean
    /** 视觉变体，对齐 dev-toolbox 既有按钮类 */
    variant?: 'btn' | 'mini' | 'ghost' | 'primary'
    /** 复制成功提示文案 */
    successText?: string
    /** 复制失败提示文案 */
    errorText?: string
    /** 复制后回调（一般传入调用方已有的 showToast），不传则静默 */
    toast?: (type: ToastType, message: string) => void
  }>(),
  {
    text: '',
    disabled: undefined,
    label: '复制',
    icon: true,
    variant: 'btn',
    successText: '已复制',
    errorText: '复制失败',
  },
)

const emit = defineEmits<{
  (e: 'copied', ok: boolean): void
}>()

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

const isDisabled = computed(() => props.disabled ?? !props.text)

async function onClick() {
  if (isDisabled.value || !props.text) return
  const ok = await copyToClipboard(props.text)
  const type: ToastType = ok ? 'success' : 'error'
  const msg = ok ? props.successText : props.errorText
  if (props.toast) props.toast(type, msg)
  else toastRef.value?.addToast(type, msg)
  emit('copied', ok)
}
</script>

<template>
  <button
    type="button"
    :class="['copy-btn', `copy-btn--${variant}`, { 'is-disabled': isDisabled }]"
    :disabled="isDisabled"
    @click="onClick"
  >
    <span v-if="icon" class="copy-btn__icon">📋</span>
    <span class="copy-btn__label">{{ label }}</span>
  </button>
  <Toast v-if="!toast" ref="toastRef" />
</template>

<style scoped>
.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--bg-card);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1.2;
  transition: var(--transition-fast);
  white-space: nowrap;
  font-family: inherit;
}
.copy-btn:hover:not(.is-disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.copy-btn.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.copy-btn--mini {
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.copy-btn--ghost {
  background: transparent;
}
.copy-btn--primary {
  background: var(--gradient-primary);
  color: var(--accent-contrast);
  border: none;
  font-weight: 600;
}
.copy-btn__icon {
  font-size: 0.95em;
  line-height: 1;
}
.copy-btn--mini .copy-btn__icon {
  font-size: 0.9em;
}
</style>
