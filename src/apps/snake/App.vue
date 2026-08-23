<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'SnakeGameLobbyView' })

const router = useRouter()
const isDesktop = ref(true)

onMounted(() => {
  isDesktop.value = window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 768
})
</script>

<template>
  <div class="lobby-page">
    <header class="lobby-header">
      <button class="btn back" @click="router.push('/games')">← 返回游戏中心</button>
      <h2>🐍 贪吃蛇</h2>
      <div />
    </header>

    <div class="mode-cards">
      <!-- 双人对战 - 仅在桌面端显示（需要双键盘操作） -->
      <div v-if="isDesktop" class="mode-card" @click="router.push('/snake/local')">
        <div class="card-icon">👥</div>
        <div class="card-title">双人对战</div>
        <div class="card-desc">本地同屏对战，WASD vs 方向键</div>
        <div class="card-badge desktop">桌面端</div>
      </div>

      <!-- 人机对战 - 始终可见 -->
      <div class="mode-card" @click="router.push('/snake/ai')">
        <div class="card-icon">🤖</div>
        <div class="card-title">人机对战</div>
        <div class="card-desc">挑战 AI，单人也能玩！</div>
        <div class="card-badge">AI</div>
      </div>
    </div>

    <div class="tips">
      <p>💡 选择一种模式开始游戏</p>
      <p class="small">双人对战需要双键盘操作，仅桌面端可用</p>
    </div>
  </div>
</template>

<style scoped>
.lobby-page {
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}
.lobby-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-light);
}
.lobby-header h2 {
  font-size: 16px;
  font-weight: 700;
}
.btn {
  background: var(--bg-hover);
  border: none;
  color: var(--text-primary);
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover {
  background: var(--bg-subtle);
}

.mode-cards {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px 16px;
}

.mode-card {
  position: relative;
  width: 100%;
  max-width: 360px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  padding: 28px 24px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  overflow: hidden;
}
.mode-card:hover {
  background: var(--bg-subtle);
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-brand-md);
}

.card-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.card-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 6px;
}
.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
}
.card-badge {
  display: inline-block;
  margin-top: 12px;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  background: var(--accent-bg);
  color: var(--accent);
}
.card-badge.desktop {
  background: var(--success-bg);
  color: var(--success);
}

.tips {
  text-align: center;
  padding: 16px;
  font-size: 13px;
  color: var(--text-muted);
}
.tips .small {
  font-size: 11px;
  margin-top: 4px;
  color: var(--text-muted);
}
</style>
