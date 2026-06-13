<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGameUrl } from '@/composables/useSnakeWebSocket'
import { useSnakeGameClient } from '@/composables/useSnakeGameClient'
import { useSnakeTouch } from '@/composables/useSnakeTouch'
import SnakeCanvas from '@/components/snake/SnakeCanvas.vue'
import SnakeTouchControls from '@/components/snake/SnakeTouchControls.vue'
import SnakeHUD from '@/components/snake/SnakeHUD.vue'
import SnakeResultModal from '@/components/snake/SnakeResultModal.vue'

defineOptions({ name: 'SnakeBattleOnlineView' })

const route = useRoute()
const router = useRouter()

const action = route.query.action as string
const roomIdParam = route.query.roomId as string
const myName = (route.query.name as string) || '匿名'

const currentRoomId = ref(roomIdParam || '') // 可更新的房间号

const game = useSnakeGameClient()
const canvasWidth = ref(360)
const myPlayerId = ref<number | null>(null)
const statusText = ref('连接中...')
const iAmReady = ref(false)
const wsReady = ref(false) // WebSocket 是否已连接
const playerList = ref<{ playerId: number; name: string; ready: boolean }[]>([])

let ws: WebSocket | null = null

useSnakeTouch((dir) => {
  if (game.state.status === 'playing') sendInput(dir)
})

onMounted(() => {
  if (!action && !roomIdParam) { router.push('/snake'); return }
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
  connect()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize)
  ws?.close()
})

function updateCanvasSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxSize = Math.min(vw - 24, vh - 280, 520)
  canvasWidth.value = Math.max(280, maxSize)
}

function connect() {
  const url = action === 'create'
    ? getGameUrl('create', myName)
    : getGameUrl('join', myName, roomIdParam!)

  ws = new WebSocket(url)

  ws.onopen = () => {
    wsReady.value = true
    statusText.value = '已连接，等待加入房间...'
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleMessage(msg)
    } catch { /* ignore */ }
  }

  ws.onerror = () => { statusText.value = '连接异常' }
  ws.onclose = () => {
    if (game.state.status !== 'finished') statusText.value = '连接已断开'
  }
}

function handleMessage(msg: any) {
  game.handleMessage(msg)

  switch (msg.type) {
    case 'room_joined':
      statusText.value = '点击"准备"开始'
      if (msg.room?.players) {
        const players = msg.room.players
        myPlayerId.value = players[players.length - 1]?.playerId || null
        // 更新房间号
        if (msg.room.roomId) {
          currentRoomId.value = msg.room.roomId
          // 更新 URL 以便分享
          const newPath = `/snake/battle?roomId=${msg.room.roomId}&name=${encodeURIComponent(myName)}`
          window.history.replaceState(null, '', newPath)
        }
        playerList.value = players.map((p: any) => ({
          playerId: p.playerId, name: p.name, ready: p.ready,
        }))
      }
      break
    case 'player_joined':
    case 'player_left':
      if (msg.players) {
        playerList.value = msg.players.map((p: any) => ({
          playerId: p.playerId, name: p.name, ready: p.ready,
        }))
      }
      statusText.value = iAmReady.value ? '已准备，等待其他玩家...' : '点击"准备"开始'
      break
    case 'countdown':
      statusText.value = `${msg.count}`
      break
    case 'game_start':
      statusText.value = ''
      break
    case 'game_over':
      statusText.value = '游戏结束'
      break
    case 'game_stopped':
      statusText.value = '游戏已结束'
      break
  }
}

