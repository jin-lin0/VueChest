<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  buildDayOptions,
  getMaxLunarDay,
  getMaxSolarDay,
  resolveAnchor,
  useSpecialDaysStore,
} from './store'
import { solarToLunar, lunarToSolar, getLunarMonthName, getLunarDayName } from './lunar'
import type { SpecialDay } from './store'

defineOptions({ name: 'SpecialDaysView' })

const specialDaysStore = useSpecialDaysStore()

onMounted(() => {
  specialDaysStore.init()
})

/** 保存失败的原因，直接显示在弹窗里（原先失败是静默的：什么都没发生） */
const formError = ref('')
watch(
  () => specialDaysStore.showForm,
  () => {
    formError.value = ''
  },
)

// 「只此一次」时年份是确定的，日期选项按那一年的真实天数给；「每年重复」时不知道是哪一年，
// 只能给最大范围（农历 30 日、阳历 2 月 29 日），否则闰年那一次就选不到了。
const formYear = computed(() =>
  specialDaysStore.form.repeatType === 'once' ? specialDaysStore.form.solarYear : null,
)

const solarDayOptions = computed(() => {
  const form = specialDaysStore.form
  return buildDayOptions(getMaxSolarDay(form.solarMonth, formYear.value), form.solarDay)
})

const lunarDayOptions = computed(() => {
  const form = specialDaysStore.form
  return buildDayOptions(getMaxLunarDay(form.lunarMonth, formYear.value), form.lunarDay)
})

/**
 * 用户改了年份/月份之后，把已经超出范围的天数收回来。
 *
 * 只在真实的 select 变更里做，刻意不用 watch：`openEditForm` 会整份替换表单，
 * watch 会跟着触发，把用户存过的「七月三十」悄悄改成「廿九」再存回去。
 */
const onDateScopeChange = () => {
  const form = specialDaysStore.form
  const maxSolar = getMaxSolarDay(form.solarMonth, formYear.value)
  if (form.solarDay > maxSolar) form.solarDay = maxSolar
  const maxLunar = getMaxLunarDay(form.lunarMonth, formYear.value)
  if (form.lunarDay > maxLunar) form.lunarDay = maxLunar
}

const saveDay = () => {
  const form = specialDaysStore.form
  if (!form.name.trim()) return

  let anchor
  try {
    anchor = resolveAnchor(form)
  } catch (error) {
    // 原先这里没有 try/catch：换算抛出的 RangeError 会被事件处理器吞掉，
    // 弹窗不关、没有提示、列表里也没有新记录，用户只能以为按钮坏了。
    formError.value = error instanceof Error ? error.message : '日期不合法，无法保存'
    return
  }

  const payload = {
    name: form.name,
    repeatType: form.repeatType,
    calendarType: form.calendarType,
    solarYear: anchor.year,
    solarMonth: anchor.solarMonth,
    solarDay: anchor.solarDay,
    lunarMonth: form.lunarMonth,
    lunarDay: form.lunarDay,
    emoji: form.emoji,
  }

  if (specialDaysStore.editingId !== null) {
    const index = specialDaysStore.specialDays.findIndex((d) => d.id === specialDaysStore.editingId)
    if (index !== -1) {
      const old = specialDaysStore.specialDays[index]
      specialDaysStore.specialDays.splice(index, 1, { ...old, ...payload })
    }
  } else {
    specialDaysStore.specialDays.push({
      id: Date.now(),
      ...payload,
      createdAt: new Date().toISOString(),
    })
  }

  specialDaysStore.closeForm()
}

const getDaysUntil = (day: SpecialDay): number => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (day.repeatType === 'once' && day.solarYear) {
    const target = new Date(day.solarYear, day.solarMonth - 1, day.solarDay)
    target.setHours(0, 0, 0, 0)
    const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000)
    return diff
  }

  if (day.calendarType === 'lunar') {
    const lunar = solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate())

    for (let y = lunar.year; y <= lunar.year + 2; y++) {
      try {
        const solar = lunarToSolar(y, day.lunarMonth, day.lunarDay)
        const candidate = new Date(solar.year, solar.month - 1, solar.day)
        candidate.setHours(0, 0, 0, 0)
        if (candidate >= now) {
          return Math.ceil((candidate.getTime() - now.getTime()) / 86400000)
        }
      } catch {
        continue
      }
    }
    return -1
  } else {
    const targetYear = now.getFullYear()
    let target = new Date(targetYear, day.solarMonth - 1, day.solarDay)
    target.setHours(0, 0, 0, 0)

    if (target < now) {
      target = new Date(targetYear + 1, day.solarMonth - 1, day.solarDay)
      target.setHours(0, 0, 0, 0)
    }

    return Math.ceil((target.getTime() - now.getTime()) / 86400000)
  }
}

