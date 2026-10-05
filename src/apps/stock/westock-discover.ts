// 「选股发现」目录解析：把 westock CLI 的 --list 文本转成分组结构。
//
// 为什么要独立成模块：这份输出格式是 CLI 的隐式契约（没有 schema、没有 --json），
// 格式一变这里就得改。此前解析逻辑内联在面板里，正则写错（ranking 分组行有缩进，
// 正则却要求行首匹配）会静默退化成「所有条目落进一个空分组」——测试期无正式用户，
// 与其上线后靠肉眼发现分组消失，不如把契约固化成用例。

export type DiscoverSection = 'strategy' | 'ranking' | 'filter' | 'label' | 'event' | 'search'

export interface CatalogItem {
  group: string
  id: string
  name: string
}

export interface CatalogGroup {
  group: string
  items: CatalogItem[]
}

export const DISCOVER_SECTIONS: Array<{ id: DiscoverSection; label: string; hint: string }> = [
  { id: 'strategy', label: '策略选股', hint: '按大师与形态策略一次性筛出候选池' },
  { id: 'ranking', label: '排行榜', hint: '跨全市场按单一指标横向排序' },
  { id: 'filter', label: '条件筛选', hint: '低估值、高股息等成体系的预设条件' },
  { id: 'label', label: '标签选股', hint: '股东属性、财务特征等单维度标签' },
  { id: 'event', label: '事件驱动', hint: '解禁、回购、业绩披露等事件窗口' },
  { id: 'search', label: '关键词搜索', hint: '按名称或代码直接定位一只股票' },
]

/** 每个 section 对应哪个 CLI 子命令，以及 --list 的调用方式。 */
export const CATALOG_SPECS: Array<{ key: string; mode: 'strategy' | 'ranking' | 'label' | 'event' | 'filter'; args: string[] }> = [
  { key: 'strategy', mode: 'strategy', args: ['strategy', '--list'] },
  { key: 'ranking', mode: 'ranking', args: ['ranking', '--list'] },
  { key: 'label', mode: 'label', args: ['label', '--list'] },
  { key: 'event', mode: 'event', args: ['event', '--list'] },
  { key: 'filter', mode: 'filter', args: ['filter', '--list-presets'] },
]

/**
 * filter --list-presets 只给英文 id，没有中文释义。
 * 这层映射是纯展示用的，id 原样透传给 CLI，所以映射缺失不影响功能，只是名字难看。
 */
export const FILTER_PRESET_LABELS: Record<string, string> = {
  LowPE: '低市盈率',
  LowPB: '低市净率',
  HighDividend: '高股息',
  ValuationPercentile: '估值处于历史低位',
  PEG: 'PEG 合理（成长与估值匹配）',
  KDJOversold: 'KDJ 超卖',
  RSIOversold: 'RSI 超卖',
  NineTurnGreen9: '九转序列绿 9（抄底信号）',
  HighRating: '机构评级高',
  TargetPriceUpside: '距目标价有空间',
  HighROE: '高 ROE',
  HighGrowth: '高成长',
  LowDebt: '低负债',
  PositiveCashFlow: '经营现金流为正',
  MainInflow: '主力资金流入',
  SustainedInflow: '资金持续流入',
  HighShortRatio: '卖空比例高',
  HighDividendLowValuation: '高股息 + 低估值',
  WhiteHorseGrowth: '白马成长股',
  Turnaround: '扭亏为盈',
  SmallCapValue: '小盘价值',
  TechFundamentalCombo: '技术面 + 基本面共振',
}

/**
 * 面板首屏直接铺开的热门项，省掉用户翻下拉框。
 * 选取标准：覆盖面广、含义直白、无需理解指标口径。
 */
export const HOT_ITEMS: Record<Exclude<DiscoverSection, 'search'>, CatalogItem[]> = {
  strategy: [
    { group: '热门策略', id: 'macd_golden', name: 'MACD 金叉' },
    { group: '热门策略', id: 'over_drop_rebound', name: '超跌反弹' },
    { group: '热门策略', id: 'ma_long', name: '均线多头发散' },
    { group: '热门策略', id: 'major_force', name: '主力抢筹' },
    { group: '热门策略', id: 'buffet', name: '价值龙头（巴菲特）' },
    { group: '热门策略', id: 'profit_preannounce', name: '业绩预增' },
  ],
  ranking: [
    { group: '热门指标', id: 'CompScore', name: '综合评分' },
    { group: '热门指标', id: 'TecScore', name: '技术评分' },
    { group: '热门指标', id: 'FunmScore', name: '基本面评分' },
    { group: '热门指标', id: 'cap_main_net', name: '主力净流入' },
  ],
  filter: [
    { group: '热门条件', id: 'LowPE', name: FILTER_PRESET_LABELS.LowPE },
    { group: '热门条件', id: 'HighDividend', name: FILTER_PRESET_LABELS.HighDividend },
    { group: '热门条件', id: 'HighROE', name: FILTER_PRESET_LABELS.HighROE },
    { group: '热门条件', id: 'MainInflow', name: FILTER_PRESET_LABELS.MainInflow },
  ],
  label: [
    { group: '热门标签', id: 'shareholder_central_state', name: '央企公司' },
    { group: '热门标签', id: 'fin_high_roettm', name: '高 ROEttm' },
    { group: '热门标签', id: 'risk_st', name: 'ST 与 *ST 股' },
    { group: '热门标签', id: 'price_below1', name: '1 元股' },
  ],
  event: [
    { group: '热门事件', id: 'shareunlock_next_90', name: '预计解禁三月内' },
    { group: '热门事件', id: 'buyback', name: '回购一月内' },
    { group: '热门事件', id: 'earnings_forecast', name: '业绩预告后一月' },
    { group: '热门事件', id: 'dividend_plan', name: '分红预案公告后一月' },
  ],
}

