<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const step = ref(1)

function reset() {
  count.value = 0
}
</script>

<template>
  <div class="counter-app">
    <div class="counter-header">
      <h1>🔢 计数器</h1>
      <p class="counter-desc">一个简单的计数器应用</p>
    </div>

    <div class="counter-body">
      <div class="count-display">{{ count }}</div>

      <div class="counter-controls">
        <button class="ctrl-btn minus" @click="count -= step">−</button>
        <button class="ctrl-btn plus" @click="count += step">+</button>
      </div>

      <div class="step-control">
        <label>步长：</label>
        <div class="step-btns">
          <button :class="{ active: step === 1 }" @click="step = 1">1</button>
          <button :class="{ active: step === 5 }" @click="step = 5">5</button>
          <button :class="{ active: step === 10 }" @click="step = 10">10</button>
        </div>
      </div>

      <button class="reset-btn" @click="reset">重置</button>
    </div>
  </div>
</template>

<style scoped>
.counter-app {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text-primary);
}

.counter-header h1 {
  font-size: 1.8rem;
  margin: 0 0 0.3rem;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.counter-desc {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0 0 2rem;
}

.counter-body {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}

.count-display {
  font-size: 4rem;
  font-weight: 800;
  color: var(--accent);
  margin-bottom: 1.5rem;
  font-variant-numeric: tabular-nums;
}

.counter-controls {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.ctrl-btn {
  width: 64px;
  height: 64px;
  border: none;
  border-radius: 50%;
  font-size: 2rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctrl-btn.minus {
  background: #fee2e2;
  color: #ef4444;
}

.ctrl-btn.minus:hover {
  background: #fecaca;
  transform: scale(1.05);
}

.ctrl-btn.plus {
  background: #dbeafe;
  color: #3b82f6;
}

.ctrl-btn.plus:hover {
  background: #bfdbfe;
  transform: scale(1.05);
}

.step-control {
  margin-bottom: 1.2rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.step-btns {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.5rem;
}

.step-btns button {
  padding: 0.4rem 1rem;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.step-btns button.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
  border-color: transparent;
}

.step-btns button:hover:not(.active) {
  border-color: var(--accent);
}

.reset-btn {
  padding: 0.6rem 2rem;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.reset-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

</style>
