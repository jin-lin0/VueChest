// @vitest-environment happy-dom
// 上面的 pragma 是必需的：store.ts 会经 `shared/bridge.ts` 读 `window.__VueChest__`，
// 该模块在顶层就取 window，node 环境下直接 ReferenceError。
import { describe, expect, it } from 'vitest'
import {
  getLunarMonthDays,
  getLunarMonthName,
  lunarToSolar,
  solarToLunar,
} from '../../../shared/lunar'
import {
  buildDayOptions,
  getMaxLunarDay,
  getMaxSolarDay,
  resolveAnchor,
  type EditForm,
} from '../store'

/**
 * `special-days` 的日期换算与选项范围。
 *
 * 缺陷现场：`getMaxLunarDay()` 曾是无参的 `() => 30`，而 `saveDay()` 用「今年」当农历锚点。
 * 农历每个月至多 30 天、且只有约一半的年份有三十 —— **2026 年七月就只有 29 天**，
 * 于是「每年重复 + 农历七月三十」这条完全合理的记录，点保存会抛 RangeError 被
 * 事件处理器吞掉：弹窗不关、没有提示、什么都没发生。
 */

const NOW = new Date(2026, 9, 15) // 2026-10-15，与当前日期一致

function form(partial: Partial<EditForm> = {}): EditForm {
  return {
    name: '纪念日',
    repeatType: 'yearly',
    calendarType: 'solar',
    solarYear: null,
    solarMonth: 10,
    solarDay: 15,
    lunarMonth: 1,
    lunarDay: 1,
    emoji: '🎉',
    ...partial,
  }
}

describe('getMaxLunarDay', () => {
  it('给定年份时按那年该月的真实天数（2026 年七月只有 29 天）', () => {
    expect(getLunarMonthDays(2026, 7)).toBe(29)
    expect(getMaxLunarDay(7, 2026)).toBe(29)
  })

  it('不给年份（每年重复）时给出所有年份的最大值 30', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(getMaxLunarDay(month, null), `农历 ${month} 月`).toBe(30)
    }
  })

  it('与年表逐月一致，且给出的选项都能被 lunarToSolar 接受', () => {
    for (let year = 1900; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const max = getMaxLunarDay(month, year)
        expect(max, `${year} 年 ${month} 月`).toBe(getLunarMonthDays(year, month))
        for (const day of buildDayOptions(max, 1)) {
          expect(
            () => lunarToSolar(year, month, day),
            `${year}-${month}-${day} 出现在选项里却换算不了`,
          ).not.toThrow()
        }
      }
    }
  })

  it('年份越界时退化为最大值，不抛错（选项列表不能因此崩掉）', () => {
    expect(getMaxLunarDay(7, 1800)).toBe(30)
    expect(getMaxLunarDay(7, 2200)).toBe(30)
    expect(() => getMaxLunarDay(0, Number.NaN)).not.toThrow()
  })
})

describe('getMaxSolarDay', () => {
  it('二月按年份区分闰年', () => {
    expect(getMaxSolarDay(2, 2026)).toBe(28)
    expect(getMaxSolarDay(2, 2024)).toBe(29)
    expect(getMaxSolarDay(2, 2000)).toBe(29) // 400 年一闰
    expect(getMaxSolarDay(2, 1900)).toBe(28) // 百年不闰
  })

  it('不给年份时按最大可能（29），其它月份与年份无关', () => {
    expect(getMaxSolarDay(2, null)).toBe(29)
    expect(getMaxSolarDay(1, 2026)).toBe(31)
    expect(getMaxSolarDay(4, 2026)).toBe(30)
    expect(getMaxSolarDay(12, 2027)).toBe(31)
  })
})

describe('buildDayOptions', () => {
  it('把超出上限的当前值留在选项里，不静默改写用户已存的数据', () => {
    expect(buildDayOptions(29, 30)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
    expect(buildDayOptions(29, 12)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1))
  })

  it('当前值非法时就用上限', () => {
    expect(buildDayOptions(29, Number.NaN)).toHaveLength(29)
    expect(buildDayOptions(29, 0)).toHaveLength(29)
  })
})

