import { describe, expect, it } from 'vitest'
import { findLunarDate, getLunarMonthDays, lunarToSolar, solarToLunar } from '../lunar'


const WINDOW = 3

/** 用年表独立算出「从 fromYear 起窗口内第一个有三十的年份」，不复用被测实现。 */
function expectedYear(fromYear: number, month: number, day: number): number | null {
  for (let year = fromYear; year < fromYear + WINDOW; year += 1) {
    try {
      if (day <= getLunarMonthDays(year, month)) return year
    } catch {
      return null // 越界年份，年表不认
    }
  }
  return null
}

describe('findLunarDate', () => {
  it('农历七月三十在 2026 年不存在，必须落到之后第一个真实存在的年份', () => {
    // 2026 是「今年」，也是 special-days 默认用来做公历锚点的年份
    expect(getLunarMonthDays(2026, 7)).toBe(29)

    const found = findLunarDate(2026, 7, 30)
    expect(found).not.toBeNull()
    expect(found!.year).toBeGreaterThan(2026)

    // 返回的那一天必须真的能反查回「七月三十」
    expect(solarToLunar(found!.year, found!.month, found!.day)).toMatchObject({
      month: 7,
      day: 30,
      isLeapMonth: false,
    })
  })

  it('返回窗口内最小的合法年份（之前的每一年都只有 29 天）', () => {
    const from = 2026
    const found = findLunarDate(from, 7, 30)!
    for (let year = from; year < found.year; year += 1) {
      expect(getLunarMonthDays(year, 7), `农历 ${year} 年七月不该有三十`).toBe(29)
    }
  })

  it('窗口内都没有三十时返回 null', () => {
    const cases: { year: number; month: number }[] = []
    for (let year = 1900; year <= 2100 - WINDOW; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        if (expectedYear(year, month, 30) === null) cases.push({ year, month })
      }
    }
    expect(cases.length, '年表里应当存在「连续三年都没有三十」的情形').toBeGreaterThan(0)

    for (const { year, month } of cases.slice(0, 40)) {
      expect(findLunarDate(year, month, 30), `${year} 年 ${month} 月不该找到三十`).toBeNull()
    }
  })

  it('对越界与非法输入返回 null，绝不抛错', () => {
    const probes: [number, number, number][] = [
      [1800, 1, 1],
      [1899, 12, 30],
      [2200, 6, 15],
      [1900, 0, 1],
      [1900, 13, 1],
      [1900, 1, 0],
      [1900, 1, 31],
      [Number.NaN, 1, 1],
    ]
    for (const [year, month, day] of probes) {
      expect(
        () => findLunarDate(year, month, day),
        `findLunarDate(${year}, ${month}, ${day}) 不该抛错`,
      ).not.toThrow()
      expect(findLunarDate(year, month, day), `${year}-${month}-${day}`).toBeNull()
    }
  })

  it('窗口末尾越过年表上限时不抛错：要么落在 2100 年内，要么静默返回 null', () => {
    expect(() => findLunarDate(2100, 12, 30, 5)).not.toThrow()
    const boundary = findLunarDate(2100, 12, 30)
    if (boundary) {
      expect(solarToLunar(boundary.year, boundary.month, boundary.day)).toMatchObject({
        year: 2100,
        month: 12,
        day: 30,
      })
    } else {
      expect(getLunarMonthDays(2100, 12)).toBe(29)
    }
  })

  it('窗口为 1 年时，与「该年该月是否真有这一天」逐年一致', () => {
    for (let year = 1900; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const days = getLunarMonthDays(year, month)
        expect(findLunarDate(year, month, days, 1), `${year}-${month}-${days}`).toEqual(
          lunarToSolar(year, month, days),
        )
        if (days === 29) {
          expect(findLunarDate(year, month, 30, 1), `${year}-${month}-30`).toBeNull()
        }
      }
    }
  })

  it('一至廿九必然当年就有（每个月都至少有 29 天）', () => {
    for (let year = 1900; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const found = findLunarDate(year, month, 29, 1)
        expect(found, `${year}-${month}-29`).toEqual(lunarToSolar(year, month, 29))
      }
    }
  })
})