const getNextOccurrenceDate = (day: SpecialDay): string => {
  const daysUntil = getDaysUntil(day)
  if (daysUntil < 0) return '已过期'

  const now = new Date()
  const target = new Date(now.getTime() + daysUntil * 86400000)
  return `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`
}

const getDisplayDate = (day: SpecialDay): string => {
  if (day.calendarType === 'lunar') {
    const lunarStr = `农历${getLunarMonthName(day.lunarMonth, false)}${getLunarDayName(day.lunarDay)}`
    if (day.repeatType === 'once' && day.solarYear) {
      return `${day.solarYear}年 ${lunarStr}`
    }
    return lunarStr
  }
  if (day.repeatType === 'once' && day.solarYear) {
    return `阳历 ${day.solarYear}年${day.solarMonth}月${day.solarDay}日`
  }
  return `阳历 ${day.solarMonth}月${day.solarDay}日`
}

const getDaysUntilText = (days: number): string => {
  if (days === 0) return '就是今天！'
  if (days === 1) return '明天'
  if (days < 0) return `已过 ${Math.abs(days)} 天`
  return `还有 ${days} 天`
}

const sortedDays = computed(() => {
  return [...specialDaysStore.specialDays].sort((a, b) => getDaysUntil(a) - getDaysUntil(b))
})

