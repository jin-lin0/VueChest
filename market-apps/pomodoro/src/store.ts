import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useListStore } from '../../shared/useListStore'
import { getStorage, setStorage } from './utils'

const SETTINGS_KEY = 'pomodoro-settings'
const HISTORY_KEY = 'pomodoro-history'

const DEFAULT_SETTINGS = { work: 25, break: 5, longBreak: 15, sound: 'chime' as const }

export type SessionType = 'work' | 'break' | 'longBreak'
export type SoundType = 'chime' | 'bell' | 'alert' | 'gentle'

export interface HistoryRecord {
  id: number
  type: SessionType
  duration: number
  completedAt: string
}
export interface PomodoroSettings {
  work: number
  break: number
  longBreak: number
  sound: SoundType
}

export const usePomodoroStore = defineStore('pomodoro', () => {
  const settings = ref<PomodoroSettings>({ ...DEFAULT_SETTINGS })
  const showSettings = ref(false)
  const sessionType = ref<SessionType>('work')
  const isRunning = ref(false)
  const pomodoroCount = ref(0)
  const list = useListStore<HistoryRecord>({ storageKey: HISTORY_KEY, defaultValue: [] })
  const history = list.items
  let timer: ReturnType<typeof setInterval> | null = null

  const LABELS: Record<SessionType, string> = { work: '专注', break: '短休息', longBreak: '长休息' }
  const SOUND_OPTIONS: { key: SoundType; label: string }[] = [
    { key: 'chime', label: '清脆' },
    { key: 'bell', label: '铃声' },
    { key: 'alert', label: '警示' },
    { key: 'gentle', label: '柔和' },
  ]
  const sessionOptions: { key: SessionType; label: string }[] = [
    { key: 'work', label: '专注' },
    { key: 'break', label: '短休息' },
    { key: 'longBreak', label: '长休息' },
  ]

  const durations = computed<Record<SessionType, number>>(() => ({
    work: settings.value.work * 60,
    break: settings.value.break * 60,
    longBreak: settings.value.longBreak * 60,
  }))
  const timeLeft = ref(durations.value.work)

  const loadSettings = (): PomodoroSettings => ({
    ...DEFAULT_SETTINGS,
    ...(getStorage<Partial<PomodoroSettings>>(SETTINGS_KEY) || {}),
  })
  const loadHistory = (): HistoryRecord[] => getStorage<HistoryRecord[]>(HISTORY_KEY, []) || []

  const saveSettings = () => {
    setStorage(SETTINGS_KEY, settings.value)
  }

  const init = () => {
    settings.value = loadSettings()
    history.value = loadHistory()
    pomodoroCount.value = history.value.filter((r) => r.type === 'work').length
    timeLeft.value = durations.value[sessionType.value]
  }

  const cleanup = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const timeDisplay = computed(() => {
    const mins = Math.floor(timeLeft.value / 60)
    const secs = timeLeft.value % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  })
  const progress = computed(() => {
    const total = durations.value[sessionType.value]
    return ((total - timeLeft.value) / total) * 100
  })
  const circumference = 2 * Math.PI * 120
  const strokeDashoffset = computed(() => circumference - (progress.value / 100) * circumference)

  const startTimer = () => {
    if (isRunning.value) return
    isRunning.value = true
    timer = setInterval(() => {
      if (timeLeft.value > 0) timeLeft.value--
      else completeSession()
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
    timeLeft.value = durations.value[sessionType.value]
  }

  const completeSession = () => {
    pauseTimer()
    playNotificationSound()
    history.value.unshift({
      id: Date.now(),
      type: sessionType.value,
      duration: durations.value[sessionType.value],
      completedAt: new Date().toISOString(),
    })
    if (sessionType.value === 'work') pomodoroCount.value++
    switchSession()
  }
  const switchSession = () => {
    sessionType.value =
      sessionType.value === 'work'
        ? pomodoroCount.value % 4 === 0
          ? 'longBreak'
          : 'break'
        : 'work'
    timeLeft.value = durations.value[sessionType.value]
  }
  const setSession = (type: SessionType) => {
    if (isRunning.value) return
    sessionType.value = type
    timeLeft.value = durations.value[type]
  }
  const toggleSettings = () => {
    showSettings.value = !showSettings.value
  }
  const applySettings = () => {
    if (isRunning.value) return
    timeLeft.value = durations.value[sessionType.value]
  }

  const todayCount = computed(() => {
    const today = new Date().toDateString()
    return history.value.filter(
      (r) => new Date(r.completedAt).toDateString() === today && r.type === 'work',
    ).length
  })
  const totalFocusMinutes = computed(() => {
    const today = new Date().toDateString()
    return history.value
      .filter((r) => r.type === 'work' && new Date(r.completedAt).toDateString() === today)
      .reduce((s, r) => s + r.duration / 60, 0)
  })

  let playSoundCallback: (() => void) | null = null
  const setPlaySoundCallback = (callback: () => void) => {
    playSoundCallback = callback
  }
  const playNotificationSound = () => {
    if (playSoundCallback) playSoundCallback()
  }

  watch(settings, saveSettings, { deep: true })

  return {
    settings,
    showSettings,
    sessionType,
    isRunning,
    pomodoroCount,
    history,
    LABELS,
    SOUND_OPTIONS,
    sessionOptions,
    durations,
    timeLeft,
    timeDisplay,
    progress,
    circumference,
    strokeDashoffset,
    todayCount,
    totalFocusMinutes,
    init,
    cleanup,
    startTimer,
    pauseTimer,
    resetTimer,
    setSession,
    toggleSettings,
    applySettings,
    setPlaySoundCallback,
  }
})
