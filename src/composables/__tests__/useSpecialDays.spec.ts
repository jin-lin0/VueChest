import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 存储层依赖 IndexedDB，node 测试环境不可用，替换为可控的内存桩。
const storageMock = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/lib/storage', () => ({
  getStorage: <T>(_key: string, defaultValue?: T) =>
    storageMock.value === null ? (defaultValue ?? null) : storageMock.value,
}))

import {
  getDaysUntil,
  getDisplayDate,
  getNextOccurrenceDate,
  loadSpecialDays,
  useSpecialDays,
  type SpecialDay,
} from '@/composables/useSpecialDays'

/** 构造纪念日，只需给出与用例相关的字段 */
function makeDay(overrides: Partial<SpecialDay> = {}): SpecialDay {
  return {
    id: 1,
    name: '测试',
    repeatType: 'yearly',
    calendarType: 'solar',
    solarYear: null,
    solarMonth: 1,
    solarDay: 1,
    lunarMonth: 1,
    lunarDay: 1,
    emoji: '🎉',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// 所有「距今多少天」的断言都依赖当前日期，固定到 2026-07-28（农历六月十五）
const TODAY = new Date(2026, 6, 28, 10, 30)

describe('useSpecialDays', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    storageMock.value = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getDaysUntil - 阳历', () => {
    it('返回距今天数', () => {
      expect(getDaysUntil(makeDay({ solarMonth: 12, solarDay: 25 }))).toBe(150)
    })

    it('当天返回 0，不跳到明年', () => {
      expect(getDaysUntil(makeDay({ solarMonth: 7, solarDay: 28 }))).toBe(0)
    })

    it('日期已过则顺延到明年', () => {
      expect(getDaysUntil(makeDay({ solarMonth: 1, solarDay: 1 }))).toBe(157)
    })

    it('忽略当天的时分秒（按日切算，不受调用时刻影响）', () => {
      vi.setSystemTime(new Date(2026, 6, 28, 23, 59, 59))
      expect(getDaysUntil(makeDay({ solarMonth: 7, solarDay: 29 }))).toBe(1)
    })
  })

  describe('getDaysUntil - 农历', () => {
    it('返回农历日期对应的距今天数', () => {
      // 农历 2026-08-15 → 阳历 2026-09-25
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 8, lunarDay: 15 }))).toBe(59)
    })

    it('农历日期已过则顺延到下一个农历年', () => {
      // 2026 正月初一（阳历 2026-02-17）已过 → 2027 正月初一（阳历 2027-02-06）
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 1, lunarDay: 1 }))).toBe(193)
    })

    it('农历当天返回 0，不跳到下一年', () => {
      // 基准日 2026-07-28 即农历六月十五
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 6, lunarDay: 15 }))).toBe(0)
    })

    it('农历小月无三十时跳过该年，取下一个存在的年份', () => {
      // 2026 九月有三十（阳历 11-08）；2027/2028 九月只有廿九
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 9, lunarDay: 30 }))).toBe(
        103,
      )
    })

    it('当年不存在该农历日期时，跨到下一年（二月三十：2026 无、2027 有）', () => {
      // 必须真正执行 catch → continue 才能得到 2027-04-06
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 2, lunarDay: 30 }))).toBe(
        252,
      )
    })

    it('连续两年都不存在时继续往后找（五月三十：2026/2027 无、2028 有）', () => {
      // 需要连续 continue 两次，能捕获把 continue 误写成 break 的退化
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 5, lunarDay: 30 }))).toBe(
        695,
      )
    })

    it('未来 3 个农历年内都不存在该日期时返回 -1', () => {
      vi.setSystemTime(new Date(2027, 0, 1))
      // 2027/2028/2029 九月均无三十
      expect(getDaysUntil(makeDay({ calendarType: 'lunar', lunarMonth: 9, lunarDay: 30 }))).toBe(-1)
    })
  })

  describe('getDisplayDate', () => {
    it('阳历带「阳历」前缀', () => {
      expect(getDisplayDate(makeDay({ solarMonth: 12, solarDay: 25 }))).toBe('阳历12月25日')
    })

    it('农历转为中文月日', () => {
      expect(getDisplayDate(makeDay({ calendarType: 'lunar', lunarMonth: 8, lunarDay: 15 }))).toBe(
        '农历八月十五',
      )
    })

    it('农历十一/十二月使用冬月/腊月', () => {
      expect(getDisplayDate(makeDay({ calendarType: 'lunar', lunarMonth: 11, lunarDay: 1 }))).toBe(
        '农历冬月初一',
      )
      expect(getDisplayDate(makeDay({ calendarType: 'lunar', lunarMonth: 12, lunarDay: 30 }))).toBe(
        '农历腊月三十',
      )
    })

    it('农历廿字辈日名', () => {
      expect(getDisplayDate(makeDay({ calendarType: 'lunar', lunarMonth: 3, lunarDay: 21 }))).toBe(
        '农历三月廿一',
      )
    })
  })

  describe('getNextOccurrenceDate', () => {
    it('给出下次发生的阳历月日', () => {
      expect(getNextOccurrenceDate(makeDay({ solarMonth: 12, solarDay: 25 }))).toBe('12月25日')
    })

    it('农历换算为对应阳历月日', () => {
      expect(
        getNextOccurrenceDate(makeDay({ calendarType: 'lunar', lunarMonth: 8, lunarDay: 15 })),
      ).toBe('9月25日')
    })

    it('无有效日期时返回空串', () => {
      vi.setSystemTime(new Date(2027, 0, 1))
      expect(
        getNextOccurrenceDate(makeDay({ calendarType: 'lunar', lunarMonth: 9, lunarDay: 30 })),
      ).toBe('')
    })
  })

  describe('loadSpecialDays', () => {
    it('无数据时返回空数组', () => {
      expect(loadSpecialDays()).toEqual([])
    })

    it('读取已存储的列表', () => {
      const days = [makeDay({ id: 7 })]
      storageMock.value = days
      expect(loadSpecialDays()).toEqual(days)
    })
  })

  describe('nearestSpecialDay', () => {
    it('无数据时为 null', () => {
      expect(useSpecialDays().nearestSpecialDay.value).toBeNull()
    })

    it('取距今最近的一个', () => {
      storageMock.value = [
        makeDay({ id: 1, name: '远', solarMonth: 12, solarDay: 25 }), // 150 天
        makeDay({ id: 2, name: '近', solarMonth: 8, solarDay: 1 }), // 4 天
        makeDay({ id: 3, name: '中', solarMonth: 10, solarDay: 1 }), // 65 天
      ]
      const nearest = useSpecialDays().nearestSpecialDay.value
      expect(nearest?.name).toBe('近')
      expect(nearest?.daysUntil).toBe(4)
    })

    it('附带展示字段', () => {
      storageMock.value = [makeDay({ name: '圣诞', solarMonth: 12, solarDay: 25 })]
      expect(useSpecialDays().nearestSpecialDay.value).toMatchObject({
        name: '圣诞',
        daysUntil: 150,
        dateLabel: '阳历12月25日',
        nextDate: '12月25日',
      })
    })

    it('当天的纪念日优先于未来的', () => {
      storageMock.value = [
        makeDay({ id: 1, name: '明天', solarMonth: 7, solarDay: 29 }),
        makeDay({ id: 2, name: '今天', solarMonth: 7, solarDay: 28 }),
      ]
      const nearest = useSpecialDays().nearestSpecialDay.value
      expect(nearest?.name).toBe('今天')
      expect(nearest?.daysUntil).toBe(0)
    })

    it('跳过无有效日期（-1）的条目', () => {
      vi.setSystemTime(new Date(2027, 0, 1))
      storageMock.value = [
        makeDay({ id: 1, name: '无效', calendarType: 'lunar', lunarMonth: 9, lunarDay: 30 }),
        makeDay({ id: 2, name: '有效', solarMonth: 3, solarDay: 1 }),
      ]
      expect(useSpecialDays().nearestSpecialDay.value?.name).toBe('有效')
    })
  })
})
