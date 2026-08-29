<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type">
        <span class="toast-icon">{{ icons[toast.type] }}</span>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" @click="removeToast(toast.id)">&times;</button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ name: 'AppToast' })

interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

const icons: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

const toasts = ref<Toast[]>([])
let nextId = 1

function addToast(type: Toast['type'], message: string, duration = 3000) {
  const id = nextId++
  toasts.value.push({ id, type, message })
  setTimeout(() => removeToast(id), duration)
}

function removeToast(id: number) {
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx > -1) toasts.value.splice(idx, 1)
}

defineExpose({ addToast, removeToast })
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  font-size: var(--font-size-body);
  min-width: 280px;
  max-width: 420px;
  pointer-events: auto;
  backdrop-filter: blur(8px);
}

.toast.success {
  background: #065f46;
  color: #d1fae5;
  border: 1px solid #059669;
}
.toast.error {
  background: #7f1d1d;
  color: #fecaca;
  border: 1px solid #dc2626;
}
.toast.warning {
  background: #78350f;
  color: #fef3c7;
  border: 1px solid #d97706;
}
.toast.info {
  background: #1e3a5f;
  color: #dbeafe;
  border: 1px solid #3b82f6;
}

.toast-icon {
  font-size: var(--font-size-title-lg);
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  font-size: var(--font-size-heading);
  cursor: pointer;
  padding: 0 0 0 8px;
  flex-shrink: 0;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active {
  transition: all 0.3s ease;
}
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
