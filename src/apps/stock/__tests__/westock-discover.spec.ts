import { describe, expect, it } from 'vitest'
import {
  CATALOG_SPECS,
  FILTER_PRESET_LABELS,
  findItemName,
  flattenOptions,
  groupCatalog,
  hasMorePages,
  isRangeValid,
  parseCatalog,
  parseResultPage,
  pickRowCode,
  pickRowName,
  SECTION_DATE_CAPABILITY,
  sectionSupportsDate,
  sectionSupportsRange,
} from '../westock-discover'

// 以下片段按 westock CLI 的真实输出原样截取（含缩进）。
// 缩进是契约的一部分：条目两空格 / ranking 条目四空格 / ranking 分组行也带两空格缩进。
const STRATEGY_TEXT = [
  '',
  '# 基本面策略',
  '  big_cap  行业高增长',
  '  pb_roe  高盈利价值',
  '',
  '# 大师策略',
  '  buffet  价值龙头',
  '  trinity  三一投资型风格选股法',
].join('\n')

const RANKING_TEXT = [
  '',
  '📊 可用排行指标：',
  '',
  '  【涨跌停】',
  '    limitup_days             连续涨停天数',
  '    limitdn_days             连续跌停天数',
  '',
  '  【评分】',
  '    CompScore                综合评分',
  '    TecScore                 技术评分',
].join('\n')

const LABEL_TEXT = ['', '# 股东属性', '  shareholder_central_state  央企公司', '  shareholder_private  民企公司'].join('\n')

const FILTER_TEXT = ['可用的预设选股函数:', '  LowPE', '  HighDividend', '  SomethingNewFromUpstream'].join('\n')

describe('parseCatalog', () => {
  it('按 # 分组解析 strategy，两空格缩进为条目', () => {
    const items = parseCatalog(STRATEGY_TEXT, 'strategy')
    expect(items).toHaveLength(4)
    expect(items[0]).toEqual({ group: '基本面策略', id: 'big_cap', name: '行业高增长' })
    expect(items[2].group).toBe('大师策略')
  })

  // 回归用例：原正则 /^【(.+?)】/ 要求分组行位于行首，而 CLI 输出是缩进的，
  // 导致 8 个分组标题全部匹配失败、30 个指标挤进一个空 optgroup。
  it('ranking 分组行带缩进时也能正确分组（回归）', () => {
    const groups = groupCatalog(parseCatalog(RANKING_TEXT, 'ranking'))
    expect(groups.map((g) => g.group)).toEqual(['涨跌停', '评分'])
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items[0].id).toBe('limitup_days')
    // 不能出现空分组
    expect(groups.every((g) => g.group && g.group !== '其他')).toBe(true)
  })

  it('label 按 # 分组解析', () => {
    const items = parseCatalog(LABEL_TEXT, 'label')
    expect(items).toHaveLength(2)
    expect(items[0].group).toBe('股东属性')
  })

  it('filter 解析纯缩进条目，并补上中文释义', () => {
    const items = parseCatalog(FILTER_TEXT, 'filter')
    expect(items.map((i) => i.id)).toEqual(['LowPE', 'HighDividend', 'SomethingNewFromUpstream'])
    expect(items[0].name).toBe(FILTER_PRESET_LABELS.LowPE)
    expect(items[0].name).not.toBe('LowPE')
    // 上游新增但本地未登记的预设要退回原 id，不能变成空名（映射缺失只影响观感，不能影响可选）
    expect(items[2].name).toBe('SomethingNewFromUpstream')
  })

  it('容忍 tab 缩进', () => {
    const items = parseCatalog(['# 组', '\tbig_cap\t行业高增长'].join('\n'), 'strategy')
    expect(items).toEqual([{ group: '组', id: 'big_cap', name: '行业高增长' }])
  })
})

