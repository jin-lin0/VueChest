import type { StockResearchSummary } from '@/stores/stock'
import type { TechnicalSnapshot } from './research'
import { finiteOrNull as toNumber, formatPrice, summaryTimestamp } from './data-quality'
import { marketClock } from './market-time'

export type DecisionTone = 'bullish' | 'neutral' | 'bearish'

export interface DecisionSummary {
  label: string
  tone: DecisionTone
  score: number
  dataAdequacy: '充分' | '部分' | '不足'
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
  technicalPrice: number | null
  technicalVolatility: number | null
  support: number | null
  resistance: number | null
  klineLength: number
  asOfDate?: string
}

export function buildResearchDecision(context: DecisionContext): DecisionSummary {
  const {
    technical,
    valuation,
    technicalPrice,
    technicalVolatility,
    support,
    resistance,
    klineLength,
  } = context
  const asOfDate = context.asOfDate ?? marketClock().date
  const usableTechnical = technical && klineLength >= 20
  const quoteDate = summaryTimestamp(valuation?.asOf).slice(0, 10)
  const quoteAge = quoteDate ? (Date.parse(asOfDate) - Date.parse(quoteDate)) / 86_400_000 : NaN
  const usableValuation = valuation && Number.isFinite(quoteAge) && quoteAge >= 0 && quoteAge <= 7

  let score = 50
  const highlights: string[] = []
  const watchItems: string[] = []
  const risks: string[] = []

  if (usableTechnical && technical) {
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
      if (technical.ma5 > technical.ma10) {
        score += 6
        highlights.push('MA5 在 MA10 上方，短线偏稳')
      } else if (technical.ma5 < technical.ma10) {
        risks.push('MA5 在 MA10 下方，短线承压')
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
      if (technical.macd > 0) {
        score += 6
        highlights.push('MACD 柱值为正，动能偏多')
      } else if (technical.macd < 0) {
        risks.push('MACD 柱值为负，动能偏弱')
      }
    }

    if (technicalVolatility != null) {
      if (technicalVolatility >= 50) risks.push(`近20日波动率 ${technicalVolatility}% ，波动偏大`)
      else if (technicalVolatility <= 25)
        highlights.push(`近20日波动率 ${technicalVolatility}% ，波动可控`)
    }

    if (technicalPrice != null && support != null && technicalPrice <= support * 1.01) {
      risks.push(`价格接近 20 日支撑 ${support}，建议重点观察`)
      watchItems.push(`有效站稳 ${support}，确认技术底部`)
    }

    if (
      technicalPrice != null &&
      resistance != null &&
      technicalPrice >= resistance * 0.99 &&
      technicalPrice <= resistance * 1.02
    ) {
      watchItems.push(`放量突破 ${resistance} 后再择机加仓`)
    }
  } else {
    risks.push('技术指标样本不足')
    score -= 8
  }

  if (usableValuation && valuation) {
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

  const fieldCoverage = (values: unknown[]) =>
    values.filter((value) => toNumber(value) !== null).length / values.length
  const coverageWeights = [
    {
      label: '技术面',
      ratio:
        usableTechnical && technical
          ? fieldCoverage([
              technical.ma5,
              technical.ma10,
              technical.ma20,
              technical.ma60,
              technical.rsi,
              technical.macd,
            ])
          : 0,
      weight: 70,
    },
    {
      label: '估值字段',
      ratio:
        usableValuation && valuation
          ? fieldCoverage([valuation.pe, valuation.pb, valuation.volumeRatio])
          : 0,
      weight: 30,
    },
  ]

  const missingData = coverageWeights
    .filter((item) => item.ratio < 1)
    .map((item) => `${item.label}${item.ratio > 0 ? '（字段不完整）' : ''}`)
  const dataCoverage = Math.round(
    coverageWeights.reduce((sum, item) => sum + item.weight * item.ratio, 0),
  )

  score = Math.max(35, Math.min(95, Math.round(score)))

  const dataAdequacy =
    dataCoverage === 100 && klineLength >= 120 ? '充分' : dataCoverage >= 60 ? '部分' : '不足'

  const tone: DecisionTone =
    dataAdequacy === '不足'
      ? 'neutral'
      : score >= 68
        ? 'bullish'
        : score <= 38
          ? 'bearish'
          : 'neutral'
  const label =
    dataAdequacy === '不足'
      ? '数据不足'
      : tone === 'bullish'
        ? '偏多'
        : tone === 'bearish'
          ? '偏空'
          : '中性'

  const action =
    dataAdequacy === '不足'
      ? '先补充有效且及时的研究数据，再评估规则信号。'
      : tone === 'bullish'
        ? '若放量站上压力位并站稳，优先等待回踩确认再加权，避免追高。'
        : tone === 'bearish'
          ? '若跌破支撑并放量，建议先降仓；若反弹修复，可转为观察。'
          : '建议维持观察：先看价量是否穿越支撑/压力后再给出更明确操作偏好。'

  return {
    label,
    tone,
    score,
    dataAdequacy,
    highlights: [...new Set(highlights)].slice(0, 5),
    watchItems: [...new Set(watchItems)].slice(0, 5),
    risks: [...new Set(risks)].slice(0, 6),
    action,
    dataCoverage,
    missingData,
  }
}
