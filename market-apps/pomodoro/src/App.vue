<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePomodoroStore } from './store'
import type { SoundType } from './store'

defineOptions({ name: 'PomodoroView' })

const pomodoroStore = usePomodoroStore()

onMounted(() => {
  pomodoroStore.init()
  pomodoroStore.setPlaySoundCallback(playNotificationSound)
})

onUnmounted(() => {
  pomodoroStore.cleanup()
})

const formatTime = (dateString: string) => {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

const clearHistory = () => {
  if (confirm('确定要清除所有历史记录吗？')) {
    pomodoroStore.history = []
    pomodoroStore.pomodoroCount = 0
  }
}

let audioCtx: AudioContext | null = null

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

const playTone = (
  frequency: number,
  startTime: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3,
) => {
  const ctx = getAudioContext()
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)

  gainNode.gain.setValueAtTime(volume, startTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration)

  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

const SOUND_PRESETS: Record<SoundType, () => void> = {
  chime: () => {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    playTone(523.25, now, 0.2, 'sine', 0.3)
    playTone(659.25, now + 0.2, 0.2, 'sine', 0.3)
    playTone(783.99, now + 0.4, 0.35, 'sine', 0.3)
  },
  bell: () => {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    playTone(880, now, 0.15, 'sine', 0.3)
    playTone(1108.73, now + 0.15, 0.15, 'sine', 0.25)
    playTone(1318.51, now + 0.3, 0.4, 'sine', 0.3)
  },
  alert: () => {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    playTone(800, now, 0.15, 'square', 0.15)
    playTone(800, now + 0.2, 0.15, 'square', 0.15)
    playTone(1000, now + 0.4, 0.4, 'square', 0.2)
  },
  gentle: () => {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    playTone(392, now, 0.3, 'sine', 0.2)
    playTone(440, now + 0.3, 0.3, 'sine', 0.2)
    playTone(523.25, now + 0.6, 0.5, 'sine', 0.2)
  },
}

const previewSound = (sound: SoundType) => {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
    SOUND_PRESETS[sound]()
  } catch (e) {
    console.error('播放提示音失败:', e)
  }
}

const playNotificationSound = () => {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
    SOUND_PRESETS[pomodoroStore.settings.sound]()
  } catch (e) {
    console.error('播放提示音失败:', e)
  }
}

const selectSound = (sound: SoundType) => {
  pomodoroStore.settings.sound = sound
  previewSound(sound)
}