describe('groupCatalog / flattenOptions / findItemName', () => {
  it('无分组的条目归入「其他」', () => {
    const groups = groupCatalog(parseCatalog(FILTER_TEXT, 'filter'))
    expect(groups).toHaveLength(1)
    expect(groups[0].group).toBe('其他')
  })

  it('拍平后的 label 同时含分组名与条目名，且去重', () => {
    const groups = groupCatalog(parseCatalog(STRATEGY_TEXT, 'strategy'))
    const options = flattenOptions(groups)
    expect(options[0]).toEqual({ value: 'big_cap', label: '基本面策略 · 行业高增长' })
    const deduped = flattenOptions([
      { group: 'A', items: [{ group: 'A', id: 'x', name: 'X' }] },
      { group: 'B', items: [{ group: 'B', id: 'x', name: 'X' }] },
    ])
    expect(deduped).toHaveLength(1)
  })

  it('findItemName 找不到时退回 id', () => {
    const groups = groupCatalog(parseCatalog(STRATEGY_TEXT, 'strategy'))
    expect(findItemName(groups, 'buffet')).toBe('价值龙头')
    expect(findItemName(groups, 'not_exist')).toBe('not_exist')
  })
})

describe('CATALOG_SPECS', () => {
  it('五个目录都与 CLI 白名单一致，且不包含 search（搜索无需目录）', () => {
    expect(CATALOG_SPECS.map((s) => s.key)).toEqual(['strategy', 'ranking', 'label', 'event', 'filter'])
    for (const spec of CATALOG_SPECS) {
      expect(spec.args[0]).toBe(spec.mode)
      // 这些 flag 必须都在 client.js 的 KNOWN_FLAGS 内，否则请求会被 400 拒掉
      expect(spec.args[1]).toMatch(/^--list/)
    }
    expect(CATALOG_SPECS.find((s) => s.mode === 'filter')!.args[1]).toBe('--list-presets')
  })
})

describe('pickRowCode', () => {
  // 各命令表头不统一（code / 代码），只能靠值形态识别，不能写死列名
  it('识别带交易所前缀的代码（strategy/label 的 code 列）', () => {
    expect(pickRowCode({ code: 'sh600178', name: '东安动力' })).toBe('600178')
    expect(pickRowCode({ code: 'sz300024', name: '机器人' })).toBe('300024')
  })

  it('识别中文「代码」列（ranking 表头）', () => {
    expect(pickRowCode({ '#': '1', 代码: 'sh688578', 名称: '艾力斯' })).toBe('688578')
  })

  it('识别裸 6 位数字', () => {
    expect(pickRowCode({ code: '600519' })).toBe('600519')
  })

  it('认不出代码时返回 null（该行不可点，而不是跳到错误的股票）', () => {
    expect(pickRowCode({ name: '某某股', PE_TTM: '12.3' })).toBeNull()
    expect(pickRowCode({ code: 'sh6001781' })).toBeNull()
    expect(pickRowCode({})).toBeNull()
  })

  it('不会把数值列误认成代码', () => {
    // 6 位纯数字确实会被认走，这是形态识别的固有代价；
    // 但排名列通常是 1~5000，不会命中 6 位，所以实际风险很低。
    expect(pickRowCode({ '#': '12', 代码: 'sh600066', 名称: '宇通客车' })).toBe('600066')
  })
})

describe('parseResultPage / hasMorePages', () => {  it('解析 strategy 的 meta（实测格式）', () => {
    const page = parseResultPage('MACD金叉 (2026-10-02) - 共 187 只 | 显示 1-20/187', 20)
    expect(page).toEqual({ total: 187, from: 1, to: 20 })
    expect(hasMorePages(page)).toBe(true)
  })

  it('末页时 hasMorePages 为 false', () => {
    const page = parseResultPage('MACD金叉 (2026-10-02) - 共 187 只 | 显示 181-187/187', 7)
    expect(hasMorePages(page)).toBe(false)
  })

  it('filter 无标题行时只给已加载数，且不再尝试翻页', () => {
    // filter 的输出没有 **标题** 行，meta 为空
    const page = parseResultPage('', 5)
    expect(page).toEqual({ total: null, from: 1, to: 5 })
    expect(hasMorePages(page)).toBe(false)
  })

  it('meta 异常时退回保守值，不抛错', () => {
    const page = parseResultPage('随便一段没有分页信息的文本', 12)
    expect(page).toEqual({ total: null, from: 1, to: 12 })
  })
})