/**
 * 解析 CLI 的 --list 文本。
 *
 * 实测三种缩进/分组格式（务必保持一致，这些正则就是与 CLI 的契约）：
 *   strategy/label/event —— 「# 分组名」+ 两空格缩进条目
 *   ranking              —— 「  【分组名】」（两空格缩进）+ 四空格缩进条目
 *   filter               —— 纯两空格缩进条目，无分组
 */
export function parseCatalog(text: string, mode: 'strategy' | 'label' | 'event' | 'ranking' | 'filter'): CatalogItem[] {
  const items: CatalogItem[] = []
  let group = ''
  for (const raw of text.split('\n')) {
    // tab 视作两空格：CLI 实际只输出空格，但换行符被 replace 成单空格会让
    // 「两空格缩进」判定少一格，条目直接被吞掉。
    const line = raw.replace(/\t/g, '  ').trimEnd()
    if (mode === 'filter') {
      const m = line.match(/^\s{2}([A-Za-z]\w*)\s*$/)
      if (m) items.push({ group: '', id: m[1], name: FILTER_PRESET_LABELS[m[1]] ?? m[1] })
      continue
    }
    if (line.startsWith('# ')) {
      group = line.slice(2).trim()
      continue
    }
    if (mode === 'ranking') {
      // 注意此处允许前导空白：CLI 的分组行是缩进过的，要求行首会匹配失败，
      // 导致所有条目挤进一个空分组。
      const mg = line.match(/^\s*【(.+?)】/)
      if (mg) {
        group = mg[1]
        continue
      }
      const m = line.match(/^\s{4}(\S+)\s+(.+?)\s*$/)
      if (m) items.push({ group, id: m[1], name: m[2] })
      continue
    }
    const m = line.match(/^\s{2}(\S+)\s+(.+?)\s*$/)
    if (m) items.push({ group, id: m[1], name: m[2] })
  }
  return items
}

/** 按 group 聚合并保持首次出现顺序。空 group 统一归到「其他」。 */
export function groupCatalog(items: CatalogItem[]): CatalogGroup[] {
  const map = new Map<string, CatalogItem[]>()
  for (const it of items) {
    const key = it.group || '其他'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  return [...map.entries()].map(([group, list]) => ({ group, items: list }))
}

/**
 * 把分组结构拍平成可搜索的下拉选项。
 * label 带上「分组 · 名称」，这样 CustomSelect 的搜索能同时命中分组名和条目名
 * （例如搜「技术面」能带出该组全部指标）。
 */
export function flattenOptions(groups: CatalogGroup[]): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const g of groups) {
    for (const it of g.items) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      out.push({ value: it.id, label: g.group ? `${g.group} · ${it.name}` : it.name })
    }
  }
  return out
}

/**
 * 首屏快捷区 / 空态引导 / 命令面板共用的选股入口。
 * 三处共用一份定义，避免 id 在多个地方各写一遍后悄悄漂移
 * （写错的话命令会跳过去但面板认不出，表现为「点了没反应」）。
 */
export const QUICK_DISCOVER: Array<{ id: string; label: string; hint: string }> = [
  { id: 'macd_golden', label: 'MACD 金叉', hint: '技术转强信号' },
  { id: 'major_force', label: '主力抢筹', hint: '资金异动，关注资金流入' },
  { id: 'over_drop_rebound', label: '超跌反弹', hint: '低位反转信号' },
  { id: 'CompScore', label: '综合评分 TOP', hint: '全市场按综合评分排序' },
]

/**
 * 各分类的日期能力。
 *
 * 来源：**逐个命令真跑一遍**并读 CLI 的报错，不是从 `--help` 读的。
 * `--help` 只打印一份「全命令总览」，会把 strategy/label 的 `--start/--end`
 * 展示在所有子命令的用法旁边，极易误读成「所有命令都支持区间」。
 * 判断某个参数支不支持，唯一可靠办法是真跑一次看它是否报「不支持此参数」。
 *
 * - strategy：支持区间，且**按天分块**，每个命中日各输出一张独立表
 *   （日期在标题行），所以选区间等于「把这几天的信号都看一遍」。
 * - label：支持区间，但只影响取数范围，返回的仍是单张表。
 * - filter / ranking：只接受单日 --date。
 * - event：**完全不接受日期**（连 --date 都会报不支持，只吃 --limit/--offset）。
 */