describe('resolveAnchor', () => {
  it('每年重复的农历日期落到之后第一个真实存在的年份（不再抛错）', () => {
    // 独立复算期望值：2026 年起第一个「七月有三十」的年份
    let anchorYear = 2026
    while (getLunarMonthDays(anchorYear, 7) < 30) anchorYear += 1
    expect(anchorYear).toBeGreaterThan(2026)
    const expected = lunarToSolar(anchorYear, 7, 30)

    const anchor = resolveAnchor(form({ calendarType: 'lunar', lunarMonth: 7, lunarDay: 30 }), NOW)

    expect(anchor.year).toBeNull() // 「每年重复」不写死年份
    expect(anchor.solarMonth).toBe(expected.month)
    expect(anchor.solarDay).toBe(expected.day)
    // 锚点这一天确实是七月三十
    expect(solarToLunar(anchorYear, anchor.solarMonth, anchor.solarDay)).toMatchObject({
      month: 7,
      day: 30,
    })
  })

  it('每年重复的农历日期换算成公历后就是那年的七月十五', () => {
    const anchor = resolveAnchor(form({ calendarType: 'lunar', lunarMonth: 7, lunarDay: 15 }), NOW)
    expect(anchor.year).toBeNull()
    expect(solarToLunar(2026, anchor.solarMonth, anchor.solarDay)).toMatchObject({
      year: 2026,
      month: 7,
      day: 15,
    })
  })

  it('只此一次的农历日期：该年没有这天就明确报错，给出可直接展示的中文说明', () => {
    expect(() =>
      resolveAnchor(
        form({
          repeatType: 'once',
          solarYear: 2026,
          calendarType: 'lunar',
          lunarMonth: 7,
          lunarDay: 30,
        }),
        NOW,
      ),
    ).toThrowError(/农历 2026 年七月只有 29 天/)
  })

  it('只此一次的农历日期：该年确实有这天时正常换算', () => {
    const anchor = resolveAnchor(
      form({
        repeatType: 'once',
        solarYear: 2026,
        calendarType: 'lunar',
        lunarMonth: 7,
        lunarDay: 29,
      }),
      NOW,
    )
    expect(anchor.year).toBe(2026)
    expect(anchor.solarMonth).toBe(lunarToSolar(2026, 7, 29).month)
    expect(anchor.solarDay).toBe(lunarToSolar(2026, 7, 29).day)
  })

  it('只此一次的阳历日期：二月二十九遇到平年时报错，而不是悄悄挪到三月一号', () => {
    expect(() =>
      resolveAnchor(
        form({ repeatType: 'once', solarYear: 2026, solarMonth: 2, solarDay: 29 }),
        NOW,
      ),
    ).toThrowError(/2026 年 2 月只有 28 天/)
    expect(
      resolveAnchor(
        form({ repeatType: 'once', solarYear: 2024, solarMonth: 2, solarDay: 29 }),
        NOW,
      ),
    ).toEqual({ year: 2024, solarMonth: 2, solarDay: 29 })
  })

  it('每年重复的阳历二月二十九仍然可以保存（闰年会有）', () => {
    expect(resolveAnchor(form({ solarMonth: 2, solarDay: 29 }), NOW)).toEqual({
      year: null,
      solarMonth: 2,
      solarDay: 29,
    })
  })

  it('只此一次未选年份时用今年，并把它写进 solarYear', () => {
    expect(resolveAnchor(form({ repeatType: 'once', solarYear: null }), NOW)).toEqual({
      year: 2026,
      solarMonth: 10,
      solarDay: 15,
    })
  })

  it('每年重复的阳历日期不带年份', () => {
    expect(resolveAnchor(form({ solarMonth: 3, solarDay: 8 }), NOW)).toEqual({
      year: null,
      solarMonth: 3,
      solarDay: 8,
    })
  })
})

describe('农历月名', () => {
  it('共享模块给出的 12 个月名与模板里原先硬编码的完全一致', () => {
    // 模板曾内联一份月名数组，和 getLunarMonthName 各存一份真相；这里锁住它们的等价性。
    const inline = [
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
    expect(Array.from({ length: 12 }, (_, i) => getLunarMonthName(i + 1))).toEqual(inline)
  })
})
