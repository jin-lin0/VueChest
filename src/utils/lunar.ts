import { Solar, Lunar } from 'lunar-javascript'

interface LunarDate {
  year: number
  month: number
  day: number
  isLeapMonth: boolean
}

interface SolarDate {
  year: number
  month: number
  day: number
}

const LUNAR_MONTH_NAMES = [
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
const LUNAR_DAY_NAMES = [
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

export function solarToLunar(year: number, month: number, day: number): LunarDate {
  const solar = Solar.fromYmd(year, month, day)
  const lunar = solar.getLunar()
  return {
    year: lunar.getYear(),
    month: lunar.getMonth(),
    day: lunar.getDay(),
    isLeapMonth: lunar.getMonth() !== Math.abs(lunar.getMonth()),
  }
}

export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeapMonth = false,
): SolarDate {
  const lunar = Lunar.fromYmd(year, isLeapMonth ? -month : month, day)
  const solar = lunar.getSolar()
  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
  }
}

export function getLunarMonthName(month: number, isLeapMonth: boolean): string {
  return (isLeapMonth ? '闰' : '') + LUNAR_MONTH_NAMES[month - 1]
}

export function getLunarDayName(day: number): string {
  return LUNAR_DAY_NAMES[day - 1]
}