export const SECTION_DATE_CAPABILITY: Record<
  DiscoverSection,
  'range' | 'single' | 'none'
> = {
  strategy: 'range',
  label: 'range',
  filter: 'single',
  ranking: 'single',
  event: 'none',
  search: 'none',
}

/** 分类是否接受日期参数（区间或单日都算）。 */
export function sectionSupportsDate(section: DiscoverSection): boolean {
  return SECTION_DATE_CAPABILITY[section] !== 'none'
}

/** 分类是否支持日期区间。不支持的分类不该出现区间控件。 */
export function sectionSupportsRange(section: DiscoverSection): boolean {
  return SECTION_DATE_CAPABILITY[section] === 'range'
}

/** 起止日期非法时（只填一端、或结束早于开始）应视为未填，避免发出必然无解的请求。 */
export function isRangeValid(start: string, end: string): boolean {
  if (!start || !end) return false
  return start <= end
}

/** 从分组结构里回查展示名，找不到就退回 id。 */
export function findItemName(groups: CatalogGroup[], id: string): string {
  for (const g of groups) {
    const hit = g.items.find((it) => it.id === id)
    if (hit) return hit.name
  }
  return id
}

// ── 结果表 → 个股研究的桥接 ──────────────────────────────────

/** 交易所前缀 + 6 位数字，如 sh600178 / sz000001 / bj430047。 */
const PREFIXED_CODE = /^(sh|sz|bj)\d{6}$/i
/** 裸 6 位数字，部分命令的 code 列不带前缀。 */
const BARE_CODE = /^\d{6}$/

/**
 * 从一条选股结果里提取股票代码，用于「点结果直接进研究页」。
 *
 * 各命令的表头并不统一，实测：
 *   strategy/label → `| code | name |`，值形如 `sh600178`
 *   ranking       → `| # | 代码 | 名称 | ... |`，值形如 `sh688578`
 *   filter        → `| code | name | PE_TTM | ... |`
 * 所以只能靠「值像不像代码」来认列，不依赖列名。
 *
 * @returns 归一化后的 6 位代码；认不出来时返回 null（该行就不可点）
 */
export function pickRowCode(row: Record<string, string>): string | null {
  for (const value of Object.values(row)) {
    const text = String(value ?? '').trim()
    if (PREFIXED_CODE.test(text)) return text.slice(2)
    if (BARE_CODE.test(text)) return text
  }
  return null
}

export interface ResultPageInfo {
  /** 命中总数，CLI 未给出时为 null。 */
  total: number | null
  /** 当前区间起点（1-based）。 */
  from: number
  /** 当前区间终点。 */
  to: number
}

/**
 * 解析结果区 meta 里的分页信息。
 * CLI 形如：`MACD金叉 (2026-10-02) - 共 187 只 | 显示 1-20/187`
 * 认不出来时给一个「至少已加载这么多」的保守值，让「加载更多」不至于一进来就可用。
 */
export function parseResultPage(meta: string, loadedCount: number): ResultPageInfo {
  const totalMatch = meta.match(/共\s*(\d+)\s*(?:只|条)/)
  const rangeMatch = meta.match(/显示\s*(\d+)\s*[-–]\s*(\d+)\s*\/\s*(\d+)/)
  if (rangeMatch) {
    return {
      total: totalMatch ? Number(totalMatch[1]) : Number(rangeMatch[3]),
      from: Number(rangeMatch[1]),
      to: Number(rangeMatch[2]),
    }
  }
  return { total: totalMatch ? Number(totalMatch[1]) : null, from: 1, to: loadedCount }
}

/** 结果里还有没有下一页。总数未知时保守认为没有，避免发出无意义的请求。 */
export function hasMorePages(page: ResultPageInfo): boolean {
  return page.total !== null && page.to < page.total
}

/** 名称列在各命令里不统一，值也不像代码，只能按「像名字」猜。 */
const NAME_LIKE = /[一-龥A-Za-z]/

/**
 * 取一行的股票名称，用于加入自选（自选列表要显示名字，不能只有代码）。
 * 认不出来时返回空串，调用方自行决定用代码兜底还是跳过。
 */
export function pickRowName(row: Record<string, string>, code: string): string {
  for (const value of Object.values(row)) {
    const text = String(value ?? '').trim()
    if (!text || text === code) continue
    // 跳过代码本身与纯数字列（排名、评分等）
    if (PREFIXED_CODE.test(text) || BARE_CODE.test(text)) continue
    if (NAME_LIKE.test(text) && !/^\d+(\.\d+)?%?$/.test(text)) return text
  }
  return ''
}

