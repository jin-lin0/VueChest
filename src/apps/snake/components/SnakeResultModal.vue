<script setup lang="ts">
import { ref, watch } from 'vue'
import { PLAYER_COLORS } from '../composables/snakeTypes'
import type { StatItem } from '../composables/snakeTypes'

const props = defineProps<{
  visible: boolean
  winnerName: string | null
  stats: StatItem[]
  onRestart: () => void
  onBack: () => void
  // 本地双人对战胜场统计（可选）
  p1Wins?: number
  p2Wins?: number
  p1Name?: string
  p2Name?: string
}>()

const backCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

watch(
  () => props.visible,
  (val) => {
    if (val) {
      // 弹窗出现时，返回大厅按钮锁定 3 秒防误触
      backCooldown.value = 3
      cooldownTimer = setInterval(() => {
        backCooldown.value--
        if (backCooldown.value <= 0) {
          backCooldown.value = 0
          if (cooldownTimer) {
            clearInterval(cooldownTimer)
            cooldownTimer = null
          }
        }
      }, 1000)
    } else {
      // 弹窗关闭时清理定时器
      if (cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
      backCooldown.value = 0
    }
  },
)

function handleBack() {
  if (backCooldown.value > 0) return
  props.onBack?.()
}
</script>

<template>
  <Transition name="modal">
    <div v-if="visible" class="modal-overlay" @click.self="handleBack">
      <div class="modal-content">
        <div class="modal-title">游戏结束</div>

        <div v-if="winnerName" class="winner">
          <div class="trophy">🏆</div>
          <div class="winner-name">{{ winnerName }}</div>
          <div class="winner-sub">获胜！</div>
        </div>
        <div v-else class="winner">
          <div class="trophy">💀</div>
          <div class="winner-name">平局</div>
          <div class="winner-sub">无人生还</div>
        </div>

        <!-- 本地双人对战胜场对比 -->
        <div v-if="props.p1Wins !== undefined && props.p2Wins !== undefined" class="win-tally">
          <div class="tally-row">
            <span class="tally-dot" :style="{ background: PLAYER_COLORS[1]?.head ?? '#888' }" />
            <span class="tally-name">{{ props.p1Name || '玩家1' }}</span>
            <span class="tally-score">{{ props.p1Wins }}</span>
          </div>
          <div class="tally-vs">VS</div>
          <div class="tally-row">
            <span class="tally-dot" :style="{ background: PLAYER_COLORS[2]?.head ?? '#888' }" />
            <span class="tally-name">{{ props.p2Name || '玩家2' }}</span>
            <span class="tally-score">{{ props.p2Wins }}</span>
          </div>
        </div>

        <div class="stats-list">
          <div
            v-for="s in stats"
            :key="s.playerId"
            class="stat-row"
            :class="{ winner: s.alive }"
          >
            <span
              class="stat-dot"
              :style="{ background: PLAYER_COLORS[s.playerId]?.head ?? '#888' }"
            />
            <span class="stat-name">{{ s.name }}</span>
            <span class="stat-health">❤️{{ Math.max(0, s.health) }}</span>
            <span class="stat-length">📏{{ s.length }}</span>
            <span class="stat-status">{{ s.alive ? '✅' : '💀' }}</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-restart" @click="props.onRestart?.()">再来一局</button>
          <button
            class="btn btn-back"
            :class="{ disabled: backCooldown > 0 }"
            :disabled="backCooldown > 0"
            @click="handleBack"
          >
            {{ backCooldown > 0 ? `返回大厅 (${backCooldown}s)` : '返回大厅' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: #1e1e2e;
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 360px;
  color: #fff;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

.modal-title {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.winner {
  text-align: center;
  margin-bottom: 20px;
}

.trophy {
  font-size: 48px;
  margin-bottom: 4px;
}

.winner-name {
  font-size: 22px;
  font-weight: 700;
  color: #ffd700;
}

.winner-sub {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 2px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  font-size: 14px;
}

.stat-row.winner {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stat-name {
  flex: 1;
  font-weight: 500;
}

.stat-health,
.stat-length,
.stat-status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.modal-actions {
  display: flex;
  gap: 10px;
}

.btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-restart {
  background: #6366f1;
  color: #fff;
}

.btn-restart:hover {
  background: #4f46e5;
}

.btn-back {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}

.btn-back:hover {
  background: rgba(255, 255, 255, 0.15);
}
.btn-back.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-back.disabled:hover {
  background: rgba(255, 255, 255, 0.1);
}

.win-tally {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 20px;
  font-size: 14px;
}

.tally-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tally-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tally-name {
  font-weight: 500;
}

.tally-score {
  font-size: 20px;
  font-weight: 700;
  color: #ffd700;
  min-width: 24px;
  text-align: center;
}

.tally-vs {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