const goBack = () => {
  history.back()
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-btn" @click="goBack">← 返回</button>

      <h1>番茄钟</h1>
    </header>

    <main class="pomodoro-content">
      <div class="timer-section">
        <div class="session-tabs">
          <button
            v-for="opt in pomodoroStore.sessionOptions"
            :key="opt.key"
            class="session-tab"
            :class="{
              active: pomodoroStore.sessionType === opt.key,
              disabled: pomodoroStore.isRunning,
            }"
            @click="pomodoroStore.setSession(opt.key)"
          >
            {{ opt.label }}
          </button>
          <button
            class="session-tab settings-toggle"
            :class="{ active: pomodoroStore.showSettings }"
            @click="pomodoroStore.toggleSettings"
          >
            ⚙️ 设置
          </button>
        </div>

        <Teleport to="body">
          <div
            v-if="pomodoroStore.showSettings"
            class="settings-overlay"
            @click.self="pomodoroStore.toggleSettings"
          >
            <div class="settings-modal">
              <div class="settings-modal-header">
                <h3>设置</h3>
                <button class="settings-close-btn" @click="pomodoroStore.toggleSettings">
                  &times;
                </button>
              </div>
              <div class="settings-modal-body">
                <h4 class="settings-title">时间设置（分钟）</h4>
                <div class="settings-grid">
                  <label class="setting-item">
                    <span>专注时长</span>
                    <input
                      v-model.number="pomodoroStore.settings.work"
                      type="number"
                      min="1"
                      max="120"
                      :disabled="pomodoroStore.isRunning"
                      @change="pomodoroStore.applySettings"
                    />
                  </label>
                  <label class="setting-item">
                    <span>短休息</span>
                    <input
                      v-model.number="pomodoroStore.settings.break"
                      type="number"
                      min="1"
                      max="30"
                      :disabled="pomodoroStore.isRunning"
                      @change="pomodoroStore.applySettings"
                    />
                  </label>
                  <label class="setting-item">
                    <span>长休息</span>
                    <input
                      v-model.number="pomodoroStore.settings.longBreak"
                      type="number"
                      min="1"
                      max="60"
                      :disabled="pomodoroStore.isRunning"
                      @change="pomodoroStore.applySettings"
                    />
                  </label>
                </div>

                <h4 class="settings-title">提示音</h4>
                <div class="sound-options">
                  <button
                    v-for="opt in pomodoroStore.SOUND_OPTIONS"
                    :key="opt.key"
                    class="sound-btn"
                    :class="{ active: pomodoroStore.settings.sound === opt.key }"
                    @click="selectSound(opt.key)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Teleport>

        <div class="timer-ring-container">
          <svg class="timer-ring" viewBox="0 0 260 260">
            <circle class="ring-bg" cx="130" cy="130" r="120" />
            <circle
              class="ring-progress"
              :class="pomodoroStore.sessionType"
              cx="130"
              cy="130"
              r="120"
              :stroke-dasharray="pomodoroStore.circumference"
              :stroke-dashoffset="pomodoroStore.strokeDashoffset"
            />
          </svg>
          <div class="timer-display">
            <div class="time-text">{{ pomodoroStore.timeDisplay }}</div>
            <div class="session-label">{{ pomodoroStore.LABELS[pomodoroStore.sessionType] }}</div>
          </div>
        </div>

        <div class="timer-controls">
          <button
            v-if="!pomodoroStore.isRunning"
            class="control-btn start"
            @click="pomodoroStore.startTimer"
          >
            开始
          </button>
          <button v-else class="control-btn pause" @click="pomodoroStore.pauseTimer">暂停</button>
          <button class="control-btn reset" @click="pomodoroStore.resetTimer">重置</button>
        </div>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value">{{ pomodoroStore.todayCount }}</div>
            <div class="stat-label">今日完成</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ pomodoroStore.totalFocusMinutes }}</div>
            <div class="stat-label">今日专注（分钟）</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ pomodoroStore.pomodoroCount }}</div>
            <div class="stat-label">累计番茄</div>
          </div>
        </div>
      </div>

      <div class="history-section">
        <div class="history-header">
          <h2>今日记录</h2>
          <button v-if="pomodoroStore.history.length > 0" class="clear-btn" @click="clearHistory">
            清除记录
          </button>
        </div>

        <div class="history-list">
          <div
            v-for="record in pomodoroStore.history.slice(0, 20)"
            :key="record.id"
            class="history-item"
            :class="record.type"
          >
            <span class="history-icon">
              {{ record.type === 'work' ? '🍅' : '☕' }}
            </span>
            <span class="history-label">
              {{ pomodoroStore.LABELS[record.type] }}
              ({{ Math.round(record.duration / 60) }}分钟)
            </span>
            <span class="history-time">
              {{ formatTime(record.completedAt) }}
            </span>
          </div>

          <div v-if="pomodoroStore.history.length === 0" class="empty-state">
            还没有记录，开始你的第一个番茄钟吧！
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.back-button {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
}

.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #2c3e50;
}

.pomodoro-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.timer-section {
  background-color: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.session-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.session-tab {
  background-color: #f1f1f1;
  border: none;
  padding: 0.5rem 1.2rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #2c3e50;
  transition: all 0.2s;
}

.session-tab:hover {
  background-color: #e0e0e0;
}

.session-tab.active {
  background-color: #e74c3c;
  color: white;
}

.session-tab.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-toggle {
  margin-left: 0.5rem;
  background-color: #f8f9fa;
  color: #2c3e50;
}

.settings-toggle.active {
  background-color: #3498db;
  color: white;
}

.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-modal {
  background-color: #fff;
  border-radius: 16px;
  padding: 0;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: modalIn 0.25s ease-out;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.settings-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1.5rem;
  border-bottom: 1px solid #eee;
}

.settings-modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.settings-close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  transition: color 0.2s;
}

