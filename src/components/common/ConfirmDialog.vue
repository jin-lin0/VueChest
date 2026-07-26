<template>
  <transition name="confirm-fade">
    <div v-if="state.visible" class="confirm-overlay" @click.self="handleCancel">
      <div class="confirm-dialog" role="alertdialog" aria-modal="true">
        <p class="confirm-message">{{ state.message }}</p>
        <div class="confirm-actions">
          <button class="confirm-cancel" @click="handleCancel">取消</button>
          <button class="confirm-ok" @click="handleConfirm">确定</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useConfirmController } from '@/composables/useConfirm'

const { state, handleConfirm, handleCancel } = useConfirmController()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && state.visible) handleCancel()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  padding: 24px;
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  width: 100%;
  max-width: 420px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.confirm-message {
  margin: 0 0 20px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.confirm-cancel,
.confirm-ok {
  padding: 9px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.confirm-cancel {
  background: var(--bg-hover);
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.confirm-cancel:hover {
  background: var(--border-light);
  color: var(--text-primary);
}

.confirm-ok {
  background: var(--danger);
  color: #fff;
  font-weight: 500;
}

.confirm-ok:hover {
  filter: brightness(1.08);
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
