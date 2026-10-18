#!/usr/bin/env node
/**
 * 从 lunar-javascript 逐月推算年表，只打印结果，不修改文件。
 * 默认输出 TypeScript 表格片段；--verify 仅执行自校验。
 * 编码为 leap * 8192 + mask，mask 按月份时间顺序记录 29/30 天，闰月紧随本月。
 */

import { createRequire } from 'node:module'

// lunar-javascript 是 CJS 单文件包，从本脚本位置解析即可命中仓库根的 node_modules
const require = createRequire(import.meta.url)
const { Lunar, LunarYear } = require('lunar-javascript')

const MIN_YEAR = 1900
const MAX_YEAR = 2100

/** 以 1970-01-01 为 0 的「日序号」，用 UTC 保证与本地时区无关。 */
function solarOrdinal(solar) {
  return Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay()) / 86400000
}

/** 农历 `year` 年正月初一对应的日序号。 */
function lunarYearFirstDaySolar(year) {
  return solarOrdinal(Lunar.fromYmd(year, 1, 1).getSolar())
}

function build() {
  const rows = []
  for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
    const leap = LunarYear.fromYear(year).getLeapMonth()
    const order = []
    for (let m = 1; m <= 12; m += 1) {
      order.push({ month: m, isLeap: false })
      if (m === leap) order.push({ month: m, isLeap: true })
    }
    const starts = order.map((entry) =>
      solarOrdinal(Lunar.fromYmd(year, entry.isLeap ? -entry.month : entry.month, 1).getSolar()),
    )
    // 下一年正月初一，用来定最后一个月长度；2100 年需要 2101 的正月初一
    starts.push(lunarYearFirstDaySolar(year + 1))

    let mask = 0
    const lengths = []
    for (let i = 0; i < order.length; i += 1) {
      const days = starts[i + 1] - starts[i]
      lengths.push(days)
      if (days === 30) mask |= 1 << i
    }
    if (order.length !== 12 && order.length !== 13) {
      throw new Error(`${year} 年月数异常：${order.length}`)
    }
    if (lengths.some((d) => d !== 29 && d !== 30)) {
      throw new Error(`${year} 年出现非 29/30 的月长：${lengths.join(',')}`)
    }
    rows.push({ year, leap, mask, lengths, total: lengths.reduce((a, b) => a + b, 0) })
  }
  return rows
}

function selfCheck(rows) {
  // 年长只能是 353~355（平年）或 383~385（闰年），这是农历的硬约束
  for (const row of rows) {
    const leapYear = row.leap !== 0
    const ok = leapYear
      ? row.total >= 383 && row.total <= 385
      : row.total >= 353 && row.total <= 355
    if (!ok) throw new Error(`${row.year} 年长 ${row.total} 不合法（闰月=${row.leap}）`)
  }
  // 相邻农历年的正月初一日序号必须严格递增，且间隔等于上一年的年长
  for (let i = 1; i < rows.length; i += 1) {
    const gap = lunarYearFirstDaySolar(rows[i].year) - lunarYearFirstDaySolar(rows[i - 1].year)
    if (gap !== rows[i - 1].total) {
      throw new Error(`${rows[i - 1].year} 年长 ${rows[i - 1].total} 与正月初一间隔 ${gap} 不一致`)
    }
  }
  return rows.length
}

const rows = build()
const count = selfCheck(rows)

if (!process.argv.includes('--verify')) {
  const values = rows.map((row) => row.leap * 8192 + row.mask)
  const lines = []
  for (let i = 0; i < values.length; i += 10) {
    lines.push('  ' + values.slice(i, i + 10).join(', ') + ',')
  }
  console.log(`// ${MIN_YEAR}-${MAX_YEAR}，共 ${count} 项；leap * 8192 + mask`)
  console.log(`const LUNAR_YEAR_INFO: number[] = [`)
  console.log(lines.join('\n'))
  console.log(`]`)
}

console.error(
  `自校验通过：${MIN_YEAR}-${MAX_YEAR} 共 ${count} 个农历年；` +
    `闰年 ${rows.filter((r) => r.leap).length} 个；正月初一连续性一致。`,
)
