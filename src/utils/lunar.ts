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

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
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

const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']

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

export function getYearGanZhi(year: number): string {
  return TIAN_GAN[(year - 4) % 10] + DI_ZHI[(year - 4) % 12]
}

export function getAnimal(year: number): string {
  return ANIMALS[(year - 4) % 12]
}

export function getLunarDateString(lunar: LunarDate): string {
  return `${getYearGanZhi(lunar.year)}年（${getAnimal(lunar.year)}年）${getLunarMonthName(lunar.month, lunar.isLeapMonth)}${getLunarDayName(lunar.day)}`
}

export function getNextOccurrence(
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth: boolean,
  from: Date = new Date(),
): SolarDate {
  const solar = Solar.fromYmd(from.getFullYear(), from.getMonth() + 1, from.getDate())
  const currentLunar = solar.getLunar()

  for (let y = currentLunar.getYear(); y <= currentLunar.getYear() + 2; y++) {
    try {
      const lunar = Lunar.fromYmd(y, isLeapMonth ? -lunarMonth : lunarMonth, lunarDay)
      const candidateSolar = lunar.getSolar()
      const candidate = new Date(
        candidateSolar.getYear(),
        candidateSolar.getMonth() - 1,
        candidateSolar.getDay(),
      )
      if (candidate >= from) {
        return {
          year: candidateSolar.getYear(),
          month: candidateSolar.getMonth(),
          day: candidateSolar.getDay(),
        }
      }
    } catch {
      continue
    }
  }

  const lunar = Lunar.fromYmd(
    currentLunar.getYear() + 1,
    isLeapMonth ? -lunarMonth : lunarMonth,
    lunarDay,
  )
  const resultSolar = lunar.getSolar()
  return {
    year: resultSolar.getYear(),
    month: resultSolar.getMonth(),
    day: resultSolar.getDay(),
  }
}
