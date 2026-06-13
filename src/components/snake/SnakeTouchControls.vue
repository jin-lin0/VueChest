<script setup lang="ts">
const emit = defineEmits<{
  direction: [dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT']
}>()

function press(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
  emit('direction', dir)
}
</script>

<template>
  <div class="dpad">
    <div class="dpad-row">
      <button class="dpad-btn up" @click="press('UP')" aria-label="上">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
    <div class="dpad-row">
      <button class="dpad-btn left" @click="press('LEFT')" aria-label="左">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div class="dpad-center" />
      <button class="dpad-btn right" @click="press('RIGHT')" aria-label="右">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
    <div class="dpad-row">
      <button class="dpad-btn down" @click="press('DOWN')" aria-label="下">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dpad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.dpad-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dpad-center {
  width: 48px;
  height: 48px;
}

.dpad-btn {
  width: 52px;
  height: 52px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.1s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.dpad-btn:active {
  background: rgba(99, 102, 241, 0.5);
  border-color: #6366f1;
  transform: scale(0.92);
}
</style>