.settings-close-btn:hover {
  color: #333;
}

.settings-modal-body {
  padding: 1.2rem 1.5rem 1.5rem;
}

.settings-title {
  margin: 0 0 0.8rem;
  font-size: 0.95rem;
  color: #2c3e50;
  font-weight: 600;
}

.settings-title:not(:first-child) {
  margin-top: 1.2rem;
}

.settings-grid {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.9rem;
  color: #555;
}

.setting-item input {
  width: 80px;
  padding: 0.4rem 0.6rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  text-align: center;
  background-color: white;
  color: #2c3e50;
}

.setting-item input:focus {
  outline: none;
  border-color: #3498db;
}

.setting-item input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sound-options {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.sound-btn {
  padding: 0.45rem 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: white;
  cursor: pointer;
  font-size: 0.9rem;
  color: #555;
  transition: all 0.2s;
}

.sound-btn:hover {
  border-color: #3498db;
  color: #3498db;
}

.sound-btn.active {
  background-color: #3498db;
  border-color: #3498db;
  color: white;
}

.timer-ring-container {
  position: relative;
  width: 260px;
  height: 260px;
  margin-bottom: 2rem;
}

.timer-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: #eee;
  stroke-width: 8;
}

.ring-progress {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s linear;
}

.ring-progress.work {
  stroke: #e74c3c;
}

.ring-progress.break {
  stroke: #2ecc71;
}

.ring-progress.longBreak {
  stroke: #3498db;
}

.timer-display {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.time-text {
  font-size: 3rem;
  font-weight: 700;
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}

.session-label {
  font-size: 1rem;
  color: #7f8c8d;
  margin-top: 0.3rem;
}

.timer-controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.control-btn {
  border: none;
  padding: 0.8rem 2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: background-color 0.2s;
}

.control-btn.start {
  background-color: #e74c3c;
  color: white;
}

.control-btn.start:hover {
  background-color: #c0392b;
}

.control-btn.pause {
  background-color: #f39c12;
  color: white;
}

.control-btn.pause:hover {
  background-color: #e67e22;
}

.control-btn.reset {
  background-color: #ecf0f1;
  color: #2c3e50;
}

.control-btn.reset:hover {
  background-color: #bdc3c7;
}

.stats-row {
  display: flex;
  gap: 3rem;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #e74c3c;
}

.stat-label {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin-top: 0.2rem;
}

.history-section {
  background-color: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.history-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #2c3e50;
}

.clear-btn {
  background: none;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 0.3rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.clear-btn:hover {
  background-color: #e74c3c;
  color: white;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 0.6rem 0;
  border-bottom: 1px solid #f5f5f5;
}

.history-item:last-child {
  border-bottom: none;
}

.history-icon {
  margin-right: 0.8rem;
  font-size: 1.2rem;
}

.history-label {
  flex: 1;
  color: #2c3e50;
  font-size: 0.95rem;
}

.history-time {
  color: #95a5a6;
  font-size: 0.85rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
}

.back-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}
.back-btn:hover {
  background: #2980b9;
}

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
  }

  .app-header h1 {
    font-size: 1.4rem;
  }

  .back-button {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
  }

  .pomodoro-content {
    gap: 1.2rem;
  }

  .timer-section {
    padding: 1.2rem;
  }

  .session-tabs {
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.2rem;
  }

  .session-tab {
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
  }

  .settings-toggle {
    margin-left: 0;
  }

  .timer-ring-container {
    width: 200px;
    height: 200px;
    margin-bottom: 1.2rem;
  }

  .time-text {
    font-size: 2.2rem;
  }

  .session-label {
    font-size: 0.85rem;
  }

  .timer-controls {
    gap: 0.8rem;
    margin-bottom: 1.2rem;
  }

  .control-btn {
    padding: 0.7rem 1.5rem;
    font-size: 0.9rem;
  }

  .stats-row {
    gap: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .stat-value {
    font-size: 1.4rem;
  }

  .stat-label {
    font-size: 0.75rem;
  }

  .history-section {
    padding: 1rem;
  }

  .history-header h2 {
    font-size: 1rem;
  }

  .settings-modal {
    width: 95%;
  }
}
</style>
