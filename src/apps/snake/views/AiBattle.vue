<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSnakeGame } from '../composables/useSnakeGame'
import { PLAYER_COLORS, DIR_MAP_WASD } from '../types'
import type { Difficulty, Direction } from '../types'
import SnakeCanvas from '../components/SnakeCanvas.vue'
import SnakeResultModal from '../components/SnakeResultModal.vue'
import SnakeTouchControl from '../components/SnakeTouchControl.vue'
import '../styles/battleShared.css'

defineOptions({ name: 'SnakeBattleAiView' })

const router = useRouter()

const showSetup = ref(true)
const selectedDifficulty = ref<Difficulty>('medium')
const isMobile = ref(false)

const game = useSnakeGame({ mode: 'ai' })
const canvasWidth = ref(360)

const difficultyOptions: { key: Difficulty; label: string; desc: string; color: string }[] = [
  { key: 'easy', label: '简单', desc: 'AI 血量越低越聪明，绝地反击', color: PLAYER_COLORS[1].head },
  { key: 'medium', label: '中等', desc: 'AI 正常水平，偶有小失误', color: PLAYER_COLORS[4].head },
  { key: 'hard', label: '困难', desc: 'AI 初始更强，精准追击', color: PLAYER_COLORS[2].head },
]

onMounted(() => {
  isMobile.value = !window.matchMedia('(pointer: fine)').matches || window.innerWidth < 768
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
  const joystickSpace = isMobile.value ? 180 : 80
  const maxSize = Math.min(vw - 24, vh - 200 - joystickSpace, 520)
  canvasWidth.value = Math.max(240, maxSize)
}

function onKeyDown(e: KeyboardEvent) {
  if (game.state.status !== 'playing') return
  const key = e.key.toLowerCase()

  if (key in DIR_MAP_WASD) {
    e.preventDefault()
    game.changeDirection(game.HUMAN_ID, DIR_MAP_WASD[key])
  }
}

function onJoystickDir(dir: Direction) {
  if (game.state.status === 'playing') {
    game.changeDirection(game.HUMAN_ID, dir)
  }
}

function startAiGame() {
  game.difficulty.value = selectedDifficulty.value
  game.startGame()
  showSetup.value = false
}

function goBack() {
  game.reset()
  router.push('/snake')
}

function restart() {
  game.reset()
  showSetup.value = true
}
</script>

<template>
  <div class="ai-page battle-view">
    <header class="top-bar">
      <button class="btn back" @click="goBack">← 返回</button>
      <h2>🤖 人机对战</h2>
      <div />
    </header>

    <!-- 设置界面 -->
    <div v-if="showSetup" class="setup-area">
      <div class="setup-card">
        <h3>选择难度</h3>

        <div class="diff-options">
          <button
            v-for="opt in difficultyOptions"
            :key="opt.key"
            class="diff-btn"
            :class="{ active: selectedDifficulty === opt.key }"
            :style="{
              '--active-color': opt.color,
              borderColor: selectedDifficulty === opt.key ? opt.color : 'var(--border-light)',
            }"
            @click="selectedDifficulty = opt.key"
          >
            <span class="diff-label">{{ opt.label }}</span>
            <span class="diff-desc">{{ opt.desc }}</span>
          </button>
        </div>

        <div class="player-badge">
          <div class="badge-item">
            <span class="badge-dot" :style="{ background: PLAYER_COLORS[1].head }" />
            <div>
              <div class="badge-title">你</div>
              <div class="badge-sub">
                <template v-if="isMobile">触屏摇杆控制</template>
                <template v-else>WASD 控制</template>
              </div>
            </div>
          </div>
          <div class="badge-divider">VS</div>
          <div class="badge-item">
            <span class="badge-dot" :style="{ background: PLAYER_COLORS[2].head }" />
            <div>
              <div class="badge-title">AI</div>
              <div class="badge-sub">
                {{ difficultyOptions.find((d) => d.key === selectedDifficulty)?.label }}难度
              </div>
            </div>
          </div>
        </div>

        <button class="start-btn" @click="startAiGame">⚡ 开始对战</button>

        <div class="controls-hint">
          <template v-if="isMobile">
            <p>🖐️ 使用屏幕下方的摇杆控制方向</p>
          </template>
          <template v-else>
            <p>🎮 你：<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 控制方向</p>
          </template>
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
          <span class="pname">你</span>
          <span class="health">❤️ {{ game.state.snakes[0]?.health || 0 }}</span>
          <span class="len">📏 {{ game.state.snakes[0]?.length || 0 }}</span>
        </div>
        <div class="player-hud" :class="{ dead: !game.state.snakes[1]?.alive }">
          <span class="dot" :style="{ background: PLAYER_COLORS[2].head }" />
          <span class="pname"> AI </span>
          <span class="health">❤️ {{ game.state.snakes[1]?.health || 0 }}</span>
          <span class="len">📏 {{ game.state.snakes[1]?.length || 0 }}</span>
        </div>
      </div>

      <div class="canvas-wrap">
        <SnakeCanvas
          :snakes="game.state.snakes"
          :items="game.state.items"
          :my-player-id="game.HUMAN_ID"
          :canvas-width="canvasWidth"
          :invincible-timers="game.invincibleTimers"
        />
      </div>

      <!-- 移动端摇杆（读秒时也显示，方便提前就位） -->
      <div
        v-if="isMobile && (game.state.status === 'countdown' || game.state.status === 'playing')"
        class="joystick-area"
      >
        <SnakeTouchControl @direction="onJoystickDir" />
      </div>

      <SnakeResultModal
        :visible="game.state.status === 'finished'"
        :winner-name="game.state.winnerName"
        :stats="game.state.stats"
        :on-restart="restart"
        :on-back="goBack"
      />
    </div>
  </div>
</template>

<style scoped>
/* 通用布局样式已抽到 ../styles/battleShared.css（.battle-view 命名空间） */

.ai-page {
  min-height: 100dvh;
}
.game-area {
  overflow: hidden;
}
.hud-row {
  flex-shrink: 0;
}
.canvas-wrap {
  min-height: 0;
}
.pname {
  display: flex;
  align-items: center;
  gap: 4px;
}

.diff-options {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
}
.diff-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-subtle);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}
.diff-btn:hover {
  background: var(--bg-hover);
}
.diff-btn.active {
  background: var(--bg-elevated);
  box-shadow: var(--shadow-brand-sm);
  transform: translateY(-2px);
}
.diff-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.diff-desc {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.3;
}

.player-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 12px;
  background: var(--bg-subtle);
  border-radius: 12px;
}
.badge-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.badge-title {
  font-size: 14px;
  font-weight: 600;
}
.badge-sub {
  font-size: 11px;
  color: var(--text-muted);
}
.badge-divider {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 700;
}

.joystick-area {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 0 16px;
}
</style>
