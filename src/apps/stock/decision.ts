import type { FinancialReport, StockNotice, StockResearchSummary } from '@/stores/stock'
import type { TechnicalSnapshot } from './research'

export type DecisionTone = 'bullish' | 'neutral' | 'bearish'

export interface DecisionSummary {
  label: string
  tone: DecisionTone
  score: number
  confidence: '高' | '中' | '低'
  highlights: string[]
  watchItems: string[]
  risks: string[]
  action: string
  dataCoverage: number
  missingData: string[]
}

export interface DecisionContext {
  technical: TechnicalSnapshot | null
  valuation: StockResearchSummary | null
  financial: FinancialReport | null
  technicalPrice: number | null
  technicalVolatility: number | null
  support: number | null
  resistance: number | null
  notices: string[]
  klineLength: number
  financialCount: number
}

const NOTICE_PATTERNS: RegExp[] = [
  /业绩预告|业绩预警|减持|质押|诉讼|问询|问询函|重组|监管|处罚|停牌|退市|重大事项|财务舞弊|审计/,
]

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatPercent = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

const formatPrice = (value: number | null | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '--'
}

export const extractNoticeSignals = (notices: StockNotice[]) => {
  const picked = notices
    .filter((notice) => NOTICE_PATTERNS.some((pattern) => pattern.test(`${notice.category}${notice.title}`)))
    .slice(0, 4)
    .map((notice) => `${notice.category} ${notice.title}`)
  return picked.length ? [...new Set(picked)] : []
}

