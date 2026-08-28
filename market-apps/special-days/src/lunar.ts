import { Solar, Lunar } from 'lunar-javascript'

interface LunarDate {
  year: number
  month: number
  day: number
}

export function solarToLunar(y: number, m: number, d: number): LunarDate {
  const solar = Solar.fromYmd(y, m, d)
  const lunar = solar.getLunar()
  // lunar-javascript 用负数月份表示闰月，规整为正数月，避免下游取月名越界。
  return { year: lunar.getYear(), month: Math.abs(lunar.getMonth()), day: lunar.getDay() }
}

export function lunarToSolar(y: number, m: number, d: number): LunarDate {
  const lunar = Lunar.fromYmd(y, m, d)
  const solar = lunar.getSolar()
  return { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() }
}

export function getLunarMonthName(month: number, leap = false): string {
  const names = [
    '',
    '正月',
    '二月',
    '三月',
    '四月',
    '五月',
    '六月',
    '七月',
    '八月',
    '九月',
    '十月',
    '冬月',
    '腊月',
  ]
  const name = names[month] || `${month}月`
  return leap ? `闰${name}` : name
}

export function getLunarDayName(day: number): string {
  const names = [
    '',
    '初一',
    '初二',
    '初三',
    '初四',
    '初五',
    '初六',
    '初七',
    '初八',
    '初九',
    '初十',
    '十一',
    '十二',
    '十三',
    '十四',
    '十五',
    '十六',
    '十七',
    '十八',
    '十九',
    '二十',
    '廿一',
    '廿二',
    '廿三',
    '廿四',
    '廿五',
    '廿六',
    '廿七',
    '廿八',
    '廿九',
    '三十',
  ]
  return names[day] || `${day}日`
}
