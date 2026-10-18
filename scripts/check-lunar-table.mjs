#!/usr/bin/env node
/**
 * 逐日对照 lunar-javascript，校验农历年表、往返换算和非法输入。
 * 若市场应用产物存在，同时检查包体预算。
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const require = createRequire(import.meta.url)
const { Solar, Lunar, LunarYear } = require('lunar-javascript')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// 复用现有的 jiti 加载 TS，兼容项目支持的 Node 20.19 / 22.12。
const lunar = await createJiti(import.meta.url)
  .import(join(ROOT, 'market-apps/shared/lunar.ts'))
  .catch((error) => {
    console.error('无法载入 market-apps/shared/lunar.ts：', error.message)
    process.exit(1)
  })

const errors = []
const MS_PER_DAY = 86400000

function check(condition, message) {
  if (!condition) errors.push(message)
  return condition
}

// ── 1. 逐日差分 ────────────────────────────────────────────────────────────────
// 从农历 1900 正月初一走到农历 2100 腊月的最后一天（由权威库告诉我们边界在哪）。
const ANCHOR = Date.UTC(1900, 0, 31) / MS_PER_DAY
let dayCount = 0
let leapDayCount = 0
let lastLunarYear = 0

for (let ordinal = ANCHOR; ; ordinal += 1) {
  const date = new Date(ordinal * MS_PER_DAY)
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()

  const reference = Solar.fromYmd(y, m, d).getLunar()
  const refYear = reference.getYear()
  if (refYear > 2100) break

  lastLunarYear = refYear
  const refMonth = reference.getMonth()
  const expected = {
    year: refYear,
    month: Math.abs(refMonth),
    day: reference.getDay(),
    isLeapMonth: refMonth !== Math.abs(refMonth),
  }

  let actual
  try {
    actual = lunar.solarToLunar(y, m, d)
  } catch (error) {
    if (errors.length < 20) {
      errors.push(
        `solarToLunar(${y},${m},${d}) 抛错：${error.message}（应为 ${JSON.stringify(expected)}）`,
      )
    }
    continue
  }

  dayCount += 1
  if (expected.isLeapMonth) leapDayCount += 1

  if (
    actual.year !== expected.year ||
    actual.month !== expected.month ||
    actual.day !== expected.day ||
    actual.isLeapMonth !== expected.isLeapMonth
  ) {
    if (errors.length < 20) {
      errors.push(
        `solarToLunar(${y},${m},${d}) = ${JSON.stringify(actual)}，权威库给 ${JSON.stringify(expected)}`,
      )
    }
  }
}

// 逐日差分的覆盖量本身也要有下限，否则「循环没跑起来」会伪装成通过
check(dayCount > 73000, `逐日差分只覆盖了 ${dayCount} 天，明显不足（应约 73.4k 天）`)
check(leapDayCount > 2000, `覆盖到的闰月天数只有 ${leapDayCount}，闰月分支未被充分走到`)
check(lastLunarYear === 2100, `逐日差分终点落在农历 ${lastLunarYear} 年，应到 2100 年`)

// 月长以参考库为准，避免错误年表同时决定测试范围与预期值。
let roundTrips = 0
let leapMonthsSeen = 0
let monthLengthChecks = 0
const MAX_MONTH_DAYS = 30

for (let year = 1900; year <= 2100; year += 1) {
  const refLeap = LunarYear.fromYear(year).getLeapMonth()
  for (let month = 1; month <= 12; month += 1) {
    for (const isLeapMonth of refLeap === month ? [false, true] : [false]) {
      if (isLeapMonth) leapMonthsSeen += 1
      const refMonthArg = isLeapMonth ? -month : month

      let refDays = 0
      for (let day = 1; day <= MAX_MONTH_DAYS; day += 1) {
        try {
          Lunar.fromYmd(year, refMonthArg, day)
          refDays = day
        } catch {
          break
        }
      }

      let myDays = null
      try {
        myDays = lunar.getLunarMonthDays(year, month, isLeapMonth)
      } catch (error) {
        if (errors.length < 40) {
          errors.push(`getLunarMonthDays(${year},${month},${isLeapMonth}) 抛错：${error.message}`)
        }
      }
      monthLengthChecks += 1
      if (myDays !== null && myDays !== refDays) {
        if (errors.length < 40) {
          errors.push(
            `农历 ${year} 年${isLeapMonth ? '闰' : ''}${month}月 自研年表给 ${myDays} 天，权威库 ${refDays} 天`,
          )
        }
      }
      if (refDays === 0) continue

      for (let day = 1; day <= refDays; day += 1) {
        const refSolar = Lunar.fromYmd(year, refMonthArg, day).getSolar()
        let solar
        try {
          solar = lunar.lunarToSolar(year, month, day, isLeapMonth)
        } catch (error) {
          if (errors.length < 40)
            errors.push(
              `lunarToSolar(${year},${month},${day},${isLeapMonth}) 抛错：${error.message}`,
            )
          continue
        }
        if (
          solar.year !== refSolar.getYear() ||
          solar.month !== refSolar.getMonth() ||
          solar.day !== refSolar.getDay()
        ) {
          if (errors.length < 40) {
            errors.push(
              `lunarToSolar(${year},${month},${day},${isLeapMonth}) = ${solar.year}-${solar.month}-${solar.day}，` +
                `权威库给 ${refSolar.getYear()}-${refSolar.getMonth()}-${refSolar.getDay()}`,
            )
          }
          continue
        }
        const back = lunar.solarToLunar(solar.year, solar.month, solar.day)
        roundTrips += 1
        if (
          back.year !== year ||
          back.month !== month ||
          back.day !== day ||
          back.isLeapMonth !== isLeapMonth
        ) {
          if (errors.length < 40) {
            errors.push(
              `往返不一致：(${year},${month},${day},闰=${isLeapMonth}) → ${solar.year}-${solar.month}-${solar.day} → ` +
                JSON.stringify({
                  year: back.year,
                  month: back.month,
                  day: back.day,
                  isLeapMonth: back.isLeapMonth,
                }),
            )
          }
        }
      }
    }
  }
}

check(roundTrips > 73000, `往返自洽只跑了 ${roundTrips} 次，覆盖不足`)
check(leapMonthsSeen > 70, `只走到 ${leapMonthsSeen} 个闰月，闰月分支覆盖不足`)
check(monthLengthChecks > 2400, `只核对了 ${monthLengthChecks} 个月长，覆盖不足（应约 2474）`)

// 仅三十可能缺日；搜索窗口限制在本实现支持的年份内。
const LUNAR_MAX_YEAR = 2100
let datedWindow = 0
for (let year = 1900; year <= LUNAR_MAX_YEAR; year += 1) {
  for (let month = 1; month <= 12; month += 1) {
    // 权威库怎么判「某年某月有没有三十」：拿它自己的越界行为试探
    let refFirstYear = null
    for (let probe = year; probe <= Math.min(year + 2, LUNAR_MAX_YEAR); probe += 1) {
      try {
        Lunar.fromYmd(probe, month, 30)
      } catch {
        continue
      }
      refFirstYear = probe
      break
    }

    const actual = lunar.findLunarDate(year, month, 30)
    datedWindow += 1

    if (refFirstYear === null) {
      if (actual !== null) {
        errors.push(
          `findLunarDate(${year},${month},30) 给出 ${actual.year}-${actual.month}-${actual.day}，` +
            `但权威库说 ${year}~${Math.min(year + 2, LUNAR_MAX_YEAR)} 年都没有三十`,
        )
      }
      continue
    }

    if (actual === null) {
      errors.push(
        `findLunarDate(${year},${month},30) 返回 null，但权威库认为 ${refFirstYear} 年有三十`,
      )
      continue
    }
    const refSolar = Lunar.fromYmd(refFirstYear, month, 30).getSolar()
    if (
      actual.year !== refSolar.getYear() ||
      actual.month !== refSolar.getMonth() ||
      actual.day !== refSolar.getDay()
    ) {
      errors.push(
        `findLunarDate(${year},${month},30) = ${actual.year}-${actual.month}-${actual.day}，` +
          `权威库给 ${refSolar.getYear()}-${refSolar.getMonth()}-${refSolar.getDay()}`,
      )
    }
  }
}
check(datedWindow > 2400, `只核对了 ${datedWindow} 个 (年,月) 的三十落点，覆盖不足`)

// 越界输入必须抛错（与 lunar-javascript 一致，市场应用的 try/catch 依赖这个行为）
const invalidLunarDates = [
  { args: [2026, 2, 30, false], why: '2026 年二月只有 29 天' },
  { args: [2026, 2, 31, false], why: '日期越界' },
  { args: [2026, 6, 1, true], why: '2026 年没有闰六月' },
  { args: [2026, 13, 1, false], why: '没有第 13 个月' },
]
for (const item of invalidLunarDates) {
  let threw = false
  try {
    lunar.lunarToSolar(...item.args)
  } catch {
    threw = true
  }
  if (!threw) errors.push(`lunarToSolar(${item.args.join(',')}) 应当抛错（${item.why}）但有返回值`)
}

// 合法输入不该抛错：2025 年确有闰六月
let legalThrew = ''
try {
  lunar.lunarToSolar(2025, 6, 1, true)
} catch (error) {
  legalThrew = error.message
}
if (legalThrew) errors.push(`lunarToSolar(2025,6,1,true) 是合法日期却抛错：${legalThrew}`)

// 与权威库行为对齐：同一个越界日期，权威库也抛
let refThrew = false
try {
  Lunar.fromYmd(2026, 2, 30)
} catch {
  refThrew = true
}
if (!refThrew)
  errors.push('lunar-javascript 对 2026 年二月三十不再抛错，说明本闸门的前提变了，需要重新核对')

// 公历侧越界：起点早于锚点必须抛；终点要**从数据推出来**——
// 农历 2100 年腊月会延伸到 2101 年 1 月，硬编码 2101-01-01 是错的。
for (const args of [
  [1899, 12, 31],
  [1900, 1, 30],
]) {
  let threw = false
  try {
    lunar.solarToLunar(...args)
  } catch {
    threw = true
  }
  if (!threw) errors.push(`solarToLunar(${args.join(',')}) 早于农历 1900 正月初一，应当抛错`)
}

const lastLunarDay = lunar.getLunarMonthDays(2100, 12, false)
const lastSolar = lunar.lunarToSolar(2100, 12, lastLunarDay)
const lastOrdinal = Date.UTC(lastSolar.year, lastSolar.month - 1, lastSolar.day) / MS_PER_DAY
const afterEnd = new Date((lastOrdinal + 1) * MS_PER_DAY)
for (const args of [
  [lastSolar.year, lastSolar.month, lastSolar.day],
  [afterEnd.getUTCFullYear(), afterEnd.getUTCMonth() + 1, afterEnd.getUTCDate()],
]) {
  const isLast =
    args[0] === lastSolar.year && args[1] === lastSolar.month && args[2] === lastSolar.day
  let threw = false
  try {
    lunar.solarToLunar(...args)
  } catch {
    threw = true
  }
  if (isLast && threw) errors.push(`支持范围最后一天 solarToLunar(${args.join(',')}) 不该抛错`)
  if (!isLast && !threw) errors.push(`支持范围之后 solarToLunar(${args.join(',')}) 应当抛错`)
}

// ── 3. 产物预算 ───────────────────────────────────────────────────────────────
const ARTIFACT = join(ROOT, 'dist/market-apps/special-days-app.js')
const ARTIFACT_GZIP_BUDGET = 25 * 1024
/** 只有被摇掉的那部分 lunar-javascript 才会出现的符号：产物里出现即说明整库又回来了。 */
const LUNAR_ONLY_MARKERS = ['getEightChar', 'getPengZuGan', 'getMingGong', 'getShuJiu', 'getXiu']
let artifactNote = '（未找到产物，跳过；先跑 npm run build:market）'

