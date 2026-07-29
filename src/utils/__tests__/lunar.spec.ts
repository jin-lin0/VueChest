import { describe, it, expect } from 'vitest'
import {
  getLunarMonthName,
  getLunarDayName,
  solarToLunar,
  lunarToSolar,
} from '../lunar'

/* --------------------------- 农历月名 / 日名 --------------------------- */
describe('getLunarMonthName', () => {
  it('正月到腊月的标准命名', () => {
    expect(getLunarMonthName(1, false)).toBe('正月')
    expect(getLunarMonthName(6, false)).toBe('六月')
    expect(getLunarMonthName(11, false)).toBe('冬月')
    expect(getLunarMonthName(12, false)).toBe('腊月')
  })

  it('闰月加「闰」前缀', () => {
    expect(getLunarMonthName(2, true)).toBe('闰二月')
    expect(getLunarMonthName(5, true)).toBe('闰五月')
  })
})

describe('getLunarDayName', () => {
  it('初一 / 十五 / 二十 / 廿一 / 三十', () => {
    expect(getLunarDayName(1)).toBe('初一')
    expect(getLunarDayName(10)).toBe('初十')
    expect(getLunarDayName(15)).toBe('十五')
    expect(getLunarDayName(20)).toBe('二十')
    expect(getLunarDayName(21)).toBe('廿一')
    expect(getLunarDayName(25)).toBe('廿五')
    expect(getLunarDayName(30)).toBe('三十')
  })
})

/* ----------------------------- 阴阳历互转 ----------------------------- */
describe('solarToLunar', () => {
  it('已知阳历换算农历（2026-07-28 即农历六月十五）', () => {
    expect(solarToLunar(2026, 7, 28)).toEqual({
      year: 2026,
      month: 6,
      day: 15,
      isLeapMonth: false,
    })
  })

  it('闰月能被识别', () => {
    // 2023 闰二月初一对应阳历 2023-03-22
    const r = solarToLunar(2023, 3, 22)
    expect(r).toEqual({ year: 2023, month: 2, day: 1, isLeapMonth: true })
  })
})

describe('lunarToSolar', () => {
  it('已知农历换算阳历（2026 农历八月十五 → 2026-09-25）', () => {
    expect(lunarToSolar(2026, 8, 15)).toEqual({ year: 2026, month: 9, day: 25 })
  })

  it('闰月参数反向换算正确', () => {
    expect(lunarToSolar(2023, 2, 1, true)).toEqual({ year: 2023, month: 3, day: 22 })
  })
})

describe('solarToLunar ↔ lunarToSolar 往返一致', () => {
  it('多个阳历日期往返还原', () => {
    const dates: [number, number, number][] = [
      [2026, 1, 1],
      [2026, 7, 28],
      [2026, 12, 31],
      [2024, 2, 29], // 闰年闰日
    ]
    for (const [y, m, d] of dates) {
      const l = solarToLunar(y, m, d)
      const back = lunarToSolar(l.year, l.month, l.day, l.isLeapMonth)
      expect(back).toEqual({ year: y, month: m, day: d })
    }
  })
})
