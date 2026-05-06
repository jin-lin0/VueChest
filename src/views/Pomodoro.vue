<script setup lang="ts">
import { ref, defineComponent, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

defineComponent({
  name: 'PomodoroView',
})

type SessionType = 'work' | 'break' | 'longBreak'

interface HistoryRecord {
  id: number
  type: SessionType
  duration: number
  completedAt: string
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const DURATIONS: Record<SessionType, number> = {
  work: 25 * 60,
  break: 5 * 60,
  longBreak: 15 * 60,
}

const LABELS: Record<SessionType, string> = {
  work: '专注',
  break: '短休息',
  longBreak: '长休息',
}

const sessionOptions: { key: SessionType; label: string }[] = [
  { key: 'work', label: '专注' },
  { key: 'break', label: '短休息' },
  { key: 'longBreak', label: '长休息' },
]

const sessionType = ref<SessionType>('work')
const timeLeft = ref(DURATIONS.work)
const isRunning = ref(false)
const pomodoroCount = ref(0)
const history = ref<HistoryRecord[]>([])
let timer: ReturnType<typeof setInterval> | null = null

const loadHistory = (): HistoryRecord[] => {
  const saved = localStorage.getItem('pomodoro-history')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      console.error('解析番茄钟历史失败:', e)
      return []
    }
  }
  return []
}

const saveHistory = () => {
  localStorage.setItem('pomodoro-history', JSON.stringify(history.value))
}

onMounted(() => {
  history.value = loadHistory()
  pomodoroCount.value = history.value.filter((r) => r.type === 'work').length
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

watch(
  history,
  () => {
    saveHistory()
  },
  { deep: true },
)

const timeDisplay = computed(() => {
  const mins = Math.floor(timeLeft.value / 60)
  const secs = timeLeft.value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

const progress = computed(() => {
  const total = DURATIONS[sessionType.value]
  return ((total - timeLeft.value) / total) * 100
})

const circumference = 2 * Math.PI * 120

const strokeDashoffset = computed(() => {
  return circumference - (progress.value / 100) * circumference
})

const startTimer = () => {
  if (isRunning.value) return
  isRunning.value = true
  timer = setInterval(() => {
    if (timeLeft.value > 0) {
      timeLeft.value--
    } else {
      completeSession()
    }
  }, 1000)
}

const pauseTimer = () => {
  isRunning.value = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const resetTimer = () => {
  pauseTimer()
  timeLeft.value = DURATIONS[sessionType.value]
}

const completeSession = () => {
  pauseTimer()

  history.value.unshift({
    id: Date.now(),
    type: sessionType.value,
    duration: DURATIONS[sessionType.value],
    completedAt: new Date().toISOString(),
  })

  if (sessionType.value === 'work') {
    pomodoroCount.value++
  }

  switchSession()
}

const switchSession = () => {
  if (sessionType.value === 'work') {
    sessionType.value = pomodoroCount.value % 4 === 0 ? 'longBreak' : 'break'
  } else {
    sessionType.value = 'work'
  }
  timeLeft.value = DURATIONS[sessionType.value]
}

const setSession = (type: SessionType) => {
  if (isRunning.value) return
  sessionType.value = type
  timeLeft.value = DURATIONS[type]
}

const todayCount = computed(() => {
  const today = new Date().toDateString()
  return history.value.filter(
    (r) => r.type === 'work' && new Date(r.completedAt).toDateString() === today,
  ).length
})

const totalFocusMinutes = computed(() => {
  const today = new Date().toDateString()
  const todayRecords = history.value.filter(
    (r) => r.type === 'work' && new Date(r.completedAt).toDateString() === today,
  )
  return Math.round(todayRecords.reduce((sum, r) => sum + r.duration, 0) / 60)
})

const formatTime = (dateString: string) => {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

const clearHistory = () => {
  if (confirm('确定要清除所有历史记录吗？')) {
    history.value = []
    pomodoroCount.value = 0
  }
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>番茄钟</h1>
    </header>

    <main class="pomodoro-content">
      <div class="timer-section">
        <div class="session-tabs">
          <button
            v-for="opt in sessionOptions"
            :key="opt.key"
            class="session-tab"
            :class="{ active: sessionType === opt.key, disabled: isRunning }"
            @click="setSession(opt.key)"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="timer-ring-container">
          <svg class="timer-ring" viewBox="0 0 260 260">
            <circle class="ring-bg" cx="130" cy="130" r="120" />
            <circle
              class="ring-progress"
              :class="sessionType"
              cx="130"
              cy="130"
              r="120"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="strokeDashoffset"
            />
          </svg>
          <div class="timer-display">
            <div class="time-text">{{ timeDisplay }}</div>
            <div class="session-label">{{ LABELS[sessionType] }}</div>
          </div>
        </div>

        <div class="timer-controls">
          <button v-if="!isRunning" class="control-btn start" @click="startTimer">开始</button>
          <button v-else class="control-btn pause" @click="pauseTimer">暂停</button>
          <button class="control-btn reset" @click="resetTimer">重置</button>
        </div>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value">{{ todayCount }}</div>
            <div class="stat-label">今日完成</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ totalFocusMinutes }}</div>
            <div class="stat-label">今日专注（分钟）</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ pomodoroCount }}</div>
            <div class="stat-label">累计番茄</div>
          </div>
        </div>
      </div>

      <div class="history-section">
        <div class="history-header">
          <h2>今日记录</h2>
          <button v-if="history.length > 0" class="clear-btn" @click="clearHistory">
            清除记录
          </button>
        </div>

        <div class="history-list">
          <div
            v-for="record in history.slice(0, 20)"
            :key="record.id"
            class="history-item"
            :class="record.type"
          >
            <span class="history-icon">
              {{ record.type === 'work' ? '🍅' : '☕' }}
            </span>
            <span class="history-label">
              {{ LABELS[record.type] }}
              ({{ Math.round(record.duration / 60) }}分钟)
            </span>
            <span class="history-time">
              {{ formatTime(record.completedAt) }}
            </span>
          </div>

          <div v-if="history.length === 0" class="empty-state">
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
</style>
