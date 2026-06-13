<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getLobbyUrl, fetchRoomList } from '@/composables/useSnakeWebSocket'

defineOptions({ name: 'SnakeRoomView' })

const router = useRouter()
const playerName = ref('')
const roomList = ref<any[]>([])
const errorMsg = ref('')
const loading = ref(true)

let lobbyWs: WebSocket | null = null

onMounted(() => {
  const saved = localStorage.getItem('snake_player_name')
  if (saved) playerName.value = saved

  // 先用 HTTP 获取一次房间列表（立即显示）
  fetchRoomList().then((res) => {
    roomList.value = res.rooms || []
    loading.value = false
  }).catch(() => {
    loading.value = false
  })

  // 再连接 Lobby WebSocket 获取实时推送
  connectLobby()
})

onUnmounted(() => {
  lobbyWs?.close()
})

function connectLobby() {
  lobbyWs = new WebSocket(getLobbyUrl())

  lobbyWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'room_list') {
        roomList.value = msg.rooms || []
      }
    } catch { /* ignore */ }
  }

  // 连接失败时静默处理，只使用 HTTP 获取的结果
  lobbyWs.onerror = () => {}
  lobbyWs.onclose = () => {}
}

function getPlayerName() {
  return playerName.value.trim() || '匿名玩家'
}

function createRoom() {
  const name = getPlayerName()
  localStorage.setItem('snake_player_name', name)
  router.push(`/snake/battle?action=create&name=${encodeURIComponent(name)}`)
}

function joinRoom(roomId: string) {
  const name = getPlayerName()
  localStorage.setItem('snake_player_name', name)
  router.push(`/snake/battle?roomId=${roomId}&name=${encodeURIComponent(name)}`)
}
</script>

<template>
  <div class="room-page">
    <header class="top-bar">
      <button class="btn back" @click="router.push('/')">← 返回</button>
      <h2>🐍 贪吃蛇大作战</h2>
      <div />
    </header>

    <div class="content">
      <div class="name-section">
        <label>你的昵称</label>
        <input
          v-model="playerName"
          placeholder="输入昵称..."
          maxlength="12"
          class="name-input"
          @keyup.enter="createRoom"
        />
      </div>

      <button class="btn create-btn" @click="createRoom">
        ⚡ 创建房间
      </button>

      <div class="section-title">
        房间列表
      </div>

      <div v-if="loading" class="empty">加载中...</div>
      <div v-else-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
      <div v-else-if="roomList.length === 0" class="empty">
        暂无房间，创建一个吧
      </div>

      <div v-else class="room-list">
        <div
          v-for="room in roomList"
          :key="room.roomId"
          class="room-card"
          @click="joinRoom(room.roomId)"
        >
          <div class="room-info">
            <span class="room-id">房间 #{{ room.roomId?.slice(0, 6) }}</span>
            <span class="room-players">👤 {{ room.playerCount }}/{{ room.maxPlayers }}</span>
          </div>
          <div class="room-players-list">
            <span
              v-for="p in room.players"
              :key="p.playerId"
              class="player-badge"
            >{{ p.name }}</span>
          </div>
          <button class="join-btn">加入</button>
        </div>
      </div>
    </div>

    <div class="tips">
      <p>💡 创建房间后分享房间号给好友即可对战</p>
      <p>📱 手机端支持触控滑动和虚拟方向键</p>
    </div>
  </div>
</template>

<style scoped>
.room-page {
  min-height: 100vh;
  background: #0f0f23;
  color: #e0e0e0;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.top-bar h2 { font-size: 16px; font-weight: 700; }

.btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #e0e0e0;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}
.btn:hover { background: rgba(255, 255, 255, 0.15); }
.back { font-size: 14px; }

.content { max-width: 480px; margin: 0 auto; padding: 20px 16px; }

.name-section { margin-bottom: 16px; }
.name-section label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
}
.name-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
}
.name-input:focus { border-color: #6366f1; }

.create-btn {
  width: 100%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  padding: 14px;
  border-radius: 12px;
  margin-bottom: 16px;
  border: none;
  cursor: pointer;
}
.create-btn:hover { opacity: 0.9; }

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.error-msg {
  background: rgba(244, 67, 54, 0.15);
  color: #ef5350;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
}

.empty {
  text-align: center;
  padding: 40px 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

.room-list { display: flex; flex-direction: column; gap: 10px; }

.room-card {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.room-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: #6366f1;
}

.room-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.room-id { font-weight: 600; font-size: 15px; }
.room-players { font-size: 12px; color: rgba(255, 255, 255, 0.5); }

.room-players-list { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 12px; }
.player-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(99, 102, 241, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
}

.join-btn {
  padding: 6px 16px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tips {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 16px 24px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  line-height: 1.6;
}
.tips p { margin: 0; }
</style>
