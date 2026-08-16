import { computed } from 'vue'
import { solarToLunar, lunarToSolar, getLunarMonthName, getLunarDayName } from '@/utils'
import { getStorage } from '@/lib/storage'

const MS_PER_DAY = 86400000

// 数据的所有权属于市场应用 special-days（见 market-apps/special-days/src/store.ts），
// 宿主首页仅只读消费。该应用未安装时读到空数组，倒计时卡片自然不显示。
const SPECIAL_DAYS_KEY = 'special_days'

export interface SpecialDay {
  id: number
  name: string
  repeatType: 'yearly' | 'once'
  calendarType: 'solar' | 'lunar'
  solarYear: number | null
  solarMonth: number
  solarDay: number
  lunarMonth: number
  lunarDay: number
  emoji: string
  createdAt: string
}

export interface NearestSpecialDay extends SpecialDay {
  daysUntil: number
  dateLabel: string
  nextDate: string
}

function startOfToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

/**
 * 两个本地日期相隔的日历天数。
 *
 * 不能用 (b - a) / 86400000：夏令时切换会让区间多出或少掉 1 小时，
 * 得到 150.04 这类值，再经 Math.ceil 就会整体偏差一天
 * （例如 America/New_York 从 7 月跨到 12 月）。
 * 改为先取各自的 UTC 午夜时间戳，使每天恒为 86400000ms。
 */
function diffInCalendarDays(from: Date, to: Date): number {
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((utcTo - utcFrom) / MS_PER_DAY)
}

export function loadSpecialDays(): SpecialDay[] {
  return getStorage<SpecialDay[]>(SPECIAL_DAYS_KEY, []) || []
}

/**
 * 距离下一次发生还有多少天；农历需要在未来 3 个农历年里试算，
 * 因为闰月可能导致某一年不存在该月日。返回 -1 表示无有效日期。
 */
export function getDaysUntil(day: SpecialDay): number {
  const now = startOfToday()

  if (day.repeatType === 'once') {
    if (day.solarYear == null) return -1
    const target = new Date(day.solarYear, day.solarMonth - 1, day.solarDay)
    target.setHours(0, 0, 0, 0)
    return target >= now ? diffInCalendarDays(now, target) : -1
  }

  if (day.calendarType === 'lunar') {
    const lunar = solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate())
    for (let y = lunar.year; y <= lunar.year + 2; y++) {
      try {
        const solar = lunarToSolar(y, day.lunarMonth, day.lunarDay)
        const candidate = new Date(solar.year, solar.month - 1, solar.day)
        candidate.setHours(0, 0, 0, 0)
        if (candidate >= now) {
          return diffInCalendarDays(now, candidate)
        }
      } catch {
        continue
      }
    }
    return -1
  }

  const targetYear = now.getFullYear()
  let target = new Date(targetYear, day.solarMonth - 1, day.solarDay)
  target.setHours(0, 0, 0, 0)
  if (target < now) {
    target = new Date(targetYear + 1, day.solarMonth - 1, day.solarDay)
    target.setHours(0, 0, 0, 0)
  }
  return diffInCalendarDays(now, target)
}

export function getNextOccurrenceDate(day: SpecialDay): string {
  const daysUntil = getDaysUntil(day)
  if (daysUntil < 0) return ''
  // 用「日」为单位递增而非加毫秒，跨夏令时才不会偏移到前后一天
  const today = startOfToday()
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntil)
  return `${target.getMonth() + 1}月${target.getDate()}日`
}

export function getDisplayDate(day: SpecialDay): string {
  if (day.calendarType === 'lunar') {
    return `农历${getLunarMonthName(day.lunarMonth, false)}${getLunarDayName(day.lunarDay)}`
  }
  return `阳历${day.solarMonth}月${day.solarDay}日`
}

/** 首页倒计时卡片：取最近一个尚未过去的纪念日 */
export function useSpecialDays() {
  const nearestSpecialDay = computed<NearestSpecialDay | null>(() => {
    let nearest: SpecialDay | null = null
    let minDays = Infinity

    for (const day of loadSpecialDays()) {
      const d = getDaysUntil(day)
      if (d >= 0 && d < minDays) {
        minDays = d
        nearest = day
      }
    }

    if (!nearest) return null

    return {
      ...nearest,
      daysUntil: minDays,
      dateLabel: getDisplayDate(nearest),
      nextDate: getNextOccurrenceDate(nearest),
    }
  })

  return { nearestSpecialDay }
}