export function buildResearchDecision(context: DecisionContext): DecisionSummary {
  const {
    technical,
    valuation,
    financial,
    technicalPrice,
    technicalVolatility,
    support,
    resistance,
    notices,
    klineLength,
    financialCount,
  } = context

  let score = 50
  const highlights: string[] = []
  const watchItems: string[] = []
  const risks: string[] = []

  if (technical) {
    if (technical.trend === 'bullish') {
      score += 24
      highlights.push(`技术面偏强：${technical.trendLabel}`)
    } else if (technical.trend === 'bearish') {
      score -= 24
      risks.push(`技术面偏弱：${technical.trendLabel}`)
    } else {
      highlights.push('技术面震荡，需看突破方向')
    }

    if (technical.ma5 !== null && technical.ma10 !== null) {
      if (technical.ma5 >= technical.ma10) {
        score += 6
        highlights.push('MA5 在 MA10 上方，短线偏稳')
      } else {
        risks.push('MA5 下穿 MA10，短线承压')
      }
    }

    if (technical.rsi !== null) {
      if (technical.rsi <= 35) {
        score += 4
        highlights.push(`RSI ${technical.rsi}，短线超卖可博反弹`)
      } else if (technical.rsi >= 75) {
        score -= 8
        risks.push(`RSI ${technical.rsi}，短线有回撤压力`)
      }
    }

    if (technical.macd !== null) {
      if (technical.macd >= 0) {
        score += 6
        highlights.push('MACD 柱体转正，动能偏多')
      } else {
        risks.push('MACD 由正转负，动能偏弱')
      }
    }

    if (technicalVolatility != null) {
      if (technicalVolatility >= 50) risks.push(`近20日波动率 ${technicalVolatility}% ，波动偏大`)
      else if (technicalVolatility <= 25) highlights.push(`近20日波动率 ${technicalVolatility}% ，波动可控`)
    }

    if (technicalPrice != null && support != null && technicalPrice <= support * 1.01) {
      risks.push(`价格接近 20 日支撑 ${support}，建议重点观察`)
      watchItems.push(`有效站稳 ${support}，确认技术底部`)
    }

    if (technicalPrice != null && resistance != null && technicalPrice >= resistance * 0.99 && technicalPrice <= resistance * 1.02) {
      watchItems.push(`放量突破 ${resistance} 后再择机加仓`)
    }
  } else {
    risks.push('技术指标样本不足')
    score -= 8
  }

  if (valuation) {
    const pe = toNumber(valuation.pe)
    const pb = toNumber(valuation.pb)
    const volumeRatio = toNumber(valuation.volumeRatio)

    if (pe != null) {
      if (pe > 0 && pe < 12) {
        highlights.push(`PE ${formatPrice(pe)}，估值压力不高`)
        score += 7
      } else if (pe > 80) {
        risks.push(`PE ${formatPrice(pe)}，估值偏高`)
        score -= 10
      } else if (pe < 0) {
        risks.push('PE 为负，持续性需核实')
        score -= 8
      }
    }

    if (pb != null) {
      if (pb > 0 && pb < 1) {
        highlights.push(`PB ${formatPrice(pb)}，净资产价值偏友好`)
        score += 5
      } else if (pb > 8) {
        risks.push(`PB ${formatPrice(pb)}，估值压力偏高`)
        score -= 4
      }
    }

    if (volumeRatio != null && volumeRatio >= 2.2) {
      watchItems.push(`观察量比是否持续在 ${formatPrice(volumeRatio)} 附近放量`)
    }
  }

  if (financial) {
    const revenueGrowth = toNumber(financial.revenueGrowth)
    const netProfitGrowth = toNumber(financial.netProfitGrowth)
    const roe = toNumber(financial.roe)
    const debtRatio = toNumber(financial.debtRatio)
    const grossMargin = toNumber(financial.grossMargin)

    if (revenueGrowth != null) {
      if (revenueGrowth >= 15) {
        highlights.push(`营收同比 ${formatPercent(revenueGrowth)}`)
        score += 7
      } else if (revenueGrowth <= -10) {
        risks.push(`营收同比 ${formatPercent(revenueGrowth)}`)
        score -= 8
      }
    }

    if (netProfitGrowth != null) {
      if (netProfitGrowth >= 8) {
        highlights.push(`净利同比 ${formatPercent(netProfitGrowth)}`)
        score += 7
      } else if (netProfitGrowth <= -10) {
        risks.push(`净利同比 ${formatPercent(netProfitGrowth)}`)
        score -= 10
      }
    }

    if (roe != null) {
      if (roe >= 12) {
        highlights.push(`ROE ${formatPercent(roe)}`)
        score += 7
      } else if (roe <= 0) {
        risks.push(`ROE ${formatPercent(roe)}，盈利质量偏弱`)
        score -= 8
      }
    }

    if (debtRatio != null) {
      if (debtRatio >= 75) {
        risks.push(`负债率 ${formatPercent(debtRatio)}，杠杆偏高`)
        score -= 12
      } else if (debtRatio <= 45) {
        highlights.push(`负债率 ${formatPercent(debtRatio)}，财务结构较轻`)
        score += 3
      }
    }

    if (grossMargin != null && grossMargin < 10) {
      risks.push(`毛利率 ${formatPercent(grossMargin)}，盈利韧性需警惕`)
      score -= 5
    }
  } else {
    risks.push('财务字段不足')
    score -= 5
  }

  notices.forEach((notice) => {
    watchItems.push(`公告：${notice}`)
    risks.push(`公告核查：${notice}`)
  })

  const coverageWeights = [
    { label: '技术面', has: Boolean(technical), weight: 40 },
    { label: '估值字段', has: Boolean(valuation), weight: 20 },
    { label: '财务报表', has: Boolean(financial), weight: 30 },
    { label: '公告监测', has: notices.length > 0, weight: 10 },
  ]

  const missingData = coverageWeights
    .filter((item) => !item.has)
    .map((item) => item.label)
  const dataCoverage = Math.round(
    coverageWeights
      .filter((item) => item.has)
      .reduce((sum, item) => sum + item.weight, 0),
  )

  score = Math.max(35, Math.min(95, Math.round(score)))

  const signalBaseCount = Number(Boolean(technical)) + Number(Boolean(valuation)) + Number(Boolean(financial))
  const confidence =
    signalBaseCount === 3 && klineLength >= 120 && financialCount > 1 ? '高' : signalBaseCount >= 2 ? '中' : '低'

  const tone: DecisionTone = score >= 68 ? 'bullish' : score <= 38 ? 'bearish' : 'neutral'
  const label = tone === 'bullish' ? '偏多' : tone === 'bearish' ? '偏空' : '中性'

  const action =
    tone === 'bullish'
      ? '若放量站上压力位并站稳，优先等待回踩确认再加权，避免追高。'
      : tone === 'bearish'
        ? '若跌破支撑并放量，建议先降仓；若反弹修复，可转为观察。'
        : '建议维持观察：先看价量是否穿越支撑/压力后再给出更明确操作偏好。'

  return {
    label,
    tone,
    score,
    confidence,
    highlights: [...new Set(highlights)].slice(0, 5),
    watchItems: [...new Set(watchItems)].slice(0, 5),
    risks: [...new Set(risks)].slice(0, 6),
    action,
    dataCoverage,
    missingData,
  }
}
