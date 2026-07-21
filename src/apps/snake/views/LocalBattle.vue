<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSnakeGame } from '../composables/useSnakeGame'
import { PLAYER_COLORS, DIR_MAP_WASD, DIR_MAP_ARROWS } from '../composables/snakeTypes'
import SnakeCanvas from '../components/SnakeCanvas.vue'
import SnakeResultModal from '../components/SnakeResultModal.vue'
import '../styles/battleShared.css'

defineOptions({ name: 'SnakeBattleLocalView' })

const router = useRouter()

const p1Name = ref('')
const p2Name = ref('')
const showSetup = ref(true)

const game = useSnakeGame({ mode: 'local' })
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
  if (key in DIR_MAP_WASD) {
    e.preventDefault()
    game.changeDirection(1, DIR_MAP_WASD[key])
    return
  }

  // 玩家2：方向键
  if (key in DIR_MAP_ARROWS) {
    e.preventDefault()
    game.changeDirection(2, DIR_MAP_ARROWS[key])
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
  router.push('/snake')
}

function restart() {
  game.reset()
  showSetup.value = true
}
</script>

<template>
  <div class="local-page battle-view">
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
            <span class="player-dot" :style="{ background: PLAYER_COLORS[1].head }" />
            <span class="player-label">玩家1（WASD）</span>
            <input v-model="p1Name" placeholder="玩家1" maxlength="8" class="name-input" />
          </div>
          <div class="name-group">
            <span class="player-dot" :style="{ background: PLAYER_COLORS[2].head }" />
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
          <span class="dot" :style="{ background: PLAYER_COLORS[1].head }" />
          <span class="pname">{{ p1Name || '玩家1' }}</span>
          <span class="health">❤️ {{ game.state.snakes[0]?.health || 0 }}</span>
          <span class="len">📏 {{ game.state.snakes[0]?.length || 0 }}</span>
        </div>
        <div class="player-hud" :class="{ dead: !game.state.snakes[1]?.alive }">
          <span class="dot" :style="{ background: PLAYER_COLORS[2].head }" />
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
</style>