function send(data: Record<string, any>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

function sendInput(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
  send({ type: 'input', direction: dir })
}

function toggleReady() {
  if (iAmReady.value) return
  iAmReady.value = true
  send({ type: 'ready' })
  statusText.value = '已准备，等待其他玩家...'
}

function goBack() {
  ws?.close()
  ws = null
  game.reset()
  router.push('/snake')
}

function restart() {
  game.reset()
  iAmReady.value = false
  statusText.value = '点击"准备"开始'
  toggleReady()
}
</script>

<template>
  <div class="battle-page">
    <header class="battle-header">
      <button class="btn back" @click="goBack">← 退出</button>
      <span class="room-tag">房间 #{{ currentRoomId || '新' }}</span>
      <span class="status-text">{{ statusText }}</span>
      <div class="header-spacer" />
    </header>

    <div v-if="game.state.status === 'countdown'" class="countdown-overlay">
      <div class="countdown-number">{{ game.state.countdown }}</div>
    </div>

    <div v-if="game.state.status !== 'playing' && game.state.status !== 'finished'" class="waiting-area">
      <div class="share-hint">
        {{ action === 'create' ? '分享房间号给好友加入对战' : '等待其他玩家...' }}
        <div v-if="currentRoomId" class="room-code">#{{ currentRoomId }}</div>
      </div>
      <div class="player-list">
        <div v-for="p in playerList" :key="p.playerId" class="player-item"
          :class="{ me: p.playerId === myPlayerId, ready: p.ready }">
          <span class="player-dot"
            :style="{ background: ['#4CAF50', '#f44336', '#2196F3', '#FF9800'][p.playerId - 1] || '#888' }" />
          <span class="player-name">{{ p.name }}</span>
          <span v-if="p.playerId === myPlayerId" class="player-tag">我</span>
          <span class="player-status">{{ p.ready ? '✅ 已准备' : '⏳ 等待中' }}</span>
        </div>
        <div v-if="playerList.length === 0" class="player-empty">等待玩家加入...</div>
      </div>
      <div v-if="!wsReady" class="ready-done">⏳ 连接中...</div>
      <button v-else-if="!iAmReady" class="ready-btn" @click="toggleReady">⚡ 准备</button>
      <div v-else class="ready-done">✅ 已准备，等待其他玩家...</div>
      <div class="wait-tip">
        <p>需要至少 2 名玩家才能开始</p>
        <p>每人点击"准备"后，游戏自动开始</p>
      </div>
    </div>

    <div v-if="game.state.status === 'playing'" class="hud-area">
      <SnakeHUD :snakes="game.state.snakes" :my-player-id="myPlayerId" />
    </div>

    <div class="canvas-area">
      <SnakeCanvas :snakes="game.state.snakes" :items="game.state.items" :my-player-id="myPlayerId"
        :canvas-width="canvasWidth" />
    </div>

    <div v-if="game.state.status === 'playing'" class="controls-area">
      <SnakeTouchControls @direction="(dir) => sendInput(dir)" />
    </div>

    <SnakeResultModal :visible="game.state.status === 'finished'" :winner-name="game.state.winnerName"
      :stats="game.state.stats" :on-restart="restart" :on-back="goBack" />
  </div>
</template>

<style scoped>
.battle-page {
  min-height: 100vh;
  background: #0f0f23;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  position: relative;
}

.battle-header {
  width: 100%;
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #e0e0e0;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.back {
  font-size: 13px;
}

.room-tag {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
}

.status-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  flex: 1;
  text-align: center;
}

.header-spacer {
  width: 48px;
}

.waiting-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 20px;
  max-width: 400px;
  width: 100%;
}

.share-hint {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 14px;
  color: #a5b4fc;
  text-align: center;
}

.room-code {
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin-top: 4px;
  letter-spacing: 4px;
}

.player-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  font-size: 14px;
}

.player-item.me {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
}

.player-item.ready {
  border-color: rgba(76, 175, 80, 0.3);
}

.player-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.player-name {
  flex: 1;
  font-weight: 500;
}

.player-tag {
  font-size: 11px;
  background: #6366f1;
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
}

.player-status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.player-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  padding: 20px;
  font-size: 14px;
}

.ready-btn {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 14px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 2px;
}

.ready-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.ready-done {
  width: 100%;
  padding: 16px;
  background: rgba(76, 175, 80, 0.15);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  color: #81c784;
  text-align: center;
}

.wait-tip {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  line-height: 1.8;
}

.wait-tip p {
  margin: 0;
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

.hud-area {
  width: 100%;
  max-width: 520px;
  padding: 8px 12px 4px;
  flex-shrink: 0;
}

.canvas-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.controls-area {
  flex-shrink: 0;
  padding: 8px 0 20px;
}
</style>
