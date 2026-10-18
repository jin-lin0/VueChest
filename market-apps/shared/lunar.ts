/**
 * 农历 1900—2100 年的紧凑年表实现，避免市场应用加载完整历法库。
 * 年表由生成脚本从 lunar-javascript 推算，并通过逐日对照校验。
 */

export interface LunarDate {
  year: number
  month: number
  day: number
  isLeapMonth: boolean
}

export interface SolarDate {
  year: number
  month: number
  day: number
}

const MIN_YEAR = 1900
const MAX_YEAR = 2100

/**
 * 每个农历年的 `leap * 8192 + mask`。
 *
 * - `leap`：闰几月，0 表示平年；
 * - `mask`：13 位，第 i 位表示「按时间顺序第 i 个月」是 30 天（0 则是 29 天）。
 *   闰月插在它所闰的那个月之后，所以序列形如 `1,2,…,L,闰L,L+1,…,12`。
 */
// prettier-ignore
const LUNAR_YEAR_INFO: number[] = [
  71378, 1874, 3749, 46666, 1611, 2715, 38230, 1386, 2905, 22354,
  1874, 56101, 2853, 2635, 46251, 685, 1387, 19305, 3497, 64914,
  3730, 3365, 47693, 2646, 694, 38325, 1748, 3753, 24210, 3730,
  52518, 1323, 2647, 45750, 2906, 1748, 28361, 1865, 63123, 2707,
  1323, 51803, 2733, 1386, 39765, 2980, 2889, 23187, 2709, 62765,
  1334, 2733, 46506, 1458, 3493, 32074, 3402, 68245, 2711, 1366,
  51893, 2773, 1746, 36517, 3749, 1610, 27799, 2715, 62810, 1386,
  2921, 46930, 2898, 2853, 38475, 2635, 70827, 685, 1389, 52073,
  3497, 3474, 40229, 3365, 88653, 2646, 694, 50613, 1749, 3753,
  48786, 3730, 3366, 27222, 2647, 70870, 858, 1749, 46793, 1865,
  1683, 38187, 1323, 2651, 21850, 1386, 64341, 2980, 2889, 47763,
  2709, 1325, 35501, 2741, 79274, 1490, 3493, 56650, 3402, 3221,
  38190, 1366, 2741, 21938, 1746, 52901, 1829, 1611, 44183, 3243,
  1370, 27350, 2921, 96082, 2898, 2853, 55883, 2635, 1195, 42331,
  1453, 2922, 23378, 3474, 64805, 3365, 2645, 46253, 1206, 1461,
  28074, 3785, 73362, 3730, 3366, 51798, 2647, 1238, 34517, 1877,
  1865, 28307, 1683, 62763, 1323, 2651, 46426, 1386, 2917, 38730,
  2890, 72341, 2709, 1325, 51885, 2741, 1450, 35749, 3493, 3402,
  31893, 3222, 63822, 1366, 2741, 46514, 1746, 3749, 36426, 1675,
  68759, 1195, 1371, 51926, 2922, 1874, 38693, 2885, 2699, 21659,
  1195,
]

/** 农历 1900 年正月初一 = 公历 1900-01-31，作为全表的锚点。 */
const ANCHOR_ORDINAL = Date.UTC(1900, 0, 31) / 86400000

/** 以 1970-01-01 为 0 的日序号（全用 UTC，与本地时区、夏令时无关）。 */
function toOrdinal(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / 86400000
}

function fromOrdinal(ordinal: number): SolarDate {
  const date = new Date(ordinal * 86400000)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

interface MonthInfo {
  month: number
  isLeap: boolean
  days: number
}

function monthList(year: number): MonthInfo[] {
  const info = LUNAR_YEAR_INFO[year - MIN_YEAR]
  if (info === undefined) {
    throw new RangeError(`农历年份 ${year} 超出支持范围 ${MIN_YEAR}-${MAX_YEAR}`)
  }
  const leap = info >>> 13
  const mask = info & 0x1fff
  const list: MonthInfo[] = []
  for (let month = 1; month <= 12; month += 1) {
    // 用 push 前的 length 当下标，正好等于该月在序列中的位次
    list.push({ month, isLeap: false, days: mask & (1 << list.length) ? 30 : 29 })
    if (month === leap) {
      list.push({ month, isLeap: true, days: mask & (1 << list.length) ? 30 : 29 })
    }
  }
  return list
}

/** 累加表：`CUMULATIVE[i]` = 农历 (1900+i) 年正月初一距锚点的天数。首次使用时构建一次。 */
let cumulative: number[] | null = null

function cumulativeTable(): number[] {
  if (cumulative) return cumulative
  const table: number[] = []
  let offset = 0
  for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
    table.push(offset)
    for (const month of monthList(year)) offset += month.days
  }
  cumulative = table
  return table
}

