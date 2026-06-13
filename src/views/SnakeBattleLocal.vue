<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSnakeLocalGame } from '@/composables/useSnakeLocalGame'
import SnakeCanvas from '@/components/snake/SnakeCanvas.vue'
import SnakeResultModal from '@/components/snake/SnakeResultModal.vue'

defineOptions({ name: 'SnakeBattleLocalView' })

const router = useRouter()

const p1Name = ref('')
const p2Name = ref('')
const showSetup = ref(true)

const game = useSnakeLocalGame()
const canvasWidth = ref(360)

onMounted(() => {
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize)
  window.removeEventListener('keydown', onKeyDown)
  game.reset()
})

function updateCanvasSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxSize = Math.min(vw - 24, vh - 320, 520)
  canvasWidth.value = Math.max(280, maxSize)
}

function onKeyDown(e: KeyboardEvent) {
  if (game.state.status !== 'playing') return
  const key = e.key.toLowerCase()

  // 玩家1：WASD
  if (['w', 'a', 's', 'd'].includes(key)) {
    e.preventDefault()
    const dirMap: Record<string, string> = { w: 'UP', a: 'LEFT', s: 'DOWN', d: 'RIGHT' }
    game.changeDirection(1, dirMap[key])
    return
  }

  // 玩家2：方向键
  if (['arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
    e.preventDefault()
    const dirMap: Record<string, string> = {
      arrowup: 'UP',
      arrowleft: 'LEFT',
      arrowdown: 'DOWN',
      arrowright: 'RIGHT',
    }
    game.changeDirection(2, dirMap[key])
    return
  }
}

function startLocalGame() {
  game.startGame(p1Name.value || '玩家1', p2Name.value || '玩家2')
  showSetup.value = false
}

function goBack() {
  game.resetSession()
  game.reset()
  router.push('/')
}

function restart() {
  game.reset()
  showSetup.value = true
}
</script>

<template>
  <div class="local-page">
    <header class="top-bar">
      <button class="btn back" @click="goBack">← 返回</button>
      <h2>🐍 本地双人对战</h2>
      <div />
    </header>

    <!-- 设置界面 -->
    <div v-if="showSetup" class="setup-area">
      <div class="setup-card">
        <h3>输入玩家昵称</h3>
        <div class="name-row">
          <div class="name-group">
            <span class="player-dot" style="background: #4caf50" />
            <span class="player-label">玩家1（WASD）</span>
            <input v-model="p1Name" placeholder="玩家1" maxlength="8" class="name-input" />
          </div>
          <div class="name-group">
            <span class="player-dot" style="background: #f44336" />
            <span class="player-label">玩家2（方向键）</span>
            <input v-model="p2Name" placeholder="玩家2" maxlength="8" class="name-input" />
          </div>
        </div>
        <button class="start-btn" @click="startLocalGame">⚡ 开始对战</button>
        <div class="controls-hint">
          <p>🎮 玩家1：<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 控制方向</p>
          <p>🎮 玩家2：<kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> 控制方向</p>
        </div>
      </div>
    </div>

    <!-- 游戏界面 -->
    <div v-else class="game-area">
      <div v-if="game.state.status === 'countdown'" class="countdown-overlay">
        <div class="countdown-number">{{ game.state.countdown }}</div>
      </div>

      <div class="hud-row">
        <div class="player-hud" :class="{ dead: !game.state.snakes[0]?.alive }">
          <span class="dot" style="background: #4caf50" />
          <span class="pname">{{ p1Name || '玩家1' }}</span>
          <span class="health">❤️ {{ game.state.snakes[0]?.health || 0 }}</span>
          <span class="len">📏 {{ game.state.snakes[0]?.length || 0 }}</span>
        </div>
        <div class="player-hud" :class="{ dead: !game.state.snakes[1]?.alive }">
          <span class="dot" style="background: #f44336" />
          <span class="pname">{{ p2Name || '玩家2' }}</span>
          <span class="health">❤️ {{ game.state.snakes[1]?.health || 0 }}</span>
          <span class="len">📏 {{ game.state.snakes[1]?.length || 0 }}</span>
        </div>
      </div>

      <div class="canvas-wrap">
        <SnakeCanvas
          :snakes="game.state.snakes"
          :items="game.state.items"
          :my-player-id="null"
          :canvas-width="canvasWidth"
          :invincible-timers="game.invincibleTimers"
        />
      </div>

      <SnakeResultModal
        :visible="game.state.status === 'finished'"
        :winner-name="game.state.winnerName"
        :stats="game.state.stats"
        :p1-wins="game.p1Wins.value"
        :p2-wins="game.p2Wins.value"
        :p1-name="p1Name || '玩家1'"
        :p2-name="p2Name || '玩家2'"
        :on-restart="restart"
        :on-back="goBack"
      />
    </div>
  </div>
</template>

<style scoped>
.local-page {
  min-height: 100vh;
  background: #0f0f23;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.top-bar h2 {
  font-size: 16px;
  font-weight: 700;
}
.btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #e0e0e0;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.setup-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.setup-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  max-width: 420px;
  width: 100%;
}
.setup-card h3 {
  text-align: center;
  font-size: 18px;
  margin-bottom: 20px;
}
.name-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}
.name-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.player-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.player-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
.name-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.name-input:focus {
  border-color: #6366f1;
}
.start-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}
.start-btn:hover {
  opacity: 0.9;
}
.controls-hint {
  margin-top: 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 2;
}
.controls-hint kbd {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  margin: 0 2px;
}

.game-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  gap: 8px;
}
.countdown-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: none;
}
.countdown-number {
  font-size: 120px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 40px rgba(99, 102, 241, 0.6);
  animation: pulse 0.5s ease;
}
@keyframes pulse {
  0% {
    transform: scale(1.5);
    opacity: 0.3;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.hud-row {
  display: flex;
  gap: 16px;
  width: 100%;
  max-width: 520px;
}
.player-hud {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 13px;
  flex: 1;
}
.player-hud.dead {
  opacity: 0.4;
  text-decoration: line-through;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.pname {
  flex: 1;
  font-weight: 600;
}
.health {
  color: #ef5350;
}
.len {
  color: rgba(255, 255, 255, 0.5);
}

.canvas-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
