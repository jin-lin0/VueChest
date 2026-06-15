<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSnakeAiGame, type Difficulty } from '@/composables/useSnakeAiGame'
import SnakeCanvas from '@/components/snake/SnakeCanvas.vue'
import SnakeResultModal from '@/components/snake/SnakeResultModal.vue'
import SnakeTouchControl from '@/components/snake/SnakeTouchControl.vue'

defineOptions({ name: 'SnakeBattleAiView' })

const router = useRouter()

const showSetup = ref(true)
const selectedDifficulty = ref<Difficulty>('medium')
const isMobile = ref(false)

const game = useSnakeAiGame()
const canvasWidth = ref(360)

const difficultyOptions: { key: Difficulty; label: string; desc: string; color: string }[] = [
  { key: 'easy', label: '简单', desc: 'AI 血量越低越聪明，绝地反击', color: '#4CAF50' },
  { key: 'medium', label: '中等', desc: 'AI 正常水平，偶有小失误', color: '#FF9800' },
  { key: 'hard', label: '困难', desc: 'AI 初始更强，精准追击', color: '#f44336' },
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

  if (['w', 'a', 's', 'd'].includes(key)) {
    e.preventDefault()
    const dirMap: Record<string, string> = { w: 'UP', a: 'LEFT', s: 'DOWN', d: 'RIGHT' }
    game.changeDirection(game.HUMAN_ID, dirMap[key])
  }
}

function onJoystickDir(dir: string) {
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
  <div class="ai-page">
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
              borderColor: selectedDifficulty === opt.key ? opt.color : 'rgba(255,255,255,0.1)',
            }"
            @click="selectedDifficulty = opt.key"
          >
            <span class="diff-label">{{ opt.label }}</span>
            <span class="diff-desc">{{ opt.desc }}</span>
          </button>
        </div>

        <div class="player-badge">
          <div class="badge-item">
            <span class="badge-dot" style="background: #4caf50" />
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
            <span class="badge-dot" style="background: #f44336" />
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
          <span class="dot" style="background: #4caf50" />
          <span class="pname">你</span>
          <span class="health">❤️ {{ game.state.snakes[0]?.health || 0 }}</span>
          <span class="len">📏 {{ game.state.snakes[0]?.length || 0 }}</span>
        </div>
        <div class="player-hud" :class="{ dead: !game.state.snakes[1]?.alive }">
          <span class="dot" style="background: #f44336" />
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
.ai-page {
  min-height: 100vh;
  min-height: 100dvh;
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
  flex-shrink: 0;
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
}
.diff-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}
.diff-btn.active {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 20px rgba(var(--active-color), 0.15);
  transform: translateY(-2px);
}
.diff-label {
  font-size: 16px;
  font-weight: 700;
  color: #e0e0e0;
}
.diff-desc {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
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
  background: rgba(255, 255, 255, 0.03);
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
  color: rgba(255, 255, 255, 0.4);
}
.badge-divider {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  font-weight: 700;
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
  overflow: hidden;
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
  flex-shrink: 0;
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
  display: flex;
  align-items: center;
  gap: 4px;
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
  min-height: 0;
}

.joystick-area {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 0 16px;
}
</style>