if (existsSync(ARTIFACT)) {
  const content = readFileSync(ARTIFACT)
  const gzip = gzipSync(content).length
  const text = content.toString('utf8')
  const leaked = LUNAR_ONLY_MARKERS.filter((marker) => text.includes(marker))
  artifactNote = `${(content.length / 1024).toFixed(1)} KB raw / ${(gzip / 1024).toFixed(1)} KB gzip`
  if (gzip > ARTIFACT_GZIP_BUDGET) {
    errors.push(
      `special-days 产物 ${(gzip / 1024).toFixed(1)} KB gzip > 预算 ${ARTIFACT_GZIP_BUDGET / 1024} KB` +
        '（很可能又引入了完整 lunar-javascript）',
    )
  }
  if (leaked.length) {
    errors.push(
      `special-days 产物里出现了 lunar-javascript 独有能力 ${leaked.join(', ')}，说明整库被重新打进来了`,
    )
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────────────────
console.log('农历年表闸门：')
console.log(`- 逐日差分：${dayCount} 天与 lunar-javascript 逐日一致（其中闰月 ${leapDayCount} 天）`)
console.log(`- 月长核对：${monthLengthChecks} 个月（12/13 月 × 201 年）与权威库一致`)
console.log(`- 往返自洽：${roundTrips} 次（覆盖 ${leapMonthsSeen} 个闰月）`)
console.log(`- 三十落点：${datedWindow} 个 (年,月) 的 findLunarDate 与权威库一致`)
console.log(`- 越界行为：${invalidLunarDates.length} 条非法输入与权威库对齐`)
console.log(`- special-days 产物：${artifactNote}`)

if (errors.length) {
  console.error('\n✘ 农历年表闸门失败：')
  for (const message of errors.slice(0, 25)) console.error('  · ' + message)
  if (errors.length > 25) console.error(`  … 另有 ${errors.length - 25} 条`)
  process.exitCode = 1
} else {
  console.log('\n✅ 农历年表与权威库逐日等价，产物在预算内。')
}