describe('pickRowName', () => {
  it('取出中文股票名（加自选时要显示名字）', () => {
    expect(pickRowName({ code: 'sh600178', name: '东安动力' }, '600178')).toBe('东安动力')
  })

  it('ranking 表头是「名称」，同样能取到', () => {
    expect(pickRowName({ '#': '1', 代码: 'sh688578', 名称: '艾力斯' }, '688578')).toBe('艾力斯')
  })

  it('跳过代码列与纯数字列，不把它们当名字', () => {
    expect(pickRowName({ code: 'sh600066', PE_TTM: '12.34', 名称: '宇通客车' }, '600066')).toBe('宇通客车')
  })

  it('没有可识别名称时返回空串，由调用方用代码兜底', () => {
    expect(pickRowName({ code: 'sh600066', PE_TTM: '12.34' }, '600066')).toBe('')
  })

  // strategy 走 --start/--end 时，服务端会把各交易日的表合并并加 signalDate 列。
  // 提取逻辑不能因为多出来的日期列而认错代码/名称（也不能依赖列的先后顺序）。
  it('含 signalDate 的多日行仍能正确提取，且与列顺序无关', () => {
    const row = { code: 'sh600178', name: '东安动力', signalDate: '2026-09-24' }
    expect(pickRowCode(row)).toBe('600178')
    expect(pickRowName(row, '600178')).toBe('东安动力')
    // signalDate 排在最前时结果不变
    const reordered = { signalDate: '2026-09-24', code: 'sh600178', name: '东安动力' }
    expect(pickRowCode(reordered)).toBe('600178')
    expect(pickRowName(reordered, '600178')).toBe('东安动力')
  })

  it('signalDate 不会被误当成股票名称', () => {
    expect(pickRowName({ code: 'sh600178', signalDate: '2026-09-24' }, '600178')).toBe('')
  })
})

describe('日期能力与区间校验', () => {
  // 能力表来自逐命令实测。真跑一遍的结果：
  //   strategy/label → 接受 --start/--end
  //   filter/ranking → 拒绝 --start/--end，但接受单日 --date
  //   event         → 连 --date 都拒绝（只吃 --limit/--offset）
  it('只有 strategy / label 支持区间', () => {
    expect(sectionSupportsRange('strategy')).toBe(true)
    expect(sectionSupportsRange('label')).toBe(true)
    expect(sectionSupportsRange('filter')).toBe(false)
    expect(sectionSupportsRange('ranking')).toBe(false)
    expect(sectionSupportsRange('event')).toBe(false)
    expect(sectionSupportsRange('search')).toBe(false)
  })

  it('event 完全不支持日期，不能按单日处理', () => {
    // 曾经误标为 'single'，会导致用户选日期后拿到 CLI 的「不支持此参数」报错
    expect(sectionSupportsDate('event')).toBe(false)
    expect(SECTION_DATE_CAPABILITY.event).toBe('none')
  })

  it('filter / ranking 支持单日，search 不支持任何日期', () => {
    expect(sectionSupportsDate('filter')).toBe(true)
    expect(sectionSupportsDate('ranking')).toBe(true)
    expect(sectionSupportsDate('search')).toBe(false)
  })

  it('区间必须两端都填且首尾不颠倒', () => {
    expect(isRangeValid('2026-09-20', '2026-10-01')).toBe(true)
    expect(isRangeValid('2026-09-20', '2026-09-20')).toBe(true)
    // 只填一端视为无效，避免发出必然无解的请求
    expect(isRangeValid('2026-09-20', '')).toBe(false)
    expect(isRangeValid('', '2026-10-01')).toBe(false)
    expect(isRangeValid('', '')).toBe(false)
    // 结束早于开始
    expect(isRangeValid('2026-10-01', '2026-09-20')).toBe(false)
  })
})