/** 本年正月初一距锚点的天数。 */
function yearStart(year: number): number {
  const table = cumulativeTable()
  const value = table[year - MIN_YEAR]
  if (value === undefined) {
    throw new RangeError(`农历年份 ${year} 超出支持范围 ${MIN_YEAR}-${MAX_YEAR}`)
  }
  return value
}

export function isLeapLunarYear(year: number): boolean {
  return LUNAR_YEAR_INFO[year - MIN_YEAR] >>> 13 !== 0
}

/** 公历 → 农历。闰月不改月份符号，而是额外给出 `isLeapMonth`。 */
export function solarToLunar(year: number, month: number, day: number): LunarDate {
  const offset = toOrdinal(year, month, day) - ANCHOR_ORDINAL
  if (offset < 0) {
    throw new RangeError(`${year}-${month}-${day} 早于农历 ${MIN_YEAR} 年正月初一（1900-01-31）`)
  }
  const table = cumulativeTable()
  let index = table.length - 1
  while (index > 0 && table[index] > offset) index -= 1
  const lunarYear = MIN_YEAR + index

  let rest = offset - table[index]
  for (const entry of monthList(lunarYear)) {
    if (rest < entry.days) {
      return { year: lunarYear, month: entry.month, day: rest + 1, isLeapMonth: entry.isLeap }
    }
    rest -= entry.days
  }
  // 累加表覆盖到 MAX_YEAR，走到这里说明公历日期已越过农历 2100 年腊月
  throw new RangeError(`${year}-${month}-${day} 超出农历支持范围（至 ${MAX_YEAR} 年腊月）`)
}

/** 农历 → 公历。`isLeapMonth` 为真时必须是该年真实存在的闰月，否则抛错。 */
export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeapMonth = false,
): SolarDate {
  const list = monthList(year)
  const index = list.findIndex((item) => item.month === month && item.isLeap === isLeapMonth)
  if (index === -1) {
    throw new RangeError(`农历 ${year} 年没有${isLeapMonth ? '闰' : ''}${getLunarMonthName(month)}`)
  }
  const entry = list[index]
  if (day < 1 || day > entry.days) {
    throw new RangeError(
      `农历 ${year} 年${isLeapMonth ? '闰' : ''}${getLunarMonthName(month)}只有 ${entry.days} 天`,
    )
  }
  let offset = yearStart(year) + day - 1
  for (let i = 0; i < index; i += 1) offset += list[i].days
  return fromOrdinal(ANCHOR_ORDINAL + offset)
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

export function getLunarMonthName(month: number, isLeapMonth = false): string {
  return (isLeapMonth ? '闰' : '') + (LUNAR_MONTH_NAMES[month - 1] || `${month}月`)
}

export function getLunarDayName(day: number): string {
  return LUNAR_DAY_NAMES[day - 1] || `${day}日`
}

/** 该农历年某月（可指定闰月）的天数，供表单做选项校验。 */
export function getLunarMonthDays(year: number, month: number, isLeapMonth = false): number {
  const list = monthList(year)
  const entry = list.find((item) => item.month === month && item.isLeap === isLeapMonth)
  if (!entry) {
    throw new RangeError(
      isLeapMonth
        ? `农历 ${year} 年没有闰${getLunarMonthName(month)}`
        : `农历 ${year} 年没有${getLunarMonthName(month)}`,
    )
  }
  return entry.days
}

/**
 * 在 fromYear 起的 withinYears 年内寻找第一个存在的农历日期。
 * 用于每年重复、但并非每年存在的日期（如某月三十）；非法或越界输入返回 null。
 */
export function findLunarDate(
  fromYear: number,
  month: number,
  day: number,
  withinYears = 3,
): SolarDate | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1) return null
  const lastYear = fromYear + withinYears - 1
  for (let year = fromYear; year <= lastYear; year += 1) {
    let days: number
    try {
      days = getLunarMonthDays(year, month)
    } catch {
      // 年份跑出年表范围，再往后找也一样
      return null
    }
    if (day <= days) return lunarToSolar(year, month, day)
  }
  return null
}

export const LUNAR_SUPPORTED_RANGE = { minYear: MIN_YEAR, maxYear: MAX_YEAR } as const