// 原来这里有一个只盯 `form.solarMonth` 的 watch 做天数钳制。现在钳制逻辑在
// `onDateScopeChange` 里、由 select 的 change 事件驱动，且同时覆盖年份与农历月份。
const goBack = () => {
  history.back()
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h1>🎉 特殊日子</h1>
      <button class="add-button" @click="specialDaysStore.openAddForm()">+ 添加</button>
    </header>

    <main class="content">
      <div v-if="sortedDays.length === 0" class="empty-state">
        <span class="empty-icon">📅</span>
        <p>还没有记录特殊日子</p>
        <p class="empty-hint">点击右上角「添加」按钮来记录你的第一个特殊日子吧！</p>
      </div>

      <div v-else class="days-list">
        <div
          v-for="day in sortedDays"
          :key="day.id"
          class="day-card"
          :class="{ today: getDaysUntil(day) === 0 }"
        >
          <div class="day-emoji">{{ day.emoji }}</div>
          <div class="day-info">
            <div class="day-name">{{ day.name }}</div>
            <div class="day-date">
              {{ getDisplayDate(day) }}
              <span v-if="day.calendarType === 'lunar'" class="calendar-tag lunar">农历</span>
              <span v-else class="calendar-tag solar">阳历</span>
              <span v-if="day.repeatType === 'once'" class="calendar-tag once">一次性</span>
              <span v-else class="calendar-tag yearly">每年</span>
            </div>
            <div class="day-next">下次：{{ getNextOccurrenceDate(day) }}</div>
          </div>
          <div
            class="day-countdown"
            :class="{ urgent: getDaysUntil(day) <= 3, today: getDaysUntil(day) === 0 }"
          >
            <div class="countdown-number">{{ getDaysUntil(day) }}</div>
            <div class="countdown-text">{{ getDaysUntilText(getDaysUntil(day)) }}</div>
          </div>
          <div class="day-actions">
            <button class="edit-btn" @click="specialDaysStore.openEditForm(day)">编辑</button>
            <button class="delete-btn" @click="specialDaysStore.deleteSpecialDay(day.id)">
              删除
            </button>
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="specialDaysStore.showForm"
      class="modal-overlay"
      @click.self="specialDaysStore.closeForm"
    >
      <div class="modal">
        <div class="modal-header">
          <h2>{{ specialDaysStore.editingId ? '编辑纪念日' : '添加纪念日' }}</h2>
          <button class="close-btn" @click="specialDaysStore.closeForm">✕</button>
        </div>

        <div class="form-body">
          <div class="form-group">
            <label>名称</label>
            <input
              v-model="specialDaysStore.form.name"
              type="text"
              placeholder="例如：生日、结婚纪念日..."
              maxlength="20"
            />
          </div>

          <div class="form-group">
            <label>表情</label>
            <div class="emoji-picker">
              <button
                v-for="e in specialDaysStore.emojiOptions"
                :key="e"
                class="emoji-btn"
                :class="{ active: specialDaysStore.form.emoji === e }"
                @click="specialDaysStore.form.emoji = e"
              >
                {{ e }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>日历类型</label>
            <div class="calendar-type-picker">
              <button
                class="type-btn"
                :class="{ active: specialDaysStore.form.calendarType === 'solar' }"
                @click="specialDaysStore.form.calendarType = 'solar'"
              >
                ☀️ 阳历
              </button>
              <button
                class="type-btn"
                :class="{ active: specialDaysStore.form.calendarType === 'lunar' }"
                @click="specialDaysStore.form.calendarType = 'lunar'"
              >
                🌙 农历
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>重复类型</label>
            <div class="calendar-type-picker">
              <button
                class="type-btn"
                :class="{ active: specialDaysStore.form.repeatType === 'yearly' }"
                @click="specialDaysStore.form.repeatType = 'yearly'"
              >
                🔄 每年重复
              </button>
              <button
                class="type-btn"
                :class="{ active: specialDaysStore.form.repeatType === 'once' }"
                @click="specialDaysStore.form.repeatType = 'once'"
              >
                📌 一次性
              </button>
            </div>
          </div>

          <div v-if="specialDaysStore.form.repeatType === 'once'" class="form-group">
            <label>年份</label>
            <select
              v-model.number="specialDaysStore.form.solarYear"
              class="date-select year-select"
              @change="onDateScopeChange"
            >
              <option :value="null" disabled>请选择年份</option>
              <option v-for="y in specialDaysStore.yearOptions" :key="y" :value="y">
                {{ y }}年
              </option>
            </select>
          </div>

          <div v-if="specialDaysStore.form.calendarType === 'solar'" class="form-group">
            <label>阳历日期</label>
            <div class="date-picker">
              <select
                v-model.number="specialDaysStore.form.solarMonth"
                class="date-select"
                @change="onDateScopeChange"
              >
                <option v-for="m in specialDaysStore.solarMonthOptions" :key="m" :value="m">
                  {{ m }}月
                </option>
              </select>
              <select v-model.number="specialDaysStore.form.solarDay" class="date-select">
                <option v-for="d in solarDayOptions" :key="d" :value="d">{{ d }}日</option>
              </select>
            </div>
          </div>

          <div v-else class="form-group">
            <label>农历日期</label>
            <div class="date-picker">
              <select
                v-model.number="specialDaysStore.form.lunarMonth"
                class="date-select"
                @change="onDateScopeChange"
              >
                <option v-for="m in specialDaysStore.lunarMonthOptions" :key="m" :value="m">
                  {{ getLunarMonthName(m) }}
                </option>
              </select>
              <select v-model.number="specialDaysStore.form.lunarDay" class="date-select">
                <option v-for="d in lunarDayOptions" :key="d" :value="d">{{ d }}日</option>
              </select>
            </div>
          </div>
        </div>

        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

        <div class="modal-footer">
          <button class="cancel-btn" @click="specialDaysStore.closeForm">取消</button>
          <button class="save-btn" @click="saveDay" :disabled="!specialDaysStore.form.name.trim()">
            {{ specialDaysStore.editingId ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.back-button {
  background-color: var(--info);
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
  color: var(--text-primary);
  flex: 1;
}

.add-button {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: opacity 0.2s;
}

.add-button:hover {
  opacity: 0.85;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state p {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}

.empty-hint {
  font-size: 0.9rem !important;
  color: var(--text-dim) !important;
}

.days-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.day-card {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border-radius: 12px;
  padding: 1.2rem 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.day-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.day-card.today {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
}

.day-card.today .day-name,
.day-card.today .day-date,
.day-card.today .day-next {
  color: white;
}

.day-card.today .calendar-tag {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.day-emoji {
  font-size: 2.5rem;
  margin-right: 1.2rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-subtle);
  border-radius: 12px;
  flex-shrink: 0;
}

.day-card.today .day-emoji {
  background: rgba(255, 255, 255, 0.2);
}

.day-info {
  flex: 1;
  min-width: 0;
}

.day-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.3rem;
}

.day-date {
  font-size: 0.9rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
}

.calendar-tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-weight: 500;
}

.calendar-tag.lunar {
  background: #e8f4fd;
  color: var(--info);
}

.calendar-tag.solar {
  background: #fef3e2;
  color: #f39c12;
}

.calendar-tag.once {
  background: #fde8e8;
  color: #e74c3c;
}

.calendar-tag.yearly {
  background: #e8f5e9;
  color: #27ae60;
}

.day-next {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.day-countdown {
  text-align: center;
  margin: 0 1.5rem;
  min-width: 70px;
}

.countdown-number {
  font-size: 2rem;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
}

.countdown-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.day-countdown.urgent .countdown-number {
  color: #e74c3c;
}

.day-countdown.today .countdown-number {
  color: #f1c40f;
  font-size: 1.5rem;
}

.day-card.today .countdown-number {
  color: #f1c40f;
}

.day-card.today .countdown-text {
  color: rgba(255, 255, 255, 0.8);
}

.day-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.edit-btn,
.delete-btn {
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: opacity 0.2s;
}

.edit-btn {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.edit-btn:hover {
  background: var(--border-light);
}

.delete-btn {
  background: #fee;
  color: #e74c3c;
}

.delete-btn:hover {
  background: #fdd;
}

.day-card.today .edit-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.day-card.today .delete-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  background: var(--bg-card);
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid var(--border-light);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.3rem;
}

.close-btn:hover {
  color: #333;
}

.form-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.2rem;
}

.form-group label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.form-group input[type='text'] {
  width: 100%;
  padding: 0.7rem 1rem;
  border: 2px solid var(--border-light);
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input[type='text']:focus {
  border-color: var(--accent);
}

.emoji-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.emoji-btn {
  width: 40px;
  height: 40px;
  border: 2px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  font-size: 1.3rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emoji-btn:hover {
  border-color: var(--accent);
  transform: scale(1.1);
}

.emoji-btn.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.calendar-type-picker {
  display: flex;
  gap: 0.8rem;
}

.type-btn {
  flex: 1;
  padding: 0.7rem;
  border: 2px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.type-btn:hover {
  border-color: var(--accent);
}

.type-btn.active {
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
}

.date-picker {
  display: flex;
  gap: 0.8rem;
}

.date-select {
  flex: 1;
  padding: 0.7rem 1rem;
  border: 2px solid var(--border-light);
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.2s;
}

.date-select:focus {
  border-color: var(--accent);
}

.year-select {
  width: 100%;
}

/* 保存失败的说明。以前失败是完全静默的，用户只会觉得按钮没反应。 */
.form-error {
  margin: 0 1.5rem 0.6rem;
  padding: 0.55rem 0.8rem;
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
  font-size: 0.9rem;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-light);
}

.cancel-btn {
  padding: 0.6rem 1.5rem;
  border: 2px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  border-color: var(--border-light);
  background: var(--bg-hover);
}

.save-btn {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.save-btn:hover {
  opacity: 0.85;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.back-btn {
  background: var(--info);
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

  .app-header {
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-bottom: 1.2rem;
  }

  .app-header h1 {
    font-size: 1.3rem;
  }

  .back-button {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
  }

  .add-button {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .day-card {
    flex-wrap: wrap;
    padding: 1rem;
    gap: 0.5rem;
  }

  .day-emoji {
    font-size: 1.8rem;
    width: 44px;
    height: 44px;
    margin-right: 0.8rem;
    border-radius: 10px;
  }

  .day-info {
    flex: 1;
    min-width: 0;
  }

  .day-name {
    font-size: 1rem;
  }

  .day-date {
    font-size: 0.8rem;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .day-next {
    font-size: 0.75rem;
  }

  .day-countdown {
    margin: 0 0.8rem;
    min-width: 50px;
  }

  .countdown-number {
    font-size: 1.5rem;
  }

  .countdown-text {
    font-size: 0.7rem;
  }

  .day-actions {
    margin-left: auto;
    gap: 0.4rem;
  }

  .edit-btn,
  .delete-btn {
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
  }

  .calendar-type-picker {
    gap: 0.5rem;
  }

  .type-btn {
    padding: 0.6rem;
    font-size: 0.9rem;
  }

  .emoji-btn {
    width: 36px;
    height: 36px;
    font-size: 1.1rem;
  }

  .date-select {
    padding: 0.6rem 0.8rem;
    font-size: 0.9rem;
  }

  .modal {
    max-width: 100%;
    border-radius: 12px;
  }

  .form-body {
    padding: 1rem;
  }

  .modal-footer {
    padding: 0.8rem 1rem;
  }
}
</style>
