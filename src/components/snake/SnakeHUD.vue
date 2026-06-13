<script setup lang="ts">
import type { SnakeState } from '@/composables/useSnakeGameClient'

const props = defineProps<{
  snakes: SnakeState[]
  myPlayerId: number | null
}>()

const PLAYER_NAMES: Record<number, string> = {
  1: '玩家1',
  2: '玩家2',
  3: '玩家3',
  4: '玩家4',
}

const PLAYER_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#f44336',
  3: '#2196F3',
  4: '#FF9800',
}

function getPlayerName(id: number) {
  return PLAYER_NAMES[id] || `玩家${id}`
}
</script>

<template>
  <div class="hud">
    <div
      v-for="snake in snakes"
      :key="snake.id"
      class="hud-item"
      :class="{ dead: !snake.alive, me: snake.id === myPlayerId }"
    >
      <div class="hud-header">
        <span class="hud-dot" :style="{ background: PLAYER_COLORS[snake.id] || '#888' }" />
        <span class="hud-name">{{ getPlayerName(snake.id) }}</span>
        <span v-if="snake.id === myPlayerId" class="hud-tag">我</span>
      </div>
      <div class="hud-bar-bg">
        <div
          class="hud-bar"
          :style="{
            width: Math.max(0, snake.health) + '%',
            background: snake.health > 60
              ? '#4CAF50'
              : snake.health > 30
                ? '#FF9800'
                : '#f44336',
          }"
        />
      </div>
      <div class="hud-stats">
        <span>❤️ {{ Math.max(0, snake.health) }}</span>
        <span>📏 {{ snake.length }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.hud-item {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 120px;
  flex: 1;
  max-width: 180px;
  border: 2px solid transparent;
  transition: all 0.3s;
}

.hud-item.me {
  border-color: #6366f1;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.3);
}

.hud-item.dead {
  opacity: 0.4;
}

.hud-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.hud-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.hud-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.hud-tag {
  font-size: 10px;
  background: #6366f1;
  color: #fff;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: auto;
}

.hud-bar-bg {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.hud-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s, background 0.3s;
}

.hud-stats {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
